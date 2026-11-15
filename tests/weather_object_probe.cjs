'use strict';
const assert=require('node:assert/strict');
const cosPath=require.resolve('../server/weather-object-probe/cos.cjs');
const {createClient,signedHeaders}=require(cosPath);
const env={TENCENTCLOUD_SECRETID:'temporary-test-id',TENCENTCLOUD_SECRETKEY:'temporary-test-key',TENCENTCLOUD_SESSIONTOKEN:'temporary-test-token'};
const url=new URL('https://example-123.cos.ap-shanghai.myqcloud.com/sunseek/_weather-storage-probe/'+ 'a'.repeat(32)+'/probe.json');
assert.throws(()=>signedHeaders('GET',url,{},{}),/Temporary/);
const signed=signedHeaders('GET',url,{},env,1700000000000);
assert(signed.authorization.includes('q-header-list=host;x-cos-security-token'));
assert.equal(signed['x-cos-security-token'],env.TENCENTCLOUD_SESSIONTOKEN);
let network=0;
assert.throws(()=>createClient({bucket:'wrong/host',region:'ap-shanghai',prefix:'sunseek/'}),/Unsafe/);
const limited=createClient({bucket:'example-123',region:'ap-shanghai',prefix:'sunseek/_weather-storage-probe/'+'a'.repeat(32)+'/',env,requester:()=>{network++;throw Error('Unexpected network');}});
(async()=>{
 for(const args of [['GET','../../index.html'],['PUT','probe.json','','acl'],['POST','probe.json']])await assert.rejects(limited(...args),/Unsafe/);
 assert.equal(network,0);
 let denied=false,cleanupFailure=false,raceFailure=false,raceAttempt=0,calls=[];
 const objects=new Map();
 const saved=require.cache[cosPath].exports;
 require.cache[cosPath].exports={...saved,createClient:()=>async(method,name,body)=>{
  calls.push({method,name});
  if(['PUT','POST'].includes(method)){
   if(denied)return {status:403,errorCode:'AccessDenied',headers:{}};
   if(raceFailure&&name==='probe-lock.json'&&raceAttempt++===0)throw Error('One concurrent upload failed');
   if(objects.has(name))return {status:409,errorCode:method==='POST'?'AppendPositionErr':'FileAlreadyExists',headers:{}};
   objects.set(name,body);return {status:200,headers:{},elapsedMs:1};
  }
  if(method==='GET')return {status:200,headers:{},body:objects.get(name),elapsedMs:1};
  if(cleanupFailure)return {status:403,headers:{}};
  objects.delete(name);return {status:204,headers:{},elapsedMs:1};
 }};
 try{
  const {main}=require('../server/weather-object-probe/index.js');
  await assert.rejects(main({}),/Diagnostic/);
  const success=await main({probe:'sunseek-direct-object-storage'});
  assert(success.passed&&success.exclusiveCreate&&success.cleanedUp);
  assert.equal(objects.size,0);assert.equal(calls.filter(c=>c.method==='PUT').length,3);
  denied=true;calls=[];const blocked=await main({probe:'sunseek-direct-object-storage'});
  assert.equal(blocked.passed,false);assert.equal(calls.length,1);
  assert.equal(JSON.stringify(blocked).includes('temporary-test'),false);
  denied=false;raceFailure=true;await assert.rejects(main({probe:'sunseek-direct-object-storage'}),/One concurrent/);
  assert.equal(objects.size,0,'the other concurrent upload must finish before cleanup');
  raceFailure=false;cleanupFailure=true;calls=[];await assert.rejects(main({probe:'sunseek-direct-object-storage'}),/cleanup failed/);
  assert.equal(calls.filter(c=>c.method==='DELETE').length,3,'attempt every created object even if cleanup fails');
 }finally{require.cache[cosPath].exports=saved;}
 console.log('PASS scoped direct COS diagnostic, temporary credentials, exclusive-create race, denial and cleanup errors; no PostgreSQL path');
})().catch(error=>{console.error(error);process.exitCode=1;});
