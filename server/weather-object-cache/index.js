'use strict';
const {createCOS}=require('./cos.cjs'),{createService}=require('./service.cjs');
const allowed=new Set(['https://sunseek-noisy-sole-d5ganycu813519dcc.webapps.tcloudbase.com','http://localhost:4173','http://127.0.0.1:4173']);
let service;
exports.main=async event=>{
 const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v])),origin=headers.origin;
 const output={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...(allowed.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}:{})};
 const respond=(status,body)=>({statusCode:status,headers:output,isBase64Encoded:false,body:JSON.stringify(body)});
 if(origin&&!allowed.has(origin))return respond(403,{error:'Origin not allowed'});
 const method=event.httpMethod||event.requestContext?.http?.method||'GET';if(method==='OPTIONS')return respond(204,{});if(method!=='GET')return respond(405,{error:'GET required'});
 const query=event.queryStringParameters||event.queryString||{};
 if(Object.keys(query).some(k=>k!=='ids')||typeof query.ids!=='string'||query.ids.length>800)return respond(400,{error:'Only known featured IDs accepted'});
 try{
  service||=createService({cos:createCOS(),log:entry=>console.log(JSON.stringify(entry))});
  return respond(200,await service.get(query.ids.split(',')));
 }catch(error){console.log(JSON.stringify({event:'weather-object-error',type:error.status===400?'invalid-request':'storage-unavailable'}));return respond(error.status||503,{error:error.status===400?error.message:'共享天气暂不可用，请稍后重试'});}
};
