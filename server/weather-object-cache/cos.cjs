'use strict';
// Native COS XML calls; no database, PG storage SDK, permanent key, or redirect following.
const https=require('node:https'),{createHash,createHmac}=require('node:crypto');
const encode=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const hmac=(key,value)=>createHmac('sha1',key).update(value).digest('hex');
function signedHeaders(method,url,headers,env=process.env,now=Date.now()){
 const id=env.TENCENTCLOUD_SECRETID,key=env.TENCENTCLOUD_SECRETKEY,token=env.TENCENTCLOUD_SESSIONTOKEN;
 if(!id||!key||!token)throw Error('Temporary function role credentials required');
 const start=Math.floor(now/1000)-5,time=`${start};${start+300}`,all={...headers,host:url.host,'x-cos-security-token':token};
 const keys=Object.keys(all).sort(),query=[...url.searchParams].map(([k,v])=>[encode(k).toLowerCase(),encode(v)]).sort(([a],[b])=>a<b?-1:a>b?1:0);
 const canonical=`${method.toLowerCase()}\n${decodeURIComponent(url.pathname)}\n${query.map(([k,v])=>k+'='+v).join('&')}\n${keys.map(k=>encode(k)+'='+encode(all[k])).join('&')}\n`;
 const text=`sha1\n${time}\n${createHash('sha1').update(canonical).digest('hex')}\n`;
 return {...all,authorization:`q-sign-algorithm=sha1&q-ak=${id}&q-sign-time=${time}&q-key-time=${time}&q-header-list=${keys.join(';')}&q-url-param-list=${query.map(([k])=>k).join(';')}&q-signature=${hmac(hmac(key,time),text)}`};
}
function createCOS({bucket=process.env.SUNSEEK_STATIC_BUCKET,env=process.env,requester=https.request,namespace='v2'}={}){
 if(!/^[a-z0-9][a-z0-9-]*-\d+$/.test(bucket||''))throw Error('Static bucket required');
 if(namespace!=='v2'&&!/^probe-[a-f0-9]{32}$/.test(namespace))throw Error('Invalid cache namespace');
 const isolated=namespace!=='v2';
 const physical=key=>isolated?key.replace('_sunseek-private/weather-v2/','_sunseek-private/weather-'+namespace+'/').replace('sunseek/_weather-shared/v2/','sunseek/_weather-shared/'+namespace+'/'):key;
 const logical=body=>isolated?Buffer.from(body.toString().replaceAll('_sunseek-private/weather-'+namespace+'/','_sunseek-private/weather-v2/').replaceAll('sunseek/_weather-shared/'+namespace+'/','sunseek/_weather-shared/v2/')):body;
 const host=`${bucket}.cos.ap-shanghai.myqcloud.com`;
 return async function request(method,key,{body=Buffer.alloc(0),headers={},query={}}={}){
  if(!['GET','PUT','POST','DELETE'].includes(method)||key&&!/^(?:_sunseek-private\/weather-v2\/ledger\.ndjson|sunseek\/_weather-shared\/v2\/(?:blobs|batches)\/[a-zA-Z0-9/_.-]+)$/.test(key)||key.includes('..'))throw Error('Invalid weather storage target');
  if(!key&&(method!=='GET'||!['sunseek/_weather-shared/v2/blobs/','sunseek/_weather-shared/v2/batches/'].includes(query.prefix)))throw Error('Invalid cache listing');
  if(method==='POST'&&(key!=='_sunseek-private/weather-v2/ledger.ndjson'||Object.keys(query).sort().join(',')!=='append,position'||!/^(0|[1-9]\d*)$/.test(String(query.position))))throw Error('Invalid append operation');
  if(method==='PUT'&&key==='_sunseek-private/weather-v2/ledger.ndjson')throw Error('Ledger can only be appended');
  if(method==='DELETE'&&(!(isolated&&key==='_sunseek-private/weather-v2/ledger.ndjson')&&!key.startsWith('sunseek/_weather-shared/v2/')||key.endsWith('/')))throw Error('Invalid cache cleanup');
  const bytes=Buffer.from(body),url=new URL(`https://${host}/${physical(key)}`);
  for(const [k,v] of Object.entries(query))url.searchParams.set(k,k==='prefix'?physical(v):v);
  const signed=signedHeaders(method,url,{...(['PUT','POST'].includes(method)?{'content-length':String(bytes.length),'content-md5':createHash('md5').update(bytes).digest('base64'),'content-type':'application/octet-stream','cache-control':'no-store'}:{}),...headers},env);
  return new Promise((resolve,reject)=>{
   const req=requester(url,{method,headers:signed,family:4},res=>{
    const chunks=[];let length=0;
    res.on('data',chunk=>{length+=chunk.length;if(length>5*1024*1024)res.destroy(Error('Cache response too large'));else chunks.push(chunk);});
    res.on('error',reject);res.on('end',()=>{const raw=Buffer.concat(chunks),body=!key?logical(raw):raw;resolve({status:res.statusCode,headers:res.headers,body,code:/<Code>([^<]+)<\/Code>/.exec(body.toString())?.[1]});});
   });
   const timeout=setTimeout(()=>req.destroy(Error('Object storage timeout')),3000);
   req.on('error',reject);req.on('close',()=>clearTimeout(timeout));req.end(bytes);
  });
 };
}
module.exports={createCOS,signedHeaders};
