'use strict';
const assert=require('node:assert/strict');
const {createCOS}=require('../server/weather-object-cache/cos.cjs');
const {KEY}=require('../server/weather-object-cache/ledger.cjs');
const env={TENCENTCLOUD_SECRETID:'temporary-test-id',TENCENTCLOUD_SECRETKEY:'temporary-test-key',TENCENTCLOUD_SESSIONTOKEN:'temporary-test-token'};
const {EventEmitter}=require('node:events');
let reached=0;
function requester(url,options,callback){
 reached++;assert.equal(url.hostname,'static-test-123.cos.ap-shanghai.myqcloud.com');
 const req=new EventEmitter();req.end=()=>{const response=new EventEmitter();response.statusCode=204;response.headers={};callback(response);queueMicrotask(()=>{response.emit('end');req.emit('close');});};return req;
}
(async()=>{
 const cos=createCOS({bucket:'static-test-123',env,requester});
 for(const args of [['DELETE',KEY],['PUT',KEY],['GET','sunseek/index.html'],['PUT','sunseek/_weather-shared/v2/../index.html'],['GET','',{query:{prefix:'sunseek/'}}],['POST',KEY,{query:{append:'',position:'bad'}}]])await assert.rejects(cos(...args),/Invalid|only be appended/);
 assert.equal(reached,0);
 const isolated=createCOS({bucket:'static-test-123',env,requester,namespace:'probe-'+'a'.repeat(32)});await isolated('DELETE',KEY);assert.equal(reached,1);
 assert.throws(()=>createCOS({bucket:'static-test-123',namespace:'../v2'}),/namespace/);
 const cosPath=require.resolve('../server/weather-object-cache/cos.cjs'),servicePath=require.resolve('../server/weather-object-cache/service.cjs');
 const originalCOS=require.cache[cosPath].exports,originalService=require(servicePath);let calls=0;
 require.cache[cosPath].exports={createCOS:()=>()=>{throw Error('Unexpected low-level call');}};
 require.cache[servicePath].exports={createService:()=>({get:async ids=>{calls++;if(ids.includes('unknown')){const error=Error('Unknown');error.status=400;throw error;}return {version:1,items:ids};}})};
 try{
  const {main}=require('../server/weather-object-cache/index.js'),origin='https://sunseek-noisy-sole-d5ganycu813519dcc.webapps.tcloudbase.com';
  assert.equal((await main({headers:{origin:'https://other.example'},queryStringParameters:{ids:'dali'}})).statusCode,403);
  assert.equal((await main({headers:{origin},httpMethod:'POST',queryStringParameters:{ids:'dali'}})).statusCode,405);
  assert.equal((await main({headers:{origin},httpMethod:'OPTIONS'})).statusCode,204);
  assert.equal((await main({headers:{origin},queryStringParameters:{ids:'dali',force:'true'}})).statusCode,400);
  assert.equal(calls,0);
  const response=await main({headers:{Origin:origin},requestContext:{http:{method:'GET'}},queryString:{ids:'dali'}});
  assert.equal(response.statusCode,200);assert.equal(response.headers['Access-Control-Allow-Origin'],origin);assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal((await main({queryStringParameters:{ids:'unknown'}})).statusCode,400);
 }finally{require.cache[cosPath].exports=originalCOS;require.cache[servicePath].exports=originalService;}
 console.log('PASS exact-origin/method/query boundaries, native COS scope, immutable ledger and isolated diagnostic deletion');
})().catch(error=>{console.error(error);process.exitCode=1;});
