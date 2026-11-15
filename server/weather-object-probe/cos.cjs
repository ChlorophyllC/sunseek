'use strict';
// Direct COS XML API only. This diagnostic never imports the CloudBase PG storage SDK.
const https=require('node:https');
const {createHash,createHmac}=require('node:crypto');
const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const hmac=(key,value)=>createHmac('sha1',key).update(value).digest('hex');
function signedHeaders(method,url,headers,env=process.env,now=Date.now()){
 const id=env.TENCENTCLOUD_SECRETID,key=env.TENCENTCLOUD_SECRETKEY,token=env.TENCENTCLOUD_SESSIONTOKEN;
 if(!id||!key||!token)throw Error('Temporary role credentials required');
 const start=Math.floor(now/1000)-5,time=`${start};${start+300}`;
 const all={...headers,host:url.host,'x-cos-security-token':token};
 const keys=Object.keys(all).sort(),query=[...url.searchParams.entries()].map(([k,v])=>[encode(k).toLowerCase(),encode(v)]).sort(([a],[b])=>a.localeCompare(b));
 const canonical=`${method.toLowerCase()}\n${decodeURIComponent(url.pathname)}\n${query.map(([k,v])=>k+'='+v).join('&')}\n${keys.map(k=>encode(k)+'='+encode(all[k])).join('&')}\n`;
 const message=`sha1\n${time}\n${createHash('sha1').update(canonical).digest('hex')}\n`;
 return {...all,authorization:`q-sign-algorithm=sha1&q-ak=${id}&q-sign-time=${time}&q-key-time=${time}&q-header-list=${keys.join(';')}&q-url-param-list=${query.map(([k])=>k).join(';')}&q-signature=${hmac(hmac(key,time),message)}`};
}
function createClient({bucket,region,prefix,env=process.env,requester=https.request}){
 if(!/^[a-z0-9][a-z0-9-]*-\d+$/.test(bucket)||region!=='ap-shanghai'||!/^sunseek\/_weather-storage-probe\/[a-f0-9]{32}\/$/.test(prefix))throw Error('Unsafe diagnostic target');
 return async function request(method,name,body='',query=''){
  if(!['PUT','GET','DELETE','POST'].includes(method)||!/^probe(?:-lock|-append)?\.json$/.test(name)||query&&!/^(?:versionId=[A-Za-z0-9%._~-]+|append=&position=0)$/.test(query)||(method==='POST'&&(name!=='probe-append.json'||query!=='append=&position=0')))throw Error('Unsafe diagnostic operation');
  const bytes=Buffer.from(body),url=new URL(`https://${bucket}.cos.${region}.myqcloud.com/${prefix}${name}${query?'?'+query:''}`);
  const headers=signedHeaders(method,url,['PUT','POST'].includes(method)?{'content-length':String(bytes.length),'content-md5':createHash('md5').update(bytes).digest('base64'),'content-type':'application/json','cache-control':'no-store',...(method==='PUT'?{'x-cos-forbid-overwrite':'true'}:{})}:{},env);
  return new Promise((resolve,reject)=>{
   const start=Date.now(),req=requester(url,{method,headers,family:4},res=>{
    const chunks=[];let length=0;
    res.on('data',chunk=>{length+=chunk.length;if(length>65536)res.destroy(Error('Diagnostic response too large'));else chunks.push(chunk);});
    res.on('error',reject);res.on('end',()=>{const body=Buffer.concat(chunks).toString();resolve({status:res.statusCode,headers:res.headers,body,elapsedMs:Date.now()-start,errorCode:/<Code>([^<]+)<\/Code>/.exec(body)?.[1]});});
   });
   const timeout=setTimeout(()=>req.destroy(Error('COS diagnostic timeout')),5000);
   req.on('error',reject);req.on('close',()=>clearTimeout(timeout));req.end(bytes);
  });
 };
}
module.exports={createClient,signedHeaders};
