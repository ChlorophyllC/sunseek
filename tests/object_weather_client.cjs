'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const EPOCH=Date.parse('2026-11-16T04:00:00Z'),HOUR=3600000;
const source=fs.readFileSync(require.resolve('../assets/weather-object-client.js'),'utf8');
function harness(handler,{staticCache=false}={}){
 let clock=0,next=0;const timers=new Map(),requests=[];
 const schedule=(fn,ms)=>{const id=++next;timers.set(id,{fn,at:clock+ms});return id;};
 const unschedule=id=>timers.delete(id);
 class ClockDate extends Date{static now(){return EPOCH+clock;}}
 const config={enabled:true,ids:['a','b'],contract:'test',endpoint:'/api/weather',cacheBase:'_weather-shared'};
 const context={window:{SUNSEEK_OBJECT_WEATHER_SERVICE:config},location:{href:'http://localhost:4173/'},Date:ClockDate,performance:{now:()=>clock},AbortController,URL,TextEncoder,TextDecoder,Uint8Array,Response,Blob,
  crypto:{subtle:{digest:async()=>new Uint8Array(32).buffer}},DecompressionStream:staticCache?function(){}:undefined,setTimeout:schedule,clearTimeout:unschedule};
 context.fetch=(url,{signal})=>{
  const parsed=new URL(url),call={url:parsed,ids:parsed.searchParams.get('ids')?.split(','),at:clock};requests.push(call);
  const plan=handler(call,requests.length);
  return new Promise((resolve,reject)=>{
   let timer,finished=false;
   const done=fn=>{if(finished)return;finished=true;unschedule(timer);signal.removeEventListener('abort',abort);fn();};
   const abort=()=>done(()=>reject(Error('Aborted')));
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
   const complete=()=>done(()=>resolve({ok:!plan.status||plan.status===200,status:plan.status||200,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(plan.payload)).buffer}));
   if(plan.stall)return;
   if(plan.delay)timer=schedule(complete,plan.delay);else complete();
  });
 };
 vm.runInNewContext(source,context);
 const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
 async function advance(ms){
  await flush();const target=clock+ms;
  for(;;){const due=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;
   clock=due[1].at;timers.delete(due[0]);due[1].fn();await flush();
  }
  clock=target;await flush();
 }
 return {client:context.window.SunseekObjectWeatherClient,requests,timers,flush,advance,clock:()=>clock};
}
const fresh=(id,fetchedAt=EPOCH-60000)=>({cityId:id,status:'fresh',fetchedAt,expiresAt:fetchedAt+HOUR,forecast:{daily:{time:['2026-11-16']}}});
const pending=(id,retryAfter=3)=>({cityId:id,status:'pending',retryAfter});
const payload=items=>({version:1,contract:'test',baseDate:'2026-11-16',items});
const plain=value=>JSON.parse(JSON.stringify(value));
(async()=>{
 // A 45-second lease is owned by another worker; do not poll at 3 seconds.
 let h=harness(call=>({payload:payload(call.ids.map(id=>pending(id,45)))}));
 let result=await h.client.request(['b','a'],new AbortController().signal);
 assert.equal(h.requests.length,1);assert.equal(h.clock(),0);assert.equal(result.map(i=>i.cityId).join(','),'b,a');
 assert.ok(result.every(i=>i.reason==='updating'&&i.retryAfter===45));assert.equal(h.timers.size,0);

 h=harness((call,n)=>({payload:payload(call.ids.map(id=>n===1?pending(id,6):fresh(id)))}));
 let task=h.client.request(['a'],new AbortController().signal);await h.advance(5999);assert.equal(h.requests.length,1);
 await h.advance(1);result=await task;assert.equal(h.requests.length,2);assert.equal(h.requests[1].at,6000);assert.equal(result[0].fetchedAt,EPOCH-60000);

 h=harness(call=>({payload:payload(call.ids.map(id=>pending(id)))}));
 task=h.client.request(['a'],new AbortController().signal);await h.advance(20000);result=await task;
 assert.equal(h.requests.length,3);assert.equal(result[0].status,'error');assert.equal(h.timers.size,0);
 console.log('PASS respects pending retry time, long leases skip polling, three-call ceiling and source timestamps');

 // 24s initial response + 3s wait + at most 3s remaining, not another 25s.
 h=harness((call,n)=>n===1?{delay:24000,payload:payload([fresh('a'),pending('b')])}:{stall:true});
 let failure;task=h.client.request(['b','a'],new AbortController().signal).catch(e=>{failure=e;});
 await h.advance(29999);assert.equal(failure,undefined);await h.advance(1);await task;
 assert.equal(h.requests.length,2);assert.equal(h.requests[1].at,27000);assert.match(failure.message,/超时/);
 assert.deepEqual(plain(failure.partialRecords),[fresh('a')]);assert.equal(h.timers.size,0);

 // Both 2.5s static misses count against the same 30s budget.
 h=harness(call=>call.ids?{stall:true}:{delay:2500,status:404},{staticCache:true});
 task=h.client.request(['a'],new AbortController().signal).catch(e=>{failure=e;});await h.advance(30000);await task;
 assert.equal(h.requests.length,3);assert.equal(h.requests[2].at,5000);assert.match(failure.message,/超时/);assert.equal(h.timers.size,0);
 console.log('PASS total 30-second network/wait budget includes static reads; later failure preserves validated partial results');

 h=harness((call,n)=>n===1?{payload:payload([fresh('a'),pending('b')])}:{status:503});
 task=h.client.request(['a','b'],new AbortController().signal).catch(e=>{failure=e;});await h.advance(3000);await task;
 assert.equal(failure.status,503);assert.deepEqual(plain(failure.partialRecords),[fresh('a')]);assert.equal(h.requests[1].ids.join(','),'b');

 // Data crossing its source TTL during the wait is downgraded, never renewed.
 const expiring=fresh('a',EPOCH-HOUR+1000);
 h=harness((call,n)=>({payload:payload(n===1?[expiring,pending('b')]:[fresh('b')])}));
 task=h.client.request(['a','b'],new AbortController().signal);await h.advance(3000);result=await task;
 assert.equal(result[0].status,'stale');assert.equal(result[0].fetchedAt,expiring.fetchedAt);assert.equal(result[0].expiresAt,expiring.expiresAt);

 h=harness(()=>({payload:payload([fresh('a'),pending('b',8)])}));
 const cancel=new AbortController();failure=undefined;
 task=h.client.request(['a','b'],cancel.signal).catch(e=>{failure=e;});await h.flush();cancel.abort();await task;
 assert.match(failure.message,/取消/);assert.equal(failure.partialRecords,undefined);assert.equal(h.requests.length,1);assert.equal(h.timers.size,0);
 console.log('PASS partial service failures, missing-only polling, TTL expiry during waiting and cancellation cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
