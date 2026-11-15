'use strict';
const {randomUUID}=require('node:crypto');
const HOUR=3600000,DAY=24*HOUR,LEASE=45000;
const KEY='_sunseek-private/weather-v2/ledger.ndjson';
const MAX_LOG=256*1024*1024,MAX_TAIL=4*1024*1024;
function replay(events,clock){
 const state={points:new Map(),usage:[],pauseUntil:0,lastAt:0};
 for(const e of events){
  if(e.at>clock+5000)throw Error('Cache clock is ahead of this worker');
  state.lastAt=Math.max(state.lastAt,e.at);
  if(e.at<clock-DAY-60000)continue;
  if(e.type==='claim'){
   state.usage.push({at:e.at,units:e.points.length*2});
   for(const p of e.points){const prior=state.points.get(p.id)||{};state.points.set(p.id,{...prior,lease:{owner:e.owner,until:e.at+LEASE,profile:p.profile,date:e.date}});}
  }else if(e.type==='charge'){
   state.usage.push({at:e.at,units:e.points.length*2});
  }else if(e.type==='ready'){
   for(const p of e.items){const prior=state.points.get(p.id)||{};
    if(prior.lease?.owner===e.owner&&prior.lease.until>e.at)state.points.set(p.id,{...p,lease:null,retryAt:0,reason:null});
   }
  }else if(e.type==='fail'){
   for(const id of e.ids){const prior=state.points.get(id)||{};if(prior.lease?.owner===e.owner)state.points.set(id,{...prior,lease:null,retryAt:e.retryAt,reason:e.reason});}
   if(e.reason==='rate-limited')state.pauseUntil=Math.max(state.pauseUntil,e.retryAt);
  }else throw Error('Unknown cache ledger record');
 }
 return state;
}
function createLedger({cos,now=Date.now,maxLog=MAX_LOG}){
 async function read(){
  const clock=now();
  for(let length=65536;length<=MAX_TAIL;length*=2){
   const response=await cos('GET',KEY,{headers:{range:`bytes=-${length}`}});
   if(response.status===404)return {revision:0,events:[],state:replay([],clock)};
   if(![200,206].includes(response.status))throw Error('Cache ledger read failed');
   const range=/bytes (\d+)-(\d+)\/(\d+)/.exec(response.headers['content-range']||'');
   if(response.status===206&&!range)throw Error('Invalid ledger range');
   const start=range?Number(range[1]):0,revision=range?Number(range[3]):response.body.length;
   let text=response.body.toString('utf8');if(start)text=text.slice(text.indexOf('\n')+1);
   if(text&&!text.endsWith('\n'))throw Error('Incomplete ledger record');
   const events=text.trim()?text.trimEnd().split('\n').map(line=>JSON.parse(line)):[];
   if(events.some(e=>!Number.isFinite(e.at)||!e.op||e.at<0))throw Error('Invalid ledger record');
   if(start&&(!events.length||events[0].at>clock-DAY-60000))continue;
   return {revision,events,state:replay(events,clock)};
  }
  throw Error('Cache ledger safety read limit reached');
 }
 async function mutate(reduce){
  const op=randomUUID();
  for(let attempt=0;attempt<6;attempt++){
   const snapshot=await read(),at=Math.max(now(),snapshot.state.lastAt),change=reduce(snapshot.state,at);
   if(!change.event)return change.result;
   const event={...change.event,op,at},body=Buffer.from(JSON.stringify(event)+'\n');
   if(snapshot.revision+body.length>maxLog)throw Error('Cache ledger maintenance required');
   let response;
   try{response=await cos('POST',KEY,{body,headers:{'content-type':'application/x-ndjson'},query:{append:'',position:snapshot.revision}});}
   catch(error){
    // An acknowledgement can be lost after a successful append; never reserve twice.
    const recovered=await read();if(recovered.events.some(e=>e.op===op))return change.result;
    throw error;
   }
   if(response.status===200)return change.result;
   if(response.status===409&&['AppendPositionErr','PositionNotEqualToLength','PathConflict'].includes(response.code))continue;
   throw Error('Cache ledger append failed');
  }
  throw Error('Cache ledger is busy');
 }
 return {read,mutate};
}
module.exports={createLedger,replay,LEASE,HOUR,DAY,KEY,MAX_LOG};
