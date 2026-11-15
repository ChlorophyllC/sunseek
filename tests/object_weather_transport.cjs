'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{gzipSync}=require('node:zlib');
const {createTransport}=require('../server/weather-object-cache/http.cjs');
let calls=0,mode='success';
const agent={};
function getter(url,options,callback){
 calls++;assert.equal(options.family,4);assert.equal(options.agent,agent);
 const req=new EventEmitter(),socket=new EventEmitter();socket.connecting=mode!=='reused-reset';
 req.destroy=error=>{req.emit('error',error);req.emit('close');};
 queueMicrotask(()=>{
  req.emit('socket',socket);
  if(mode==='connect-error'){req.destroy(Object.assign(Error('Connect failed'),{code:'ECONNRESET'}));return;}
  if(mode==='reused-reset'){req.destroy(Object.assign(Error('Reset after request on reused connection'),{code:'ECONNRESET'}));return;}
  socket.emit('secureConnect');
  if(mode==='connected-reset'){req.destroy(Object.assign(Error('Reset after TLS'),{code:'ECONNRESET'}));return;}
  const response=new EventEmitter();response.statusCode=200;response.headers={'content-encoding':'gzip'};callback(response);
  response.emit('data',gzipSync(Buffer.from('{"valid":true}')));response.emit('end');req.emit('close');
 });return req;
}
(async()=>{
 const request=createTransport({getter,agent});
 assert.deepEqual(await (await request('https://api.open-meteo.com/v1/forecast')).json(),{valid:true});
 mode='connect-error';calls=0;await assert.rejects(request('https://api.open-meteo.com/v1/forecast'));assert.equal(calls,3);
 for(mode of ['reused-reset','connected-reset']){calls=0;await assert.rejects(request('https://api.open-meteo.com/v1/forecast'));assert.equal(calls,1,'an established connection may already have submitted a billable request');}
 const cancelled=new AbortController();cancelled.abort();mode='connect-error';calls=0;await assert.rejects(request('https://api.open-meteo.com/v1/forecast',{signal:cancelled.signal}));assert.equal(calls,1);
 console.log('PASS bounded IPv4 connection setup retries, scoped agent, gzip and no uncharged resubmission on established socket failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
