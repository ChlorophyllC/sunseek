'use strict';
// Native TC3 signing with the event function's short-lived role credentials.
// No permanent API key, database password, SDK bundle or browser admin credential.
const {createHash,createHmac}=require('node:crypto');
const hash=s=>createHash('sha256').update(s).digest('hex');
const hmac=(key,s,encoding)=>createHmac('sha256',key).update(s).digest(encoding);
function signedHeaders(body,env=process.env,now=Date.now()){
 const id=env.TENCENTCLOUD_SECRETID,key=env.TENCENTCLOUD_SECRETKEY;
 if(!id||!key)throw Error('Cloud function role credentials unavailable');
 const timestamp=Math.floor(now/1000),date=new Date(now).toISOString().slice(0,10);
 const canonical=`POST\n/\n\ncontent-type:application/json\nhost:tcb.tencentcloudapi.com\n\ncontent-type;host\n${hash(body)}`;
 const scope=`${date}/tcb/tc3_request`,toSign=`TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`;
 const signingKey=hmac(hmac(hmac('TC3'+key,date),'tcb'),'tc3_request');
 return {'Content-Type':'application/json','X-TC-Action':'ExecutePGSql','X-TC-Version':'2018-06-08',
  'X-TC-Region':env.TENCENTCLOUD_REGION||'ap-shanghai','X-TC-Timestamp':String(timestamp),
  ...(env.TENCENTCLOUD_SESSIONTOKEN?{'X-TC-Token':env.TENCENTCLOUD_SESSIONTOKEN}:{}),
  Authorization:`TC3-HMAC-SHA256 Credential=${id}/${scope}, SignedHeaders=content-type;host, Signature=${hmac(signingKey,toSign,'hex')}`};
}
async function execute(sql,{env=process.env,fetcher=fetch}={}){
 const body=JSON.stringify({EnvId:env.SUNSEEK_ENV_ID||env.TCB_ENVID,Sql:sql});
 const response=await fetcher('https://tcb.tencentcloudapi.com/',{method:'POST',headers:signedHeaders(body,env),body,signal:AbortSignal.timeout(4500)});
 const result=(await response.json()).Response;
 if(!response.ok||!result||result.Error)throw Error(result?.Error?.Code||'Cache database unavailable');
 return (result.Rows||[]).map(row=>JSON.parse(row)).map(row=>row.map((cell,i)=>result.ColumnTypes?.[i]==='jsonb'?JSON.parse(cell):cell));
}
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
function createStore(executor=execute){return {
 async claim(points,owner,date){const rows=await executor(`SELECT public.sunseek_weather_claim(${literal(points)},'${owner}','${date}')`);return rows[0][0];},
 async finish(owner,items,date){const rows=await executor(`SELECT public.sunseek_weather_finish('${owner}',${literal(items)},'${date}')`);return rows[0][0];},
 async fail(owner,ids,reason,cooldown){await executor(`SELECT public.sunseek_weather_fail('${owner}',${literal(ids)},'${reason}',${Math.ceil(cooldown)})`);}
};}
module.exports={signedHeaders,execute,createStore};
