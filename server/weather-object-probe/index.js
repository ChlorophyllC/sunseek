'use strict';
const {randomUUID}=require('node:crypto');
const {createClient}=require('./cos.cjs');
exports.main=async event=>{
 if(event?.probe!=='sunseek-direct-object-storage')throw Error('Diagnostic invocation required');
 const prefix=`sunseek/_weather-storage-probe/${randomUUID().replaceAll('-','')}/`;
 const client=createClient({bucket:process.env.SUNSEEK_STATIC_BUCKET,region:'ap-shanghai',prefix});
 const report={purpose:'synthetic-storage-diagnostic',weatherCalls:0,postgresQueries:0,operations:[],cleanedUp:false};
 const created=[];
 const parallel=async tasks=>{
  const results=await Promise.allSettled(tasks),failed=results.find(r=>r.status==='rejected');
  if(failed)throw failed.reason;
  return results.map(r=>r.value);
 };
 const record=(method,name,result)=>{report.operations.push({method,name,status:result.status,elapsedMs:result.elapsedMs,versioned:!!result.headers?.['x-cos-version-id'],...(result.errorCode?{errorCode:result.errorCode}:{})});};
 const payload=JSON.stringify({kind:'storage-probe',nonce:randomUUID()});
 try{
  const put=await client('PUT','probe.json',payload);record('PUT','probe.json',put);
  if(put.status!==200){report.passed=false;return report;}
  created.push(['probe.json',put.headers['x-cos-version-id']]);
  const get=await client('GET','probe.json');record('GET','probe.json',get);
  if(get.status!==200||get.body!==payload)throw Error('COS read did not match isolated upload');
  const attempts=await parallel([0,1].map(async()=>{
   const result=await client('PUT','probe-lock.json',payload);record('PUT','probe-lock.json',result);
   if(result.status===200)created.push(['probe-lock.json',result.headers['x-cos-version-id']]);
   return result;
  }));
  report.exclusiveCreate=attempts.filter(r=>r.status===200).length===1&&attempts.filter(r=>r.status===409&&r.errorCode==='FileAlreadyExists').length===1;
  const appends=await parallel([0,1].map(async()=>{
   const result=await client('POST','probe-append.json',payload,'append=&position=0');record('POST','probe-append.json',result);
   if(result.status===200)created.push(['probe-append.json',result.headers['x-cos-version-id']]);
   return result;
  }));
  const replay=await client('POST','probe-append.json',payload,'append=&position=0');record('POST','probe-append.json',replay);
  if(replay.status===200)created.push(['probe-append.json',replay.headers['x-cos-version-id']]);
  report.exclusiveAppend=appends.filter(r=>r.status===200).length===1&&appends.filter(r=>r.status===409).length===1&&replay.status===409&&['AppendPositionErr','PositionNotEqualToLength'].includes(replay.errorCode);
  // PUT forbid-overwrite was inconsistent in the live race; it is not an atomic lease.
  report.passed=report.exclusiveAppend;
  return report;
 }finally{
  let cleanupFailed=false;
  for(const [name,version] of created){
   try{
    const result=await client('DELETE',name,'',version?'versionId='+encodeURIComponent(version):'');record('DELETE',name,result);
    if(result.status!==204)cleanupFailed=true;
   }catch{cleanupFailed=true;}
  }
  report.cleanedUp=!cleanupFailed;
  if(cleanupFailed)throw Error('Isolated diagnostic object cleanup failed');
 }
};
