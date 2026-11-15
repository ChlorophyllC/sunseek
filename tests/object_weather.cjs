'use strict';
const assert=require('node:assert/strict');
const {createService}=require('../server/weather-object-cache/service.cjs');
const {createLedger,KEY,LEASE,HOUR}=require('../server/weather-object-cache/ledger.cjs');
const {CATALOG,baseDate,profileFor}=require('../server/weather-object-cache/profile.cjs');
const {forecast,memoryCOS}=require('./object_weather_fixtures.cjs');
let clock=Date.parse('2026-11-15T02:30:00Z'),calls=0,mode='ok',release;
const storage=memoryCOS(),ids=CATALOG.map(c=>c.id);
async function provider(url){
 calls++;const count=new URL(url).searchParams.get('latitude').split(',').length;
 const value=forecast(clock);
 if(mode==='hold'){mode='ok';await new Promise(r=>release=r);}
 if(mode==='429')return {ok:false,status:429,headers:new Headers({'retry-after':'120'})};
 if(mode==='bad')return {ok:true,json:async()=>({invalid:true})};
 return {ok:true,json:async()=>Array.from({length:count},()=>value)};
}
const service=options=>createService({cos:storage.cos,fetcher:provider,now:()=>clock,...options});
const posts=()=>storage.operations.filter(o=>o.method==='POST').length;
(async()=>{
 assert.equal(ids.length,48);
 const a=service();for(let i=0;i<48;i+=16)assert((await a.get(ids.slice(i,i+16))).items.every(r=>r.status==='fresh'));
 assert.equal(calls,12);const original=clock,mutations=posts();
 clock+=20*60000;const b=service();for(let i=0;i<48;i+=16){const r=await b.get(ids.slice(i,i+16));assert(r.items.every(i=>i.fetchedAt===original));assert.equal(r.upstreamPoints,0);}
 assert.equal(calls,12);assert.equal(posts(),mutations,'fresh reads must not mutate quota/lease state');
 await assert.rejects(b.get(['area-130100']),e=>e.status===400);
 await assert.rejects(b.get(ids.slice(0,17)),e=>e.status===400);
 console.log('PASS 48 featured, independent workers preserve source timestamps and avoid upstream/ledger writes on fresh data');
 clock=original+HOUR;await service().get([ids[0]]);assert.equal(calls,13);
 assert.equal((await service().get([ids[1]])).items[0].fetchedAt,clock);assert.equal(calls,14);
 clock+=HOUR;mode='hold';const first=service().get([ids[0]]);
 while(!release)await new Promise(r=>setImmediate(r));
 const pending=await service().get([ids[0]]);assert.equal(pending.items[0].status,'stale');const before=calls;release();await first;release=null;assert.equal(calls,before);
 console.log('PASS only requested expired points update; a concurrent worker reuses stale data without duplicate upstream');
 clock+=HOUR;mode='429';const limited=await service().get([ids[0]]);assert.equal(limited.items[0].status,'stale');assert.equal(limited.items[0].reason,'rate-limited');
 const pausedCalls=calls;const blocked=await service().get([ids[2]]);assert.equal(blocked.items[0].reason,'rate-limited');assert.equal(calls,pausedCalls);
 assert.equal(limited.items[0].fetchedAt,clock-HOUR);
 clock+=7*HOUR;mode='bad';assert.equal((await service().get([ids[0]])).items[0].status,'error');
 clock=Date.parse('2026-11-16T15:50:00Z');mode='ok';await service().get([ids[0]]);const midnight=calls;clock+=20*60000;
 assert.equal((await service().get([ids[0]])).items[0].forecast.daily.time[0],baseDate(clock));assert.equal(calls,midnight+1);
 console.log('PASS durable 429 pause, failed updates retain source data, six-hour limit and midnight invalidation');

 const other=memoryCOS();let count=0;const limitedService=()=>createService({cos:other.cos,now:()=>clock,limits:[[60000,2],[HOUR,4],[24*HOUR,6]],fetcher:async()=>{count++;return {ok:true,json:async()=>[forecast(clock)]};}});
 await limitedService().get([ids[0]]);assert.equal((await limitedService().get([ids[1]])).items[0].reason,'rate-limited');assert.equal(count,1);
 clock+=61000;await limitedService().get([ids[1]]);clock+=61000;assert.equal((await limitedService().get([ids[2]])).items[0].reason,'rate-limited');assert.equal(count,2);
 clock+=HOUR;await limitedService().get([ids[2]]);clock+=HOUR;assert.equal((await limitedService().get([ids[3]])).items[0].reason,'rate-limited');assert.equal(count,3);
 console.log('PASS rolling minute/hour/day budgets survive independent worker creation');

 const retryStore=memoryCOS();let attempts=0;
 const retry=()=>createService({cos:retryStore.cos,now:()=>clock,fetcher:async()=>{attempts++;if(attempts===1)throw Object.assign(Error('Post-connect reset'),{code:'ECONNRESET',beforeConnect:false});return {ok:true,json:async()=>[forecast(clock)]};}});
 assert.equal((await retry().get([ids[0]])).items[0].status,'fresh');assert.equal(attempts,2);
 assert.equal((await retry().ledger.read()).state.usage.reduce((s,e)=>s+e.units,0),4,'each HTTP resubmission must persist an additional reservation');
 const exhausted=memoryCOS();let rejectedCalls=0;
 const noRetry=createService({cos:exhausted.cos,now:()=>clock,limits:[[24*HOUR,2]],fetcher:async()=>{rejectedCalls++;throw Error('Temporary network error');}});
 assert.equal((await noRetry.get([ids[0]])).items[0].reason,'rate-limited');assert.equal(rejectedCalls,1);
 console.log('PASS paid-in-budget retry survives restarts and exhausted quota prevents another upstream request');

 const race=memoryCOS(),ledger=createLedger({cos:race.cos,now:()=>clock});
 const point={id:ids[0],profile:profileFor(CATALOG[0])};
 await ledger.mutate(()=>({event:{type:'claim',owner:'old',date:baseDate(clock),points:[point]},result:true}));
 clock+=LEASE+1;
 await ledger.mutate(()=>({event:{type:'claim',owner:'new',date:baseDate(clock),points:[point]},result:true}));
 await ledger.mutate(()=>({event:{type:'ready',owner:'old',items:[{...point,date:baseDate(clock),fetchedAt:clock,blob:'old'}]},result:true}));
 assert.equal((await ledger.read()).state.points.get(ids[0]).lease.owner,'new');
 assert.equal((await ledger.read()).state.usage.reduce((s,r)=>s+r.units,0),4);
 race.loseNextAck();await ledger.mutate(()=>({event:{type:'fail',owner:'new',ids:[ids[0]],reason:'upstream-unavailable',retryAt:clock+60000},result:'recovered'}));
 assert.equal((await ledger.read()).state.points.get(ids[0]).reason,'upstream-unavailable');
 console.log('PASS expired-owner fencing, persisted reservations and lost-ack recovery');

 const concurrent=memoryCOS(),l=createLedger({cos:concurrent.cos,now:()=>clock});
 await Promise.all([0,1,2].map(n=>l.mutate(()=>({event:{type:'claim',owner:'worker'+n,date:baseDate(clock),points:[{id:ids[n],profile:profileFor(CATALOG[n])}]},result:true}))));
 assert.equal((await l.read()).state.usage.length,3);
 const small=createLedger({cos:memoryCOS().cos,now:()=>clock,maxLog:10});await assert.rejects(small.mutate(()=>({event:{type:'claim',points:[point],owner:'x',date:baseDate(clock)},result:true})),/maintenance/);
 const long=memoryCOS(),events=[];
 for(let i=0;i<1600;i++)events.push({op:'old-'+i,at:clock-2*24*HOUR,type:'claim',points:[point],owner:'old',date:baseDate(clock)});
 events.push({op:'recent',at:clock-1000,type:'claim',points:[point],owner:'fresh',date:baseDate(clock)});long.files.set(KEY,Buffer.from(events.map(e=>JSON.stringify(e)).join('\n')+'\n'));
 assert.equal((await createLedger({cos:long.cos,now:()=>clock}).read()).state.usage.length,1);
 const malformed=memoryCOS();malformed.files.set(KEY,Buffer.from('{"broken":true}'));await assert.rejects(createLedger({cos:malformed.cos,now:()=>clock}).read(),/Incomplete/);
 console.log('PASS conditional-append contention, bounded history reads, maintenance cap and fail-closed malformed state');
})().catch(error=>{console.error(error);process.exitCode=1;});
