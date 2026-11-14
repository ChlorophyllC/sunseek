'use strict';
const assert=require('node:assert/strict'),core=require('../server/weather-cache/core.cjs');
let status='fresh',calls=0;
core.makeService=()=>({get:async ids=>{calls++;return {version:1,items:ids.map(cityId=>({cityId,status,fetchedAt:Date.now()-3599500,expiresAt:Date.now()+500}))};}});
const {main}=require('../server/weather-cache/index.js');
(async()=>{
 const origin='http://localhost:4173',headers={Origin:origin};
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
 console.log('PASS native Function URL and gateway request formats, exact origin/method/parameter guards, expiry-bound headers and no-store pending');
})().catch(e=>{console.error(e);process.exitCode=1;});
