'use strict';
window.SunseekObjectWeatherClient=(()=>{
 const HOUR=3600000;
 function configuration(){return window.SUNSEEK_OBJECT_WEATHER_SERVICE||{enabled:false,ids:[]};}
 const dateAt=clock=>new Date(clock+8*HOUR).toISOString().slice(0,10);
 async function keyFor(ids,contract){const bytes=new TextEncoder().encode(contract+'\n'+[...new Set(ids)].sort().join(','));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
 async function read(url,signal,timeout=2500){
  if(signal.aborted)throw Error('查询已取消');
  const controller=new AbortController(),cancel=()=>controller.abort();signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(cancel,timeout);
  try{const response=await fetch(url,{signal:controller.signal,credentials:'omit'});if(!response.ok){const error=Error('共享天气暂不可用，请稍后重试');error.status=response.status;throw error;}return await response.arrayBuffer();}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
 }
 function validate(payload,ids,config){
  if(payload?.version!==1||payload.contract!==config.contract||!Array.isArray(payload.items)||payload.items.length!==ids.length||new Set(payload.items.map(i=>i.cityId)).size!==ids.length||payload.items.some(i=>!ids.includes(i.cityId)))throw Error('共享天气响应不完整');
  for(const item of payload.items){
   if(['fresh','stale'].includes(item.status)){
    const age=Date.now()-item.fetchedAt;
    if(!Number.isFinite(item.fetchedAt)||age< -5000||age>=6*HOUR||item.expiresAt!==item.fetchedAt+HOUR||!item.forecast||item.status==='fresh'&&(age>=HOUR||item.forecast.daily?.time?.[0]!==dateAt(Date.now())))throw Error('共享天气时间无效');
   }else if(!['pending','error'].includes(item.status))throw Error('共享天气状态无效');
  }
  return payload.items;
 }
 async function cached(ids,config,signal){
  if(typeof DecompressionStream!=='function'||!crypto.subtle)return null;
  const key=await keyFor(ids,config.contract),hour=Math.floor(Date.now()/HOUR);
  for(const slot of [hour,hour-1]){
   if(signal.aborted)throw Error('查询已取消');
   try{
    const url=new URL(`${config.cacheBase}/${config.contract}/${key}/${slot}.json.gz`,location.href),bytes=new Uint8Array(await read(url,signal));
    const payload=bytes[0]===31&&bytes[1]===139?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json():JSON.parse(new TextDecoder().decode(bytes));
    const items=validate(payload,ids,config);
    if(payload.baseDate===dateAt(Date.now())&&items.every(i=>i.status==='fresh'))return items;
   }catch(error){if(signal.aborted)throw error;}
  }
  return null;
 }
 function wait(ms,signal){return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(Error('查询已取消'));return;}
  const cancel=()=>{clearTimeout(timer);reject(Error('查询已取消'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});
 });}
 async function request(input,signal){
  const config=configuration(),ids=[...new Set(input)].sort();
  if(!config.enabled||!ids.length||ids.length>16||ids.some(id=>!config.ids.includes(id)))throw Error('共享天气范围无效');
  const ready=await cached(ids,config,signal);if(ready){const byID=new Map(ready.map(i=>[i.cityId,i]));return input.map(id=>byID.get(id));}
  const result=new Map();let pending=ids;
  for(let attempt=0;attempt<8&&pending.length;attempt++){
   const url=new URL(config.endpoint,location.href);url.searchParams.set('ids',pending.join(','));
   const bytes=await read(url,signal,25000),items=validate(JSON.parse(new TextDecoder().decode(bytes)),pending,config),next=[];
   for(const item of items){if(item.status==='pending')next.push(item.cityId);else result.set(item.cityId,item);}
   pending=next;if(pending.length&&attempt<7)await wait(3000,signal);
  }
  for(const id of pending)result.set(id,{cityId:id,status:'error',reason:'updating'});
  return input.map(id=>result.get(id));
 }
 return Object.freeze({configuration,keyFor,validate,request});
})();
