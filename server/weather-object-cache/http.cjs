'use strict';
const https=require('node:https'),{gunzipSync}=require('node:zlib');
function createTransport({getter=https.get,agent=new https.Agent({keepAlive:true,maxSockets:2,maxFreeSockets:2,scheduling:'lifo'}),connectTimeout=4000}={}){
 function attempt(url,{signal}={}){return new Promise((resolve,reject)=>{
  let connected=false,connectTimer;
  const request=getter(url,{family:4,signal,agent,headers:{Accept:'application/json','Accept-Encoding':'gzip'}},response=>{
   connected=true;const chunks=[];let size=0;
   response.on('data',chunk=>{size+=chunk.length;if(size>8*1024*1024)request.destroy(Error('Upstream payload too large'));else chunks.push(chunk);});
   response.on('error',reject);response.on('end',()=>{
    try{let body=Buffer.concat(chunks);if(response.headers['content-encoding']==='gzip')body=gunzipSync(body,{maxOutputLength:8*1024*1024});
     resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode,headers:{get:name=>response.headers[name.toLowerCase()]},json:async()=>JSON.parse(body.toString('utf8'))});
    }catch(error){reject(error);}
   });
  });
  request.on('socket',socket=>{
   if(!socket.connecting){connected=true;return;}
   connectTimer=setTimeout(()=>request.destroy(Object.assign(Error('Weather connect timeout'),{code:'ETIMEDOUT'})),connectTimeout);
   socket.once('secureConnect',()=>{connected=true;clearTimeout(connectTimer);});
  });
  request.on('close',()=>clearTimeout(connectTimer));
  request.on('error',error=>{error.beforeConnect=!connected;reject(error);});
 });}
 return async function fetchForecast(url,options={}){
  for(let i=0;i<3;i++){
   try{return await attempt(url,options);}
   catch(error){if(options.signal?.aborted||i===2||!error.beforeConnect||!['ETIMEDOUT','ECONNRESET','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH'].includes(error.code))throw error;}
  }
 };
}
module.exports={createTransport,fetchForecast:createTransport()};
