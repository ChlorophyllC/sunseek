'use strict';
const allowedOrigins=new Set(['https://sunseek-noisy-sole-d5ganycu813519dcc.webapps.tcloudbase.com','http://localhost:4173','http://127.0.0.1:4173']);
let service;
exports.main=async event=>{
 const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
 const origin=headers.origin;
 const responseHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',
  ...(allowedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}:{})};
 const respond=(status,body)=>({statusCode:status,headers:responseHeaders,isBase64Encoded:false,body:JSON.stringify(body)});
 if(origin&&!allowedOrigins.has(origin))return respond(403,{error:'Origin not allowed'});
 const method=event.httpMethod||event.requestContext?.http?.method||'GET';
 if(method==='OPTIONS')return respond(204,{});
 if(method!=='GET')return respond(405,{error:'GET required'});
 // Retired experiment: reject even a direct SDK/URL invocation before loading PG.
 if(process.env.SUNSEEK_PG_CACHE_ENABLED!=='true')return respond(410,{code:'PG_CACHE_DISABLED',error:'PG weather cache is disabled'});
 const query=event.queryStringParameters||event.queryString||{};
 if(Object.keys(query).some(k=>k!=='ids')||typeof query.ids!=='string'||query.ids.length>1600)return respond(400,{error:'Only known place IDs accepted'});
 try{
  const {makeService}=require('./core.cjs'),{createStore}=require('./tcb.cjs');
  service||=makeService({store:createStore(),coverage:process.env.SUNSEEK_COVERAGE||'featured',log:entry=>console.log(JSON.stringify(entry))});
  const result=await service.get(query.ids.split(','));
  // HTTP caches must not retain pending/errors; fresh data is bounded by the oldest point expiry.
  if(result.items.every(i=>i.status==='fresh'))responseHeaders['Cache-Control']='public, max-age=0, s-maxage='+Math.min(300,Math.max(0,Math.floor((Math.min(...result.items.map(i=>i.expiresAt))-Date.now())/1000)));
  return respond(200,result);
 }catch(error){return respond(error.status||503,{error:error.status===400?error.message:'共享天气服务暂不可用，请稍后重试'});}
};
