'use strict';
const assert=require('node:assert/strict'),core=require('../server/weather-cache/core.cjs');
let status='fresh',calls=0;
core.makeService=()=>({get:async ids=>{calls++;return {version:1,items:ids.map(cityId=>({cityId,status,fetchedAt:Date.now()-3599500,expiresAt:Date.now()+500}))};}});
let storeCalls=0;require('../server/weather-cache/tcb.cjs').createStore=()=>{storeCalls++;return {};};
const {main}=require('../server/weather-cache/index.js');
(async()=>{
 const origin='http://localhost:4173',headers={Origin:origin};
 for(const enabled of [undefined,'false','TRUE','1']){
  if(enabled===undefined)delete process.env.SUNSEEK_PG_CACHE_ENABLED;else process.env.SUNSEEK_PG_CACHE_ENABLED=enabled;
  for(const event of [{},{headers,queryString:{ids:'dali'}},{queryStringParameters:{ids:'dali'}}]){
   const result=await main(event);assert.equal(result.statusCode,410);assert.equal(JSON.parse(result.body).code,'PG_CACHE_DISABLED');assert.equal(result.headers['Cache-Control'],'no-store');
  }
 }
 assert.equal(calls,0);assert.equal(storeCalls,0);
 process.env.SUNSEEK_PG_CACHE_ENABLED='true';
 for(const key of ['queryString','queryStringParameters']){
  const result=await main({headers,httpMethod:'GET',[key]:{ids:'dali'}});
  assert.equal(result.statusCode,200);assert.equal(result.headers['Access-Control-Allow-Origin'],origin);assert.match(result.headers['Cache-Control'],/s-maxage=0$/);
 }
 const before=calls;
 assert.equal((await main({headers:{Origin:'https://example.invalid'},queryString:{ids:'dali'}})).statusCode,403);
 assert.equal((await main({headers,httpMethod:'POST',queryString:{ids:'dali'}})).statusCode,405);
 assert.equal((await main({headers,httpMethod:'OPTIONS'})).statusCode,204);
 assert.equal((await main({headers,queryString:{ids:'dali',force:'true'}})).statusCode,400);
 assert.equal((await main({headers,queryString:{url:'https://evil.invalid'}})).statusCode,400);
 assert.equal(calls,before);
 status='pending';const result=await main({headers,queryString:{ids:'dali'}});assert.equal(result.headers['Cache-Control'],'no-store');
 const beforeDisable=calls;process.env.SUNSEEK_PG_CACHE_ENABLED='false';
 assert.equal((await main({headers,queryString:{ids:'dali'}})).statusCode,410);assert.equal(calls,beforeDisable);
 delete process.env.SUNSEEK_PG_CACHE_ENABLED;
 console.log('PASS disabled PG entry skips adapter/service, explicit opt-in, native request formats, exact guards and expiry-bound headers');
})().catch(e=>{console.error(e);process.exitCode=1;});
