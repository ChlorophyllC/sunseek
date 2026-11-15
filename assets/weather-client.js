'use strict';
// Experimental public cache transport. Default queries use browser-local caching and direct weather requests.
window.SunseekWeatherClient=(()=>{
 const DEFAULT_ENDPOINT='https://1330730699-86nlrqp1le.ap-shanghai.tencentscf.com/api/weather';
 function configuration(){return window.SUNSEEK_WEATHER_SERVICE||{enabled:false,endpoint:DEFAULT_ENDPOINT};}
 function delay(ms,signal){return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new Error('查询已取消'));return;}
  const cancel=()=>{clearTimeout(timer);reject(new Error('查询已取消'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);
  signal.addEventListener('abort',cancel,{once:true});
 });}
 async function request(ids,signal){
  const config=configuration(),result=new Map();let pending=[...new Set(ids)];
  for(let attempt=0;pending.length&&attempt<10;attempt++){
   if(signal.aborted)throw new Error('查询已取消');
   const controller=new AbortController(),cancel=()=>controller.abort();signal.addEventListener('abort',cancel,{once:true});
   const timer=setTimeout(cancel,30000);let payload;
   try{
    const url=new URL(config.endpoint,location.href);url.searchParams.set('ids',[...pending].sort().join(','));
    const response=await fetch(url,{signal:controller.signal,credentials:'omit'});
    if(!response.ok)throw new Error('共享天气服务暂不可用，请稍后重试');
    payload=await response.json();
   }catch(error){throw new Error(signal.aborted?'查询已取消':error.message==='Failed to fetch'?'共享天气连接未成功，请稍后重试':error.message);}
   finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
   if(payload?.version!==1||!Array.isArray(payload.items)||payload.items.length!==pending.length||new Set(payload.items.map(i=>i.cityId)).size!==pending.length||payload.items.some(i=>!pending.includes(i.cityId)))throw new Error('共享天气响应不完整');
   const next=[];let wait=3;
   for(const item of payload.items){
    if(item.status==='pending'){next.push(item.cityId);wait=Math.max(wait,Math.min(5,item.retryAfter||3));continue;}
    if(['fresh','stale'].includes(item.status)){
     const age=Date.now()-item.fetchedAt;
     if(!Number.isFinite(item.fetchedAt)||age< -5000||age>=6*3600000||item.expiresAt!==item.fetchedAt+3600000||!item.forecast||item.status==='fresh'&&age>=3600000)throw new Error('共享天气时间无效');
    }else if(item.status!=='error')throw new Error('共享天气状态无效');
    result.set(item.cityId,item);
   }
   pending=next;if(pending.length&&attempt<9)await delay(wait*1000,signal);
  }
  for(const id of pending)result.set(id,{cityId:id,status:'error',reason:'updating'});
  return ids.map(id=>result.get(id));
 }
 return Object.freeze({configuration,request});
})();
