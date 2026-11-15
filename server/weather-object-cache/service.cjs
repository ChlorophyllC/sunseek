'use strict';
const {randomUUID}=require('node:crypto'),{gzipSync,gunzipSync}=require('node:zlib');
const {CATALOG,PROFILE,CONTRACT,HOUR,MAX_AGE,baseDate,profileFor,batchKey,validForecast}=require('./profile.cjs');
const {createLedger,DAY}=require('./ledger.cjs');
const ROOT='sunseek/_weather-shared/v2/';
const LIMITS=[[60000,400],[HOUR,4000],[DAY,8000]];
const paused=(reason='updating',retryAt=0)=>({reason,retryAt});
function createService({cos,fetcher=require('./http.cjs').fetchForecast,now=Date.now,log=()=>{},limits=LIMITS}={}){
 const ledger=createLedger({cos,now}),cities=new Map(CATALOG.map(c=>[c.id,c])),hot=new Map();
 function fresh(row,city,date,clock){return row?.profile===profileFor(city)&&row.date===date&&Number.isFinite(row.fetchedAt)&&row.fetchedAt<=clock+5000&&clock-row.fetchedAt<HOUR;}
 async function claim(ids,owner,date){
  return ledger.mutate((state,clock)=>{
   const rows=ids.map(id=>({id,...state.points.get(id)})),missing=rows.filter(r=>!fresh(r,cities.get(r.id),date,clock));
   const eligible=missing.filter(r=>!(r.lease?.until>clock)&&!(r.retryAt>clock));
   if(state.pauseUntil>clock){for(const r of missing)Object.assign(r,{...paused('rate-limited',state.pauseUntil),lease:null,claimed:false});return {result:rows};}
   const units=eligible.length*2;
   if(units&&limits.some(([window,limit])=>state.usage.reduce((sum,e)=>sum+(e.at>clock-window?e.units:0),0)+units>limit)){
    for(const r of eligible)Object.assign(r,paused('rate-limited',clock+61000));return {result:rows};
   }
   if(!eligible.length)return {result:rows};
   const points=eligible.map(r=>({id:r.id,profile:profileFor(cities.get(r.id))}));
   for(const r of eligible)r.claimed=true;
   return {event:{type:'claim',owner,date,points},result:rows};
  });
 }
 async function fail(owner,ids,reason,cooldown){
  return ledger.mutate((state,clock)=>{
   const selected=ids.filter(id=>state.points.get(id)?.lease?.owner===owner);
   if(!selected.length&&reason!=='rate-limited')return {result:null};
   return {event:{type:'fail',owner,ids:selected,reason,retryAt:clock+cooldown*1000},result:null};
  });
 }
 async function reserveRetry(owner,points){
  return ledger.mutate((state,clock)=>{
   if(state.pauseUntil>clock)return {result:'rate-limited'};
   if(points.some(p=>state.points.get(p.id)?.lease?.owner!==owner||state.points.get(p.id)?.lease?.until<=clock))return {result:'updating'};
   const units=points.length*2;
   if(limits.some(([window,limit])=>state.usage.reduce((sum,e)=>sum+(e.at>clock-window?e.units:0),0)+units>limit))return {result:'rate-limited'};
   return {event:{type:'charge',owner,points:points.map(p=>({id:p.id}))},result:null};
  });
 }
 async function publish(ids,result){
  if(!result.items.every(i=>i.status==='fresh'))return;
  const clock=now(),body=gzipSync(Buffer.from(JSON.stringify(result))),key=`${ROOT}batches/${CONTRACT}/${batchKey(ids)}/${Math.floor(clock/HOUR)}.json.gz`;
  const response=await cos('PUT',key,{body,headers:{'cache-control':'public, max-age=60, s-maxage=300','content-type':'application/gzip'}});
  if(response.status!==200)throw Error('Public weather cache publish failed');
 }
 async function cleanup(){
  // Only bounded, demand-triggered cleanup. The ledger is never deleted or rewritten.
  for(const prefix of [ROOT+'blobs/',ROOT+'batches/']){
   try{
    const listing=await cos('GET','',{query:{prefix,'max-keys':'30'}});if(listing.status!==200)continue;
    const objects=[...listing.body.toString().matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([,row])=>({key:/<Key>([^<]+)<\/Key>/.exec(row)?.[1],time:Date.parse(/<LastModified>([^<]+)<\/LastModified>/.exec(row)?.[1])}));
    const old=objects.filter(o=>o.key?.startsWith(prefix)&&/^[a-zA-Z0-9/_.-]+$/.test(o.key)&&now()-o.time>7*HOUR).slice(0,2);
    await Promise.allSettled(old.map(o=>cos('DELETE',o.key)));
   }catch{log({event:'weather-cleanup-deferred'});}
  }
 }
 return {ledger,async get(input){
  if(!Array.isArray(input)||!input.length||input.length>16||input.some(id=>!cities.has(id))){const error=Error('Only up to 16 featured IDs accepted');error.status=400;throw error;}
  const ids=[...new Set(input)].sort(),clock=now(),date=baseDate(clock),owner=randomUUID(),result=new Map();
  const started=Date.now();
  let upstreamPoints=0;const upstreamFailures=[];
  for(const id of ids){const row=hot.get(id);if(row&&row.date===date&&clock-row.fetchedAt<HOUR)result.set(id,row.item);}
  const needed=ids.filter(id=>!result.has(id));
  const rows=needed.length?await claim(needed,owner,date):[],byID=new Map(rows.map(r=>[r.id,r]));
  const claimed=rows.filter(r=>r.claimed),valid=[],errors=[];
  if(claimed.length){
   const groups=[];for(let i=0;i<claimed.length;i+=4)groups.push(claimed.slice(i,i+4));
   const deadline=Date.now()+18000;let localPause=false,index=0;
   const run=async group=>{
    const params=new URLSearchParams({...PROFILE,latitude:group.map(r=>cities.get(r.id).lat).join(','),longitude:group.map(r=>cities.get(r.id).lon).join(',')});
    for(let attempt=0;attempt<2;attempt++){
     const remaining=Math.min(9000,deadline-Date.now());
     if(remaining<500)return {group,reason:'upstream-unavailable',cooldown:60};
     if(localPause)return {group,reason:'rate-limited',cooldown:180};
     if(attempt){const blocked=await reserveRetry(owner,group);if(blocked)return {group,reason:blocked,cooldown:60};}
     try{
      const timeout=Math.min(9000,deadline-Date.now());if(timeout<500)return {group,reason:'upstream-unavailable',cooldown:60};
      upstreamPoints+=group.length;
      const response=await fetcher(`https://api.open-meteo.com/v1/forecast?${params}`,{signal:AbortSignal.timeout(timeout)});
      if(!response.ok){
       upstreamFailures.push({points:group.length,status:response.status,attempt:attempt+1});
       if(response.status===429){
        localPause=true;const retry=response.headers?.get('retry-after'),seconds=Number(retry)||(Date.parse(retry)-now())/1000;
        const cooldown=Math.min(86400,Math.max(60,Number.isFinite(seconds)?seconds:180));await fail(owner,group.map(p=>p.id),'rate-limited',cooldown);
        return {group,reason:'rate-limited',cooldown};
       }
       if(response.status<500||attempt===1)return {group,reason:'upstream-unavailable',cooldown:60};
       continue;
      }
      const data=await response.json(),list=Array.isArray(data)?data:[data],fetchedAt=now();
      if(list.length!==group.length)return {group,reason:'invalid-forecast',cooldown:60};
      return {group,list,fetchedAt};
     }catch(error){
      const failure={points:group.length,code:error.code||error.name,beforeConnect:!!error.beforeConnect,attempt:attempt+1};upstreamFailures.push(failure);log({event:'weather-upstream-failed',...failure});
      if(attempt===1)return {group,reason:'upstream-unavailable',cooldown:60};
     }
    }
   };
   const outcomes=new Array(groups.length);
   await Promise.all(Array.from({length:Math.min(2,groups.length)},async()=>{while(index<groups.length){const slot=index++;outcomes[slot]=await run(groups[slot]);}}));
   for(const outcome of outcomes){
    const {group,list,fetchedAt}=outcome;
    for(let i=0;i<group.length;i++){
     const id=group[i].id;
     if(list&&validForecast(list[i],date)&&date===baseDate(fetchedAt))valid.push({id,profile:profileFor(cities.get(id)),date,fetchedAt,forecast:list[i]});
     else errors.push({id,reason:outcome.reason||'invalid-forecast',cooldown:outcome.cooldown||60});
    }
   }
   // Persist the quota pause before accepting another worker's reservation.
   for(const reason of ['rate-limited','upstream-unavailable','invalid-forecast']){
    const group=errors.filter(e=>e.reason===reason);if(!group.length)continue;
    const cooldown=Math.max(...group.map(e=>e.cooldown));await fail(owner,group.map(e=>e.id),reason,cooldown);
    for(const e of group)Object.assign(byID.get(e.id),{lease:null,claimed:false,reason,retryAt:now()+cooldown*1000});
   }
   if(valid.length){
    const blob=`${ROOT}blobs/${new Date(now()).toISOString().slice(0,10).replaceAll('-','')}/${owner}.json.gz`;
    const stored=await cos('PUT',blob,{body:gzipSync(Buffer.from(JSON.stringify({contract:CONTRACT,items:valid}))),headers:{'content-type':'application/gzip'}});
    if(stored.status!==200)throw Error('Weather object save failed');
    let accepted=[];
    try{
     accepted=await ledger.mutate((state,at)=>{
      const items=valid.filter(v=>{const lease=state.points.get(v.id)?.lease;return lease?.owner===owner&&lease.until>at&&lease.profile===v.profile&&lease.date===v.date&&baseDate(at)===date;}).map(({forecast,...item})=>({...item,blob}));
      return items.length?{event:{type:'ready',owner,items},result:items}:{result:[]};
     });
    }finally{
     if(!accepted.length)try{await cos('DELETE',blob);}catch{log({event:'weather-orphan-cleanup-deferred'});}
    }
    for(const row of accepted){const forecast=valid.find(v=>v.id===row.id).forecast;byID.set(row.id,{...row,forecast});}
    for(const row of valid.filter(v=>!accepted.some(a=>a.id===v.id)))Object.assign(byID.get(row.id),{claimed:false,reason:'updating',lease:{until:now()+3000}});
   }
  }
  const blobs=new Map();
  const loads=[...new Set([...byID.values()].filter(r=>!r.forecast&&r.blob&&r.profile===profileFor(cities.get(r.id))&&clock-r.fetchedAt<MAX_AGE).map(r=>r.blob))];
  await Promise.all(loads.map(async key=>{
   const response=await cos('GET',key);if(response.status===404)return;if(response.status!==200)throw Error('Weather object read failed');
   const data=JSON.parse(gunzipSync(response.body,{maxOutputLength:8*1024*1024}).toString());
   if(data.contract!==CONTRACT||!Array.isArray(data.items))throw Error('Weather object contract mismatch');
   blobs.set(key,new Map(data.items.map(item=>[item.id,item])));
  }));
  for(const [id,row] of byID){
   const saved=blobs.get(row.blob)?.get(id),raw=row.forecast||saved?.forecast;
   const identity=row.profile===profileFor(cities.get(id)),usable=identity&&Number.isFinite(row.fetchedAt)&&row.fetchedAt<=now()+5000&&now()-row.fetchedAt<MAX_AGE&&raw&&validForecast(raw,row.date);
   if(saved&&(saved.profile!==row.profile||saved.fetchedAt!==row.fetchedAt||saved.date!==row.date))throw Error('Weather object identity mismatch');
   const isFresh=usable&&fresh(row,cities.get(id),baseDate(now()),now());
   const status=isFresh?'fresh':usable?'stale':row.lease?.until>now()||row.claimed?'pending':'error';
   const item={cityId:id,status,...(usable?{forecast:raw,fetchedAt:row.fetchedAt,expiresAt:row.fetchedAt+HOUR}:{}),...(!isFresh?{reason:row.reason||'updating',retryAfter:Math.min(3600,Math.max(3,Math.ceil(((row.retryAt||row.lease?.until||0)-now())/1000)))}:{})};
   result.set(id,item);if(isFresh)hot.set(id,{date:row.date,fetchedAt:row.fetchedAt,item});
  }
  const response={version:1,contract:CONTRACT,baseDate:baseDate(now()),items:ids.map(id=>result.get(id)),upstreamPoints,upstreamFailures};
  try{await publish(ids,response);}catch{log({event:'weather-public-cache-deferred'});}
  if(claimed.length&&Date.now()-started<10000)await cleanup();
  log({event:'weather-object-response',points:ids.length,upstreamPoints,fresh:response.items.filter(i=>i.status==='fresh').length});
  return response;
 }};
}
module.exports={createService,LIMITS,ROOT};
