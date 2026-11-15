'use strict';
const {PROFILE,baseDate}=require('../server/weather-object-cache/profile.cjs');
function forecast(clock,value=20){
 const date=baseDate(clock),days=Array.from({length:16},(_,i)=>new Date(Date.parse(date+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 return {timezone:'Asia/Shanghai',daily:{time:days,...Object.fromEntries(PROFILE.daily.split(',').map(k=>[k,Array(16).fill(value)]))},hourly:{time:days.flatMap(d=>Array.from({length:24},(_,h)=>`${d}T${String(h).padStart(2,'0')}:00`)),...Object.fromEntries(PROFILE.hourly.split(',').map(k=>[k,Array(384).fill(k==='is_day'?1:value)]))}};
}
function memoryCOS(){
 const files=new Map(),operations=[];let lostAck=false;
 async function cos(method,key,options={}){
  operations.push({method,key,options});
  if(method==='GET'&&!key)return {status:200,headers:{},body:Buffer.from('<ListBucketResult/>')};
  if(method==='GET'){
   const value=files.get(key);if(!value)return {status:404,headers:{},body:Buffer.alloc(0)};
   const range=/bytes=-(\d+)/.exec(options.headers?.range||'');
   if(range){const start=Math.max(0,value.length-Number(range[1]));return {status:206,headers:{'content-range':`bytes ${start}-${value.length-1}/${value.length}`},body:value.subarray(start)};}
   return {status:200,headers:{},body:value};
  }
  if(method==='POST'){
   const old=files.get(key)||Buffer.alloc(0),position=Number(options.query.position);
   if(old.length!==position)return {status:409,code:'AppendPositionErr',headers:{},body:Buffer.alloc(0)};
   files.set(key,Buffer.concat([old,options.body]));
   if(lostAck){lostAck=false;throw Error('Acknowledgement lost');}
   return {status:200,headers:{'x-cos-next-append-position':String(files.get(key).length)},body:Buffer.alloc(0)};
  }
  if(method==='PUT'){files.set(key,Buffer.from(options.body));return {status:200,headers:{},body:Buffer.alloc(0)};}
  if(method==='DELETE'){files.delete(key);return {status:204,headers:{},body:Buffer.alloc(0)};}
  throw Error('Unexpected storage method');
 }
 return {cos,files,operations,loseNextAck:()=>{lostAck=true;}};
}
module.exports={forecast,memoryCOS};
