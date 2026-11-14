'use strict';
const assert=require('node:assert/strict');
const {makeService,CATALOG,PROFILE,baseDate,profileFor}=require('../server/weather-cache/core.cjs');
const HOUR=3600000;let clock=Date.parse('2026-11-15T02:30:00Z'),calls=0;
function forecast(date=baseDate(clock)){
 const dates=Array.from({length:16},(_,i)=>new Date(Date.parse(date+'T00:00Z')+i*86400000).toISOString().slice(0,10));
 return {timezone:'Asia/Shanghai',daily:{time:dates,...Object.fromEntries(PROFILE.daily.split(',').map(k=>[k,dates.map(()=>20)]))},hourly:{time:dates.flatMap(d=>Array.from({length:24},(_,h)=>`${d}T${String(h).padStart(2,'0')}:00`)),...Object.fromEntries(PROFILE.hourly.split(',').map(k=>[k,Array(384).fill(1)]))}};
}
class Store{
 constructor(){this.rows=new Map();this.claimCalls=0;this.units=0;this.pause=0;}
 async claim(points,owner,date){this.claimCalls++;return points.map(p=>{
  let r=this.rows.get(p.id);if(!r){r={cityId:p.id};this.rows.set(p.id,r);}
  const same=r.profile===p.profile&&r.date===date,fresh=same&&r.time>clock-HOUR;
  let claimed=false;if(!fresh&&!(r.lease>clock)&&!(r.retry>clock)&&!(this.pause>clock)){
   r.owner=owner;r.lease=clock+45000;claimed=true;this.units+=2;
  }
  return {cityId:p.id,fresh,claimed,pending:r.lease>clock,failure:r.failure,retryAt:new Date(Math.max(r.retry||0,this.pause)).toISOString(),
   forecast:same&&r.time>clock-6*HOUR?r.forecast:null,fetchedAt:r.time?new Date(r.time).toISOString():null};
 });}
 async finish(owner,items,date){return items.filter(i=>{const r=this.rows.get(i.cityId);if(r.owner!==owner||r.lease<=clock)return false;Object.assign(r,{profile:i.profile,date,forecast:i.forecast,time:clock,lease:0,owner:null,failure:null,retry:0});return true;}).map(i=>({cityId:i.cityId,fetchedAt:new Date(clock).toISOString()}));}
 async fail(owner,ids,reason,cooldown){for(const id of ids){const r=this.rows.get(id);if(r.owner===owner)Object.assign(r,{owner:null,lease:0,retry:clock+cooldown*1000,failure:reason});}if(reason==='rate-limited')this.pause=clock+cooldown*1000;}
}
const store=new Store();let mode='ok',release;
async function upstream(url){calls++;const count=new URL(url).searchParams.get('latitude').split(',').length;
 if(mode==='held')await new Promise(r=>release=r);
 if(mode==='429')return {ok:false,status:429,headers:new Headers({'retry-after':'120'})};
 if(mode==='bad')return {ok:true,json:async()=>({invalid:true})};
 return {ok:true,json:async()=>Array.from({length:count},()=>forecast())};
}
const service=options=>makeService({store,fetcher:upstream,now:()=>clock,...options});
(async()=>{
 const featured=CATALOG.filter(c=>c.featured).map(c=>c.id),all=CATALOG.map(c=>c.id);
 assert.equal(featured.length,48);assert.equal(all.length,506);
 const a=service({coverage:'featured'});for(let i=0;i<48;i+=16)assert((await a.get(featured.slice(i,i+16))).items.every(i=>i.status==='fresh'));
 assert.equal(calls,6);assert.equal(store.units,48*2);
 const firstTime=store.rows.get('jinan').time;
 clock+=20*60000;
 const b=service({coverage:'featured'});for(let i=0;i<48;i+=16)await b.get(featured.slice(i,i+16));assert.equal(calls,6);
 assert.equal(store.rows.get('jinan').time,firstTime);
 await assert.rejects(()=>b.get([all.find(id=>!featured.includes(id))]),e=>e.status===400);
 await assert.rejects(()=>b.get(['https://evil.example']),e=>e.status===400);
 await assert.rejects(()=>b.get(all.slice(0,17)),e=>e.status===400);
 console.log('PASS 48 featured, independent instances share timestamps, first-fetch TTL, catalog allowlist and batch limit');
 const c=service({coverage:'all'});for(let i=0;i<all.length;i+=16)assert((await c.get(all.slice(i,i+16))).items.every(i=>i.status==='fresh'));
 assert.equal(store.rows.size,506);assert.equal(store.units,506*2);assert.equal(store.rows.get('jinan').time,firstTime);
 const callsAfter=calls,d=service({coverage:'all'});for(let i=0;i<all.length;i+=16)await d.get(all.slice(i,i+16));assert.equal(calls,callsAfter);
 console.log('PASS expand all 506, only missing locations fetched, second independent reader makes zero upstream calls');
 clock=firstTime+HOUR;const r=await service().get(['jinan',all.find(id=>!featured.includes(id))]);assert.equal(calls,callsAfter+1);
 assert.equal(r.items.find(i=>i.cityId==='jinan').fetchedAt,clock);assert.equal(r.items.find(i=>i.cityId!=='jinan').fetchedAt,firstTime+20*60000);
 // Independent instances must coalesce a point while its lease is held.
 clock+=HOUR;mode='held';const owner=service().get(['jinan']);await new Promise(r=>setImmediate(r));
 assert.equal((await service().get(['jinan'])).items[0].status,'stale');const once=calls;release();await owner;assert.equal(calls,once);
 mode='429';clock+=HOUR;const failed=await service().get(['jinan']);assert.equal(failed.items[0].status,'stale');
 assert.equal(failed.items[0].reason,'rate-limited');assert.equal(store.rows.get('jinan').time,clock-HOUR);
 await service().get(['dali']);assert.equal(calls,once+1);
 console.log('PASS point-specific expiry, distributed single-flight, old data retained on 429 and global cooldown');
 // No stale cache is retained beyond six hours; day rollover invalidates even a young record.
 clock+=7*HOUR;mode='bad';assert.equal((await service().get(['jinan'])).items[0].status,'error');
 clock=Date.parse('2026-11-15T15:50:00Z');mode='ok';await service().get(['dali']);const midnightBefore=calls;
 clock+=20*60000;await service().get(['dali']);assert.equal(calls,midnightBefore+1);
 const changed=CATALOG.map(c=>c.id==='dali'?{...c,lat:c.lat+.01}:c);assert.notEqual(profileFor(changed[0]),profileFor(CATALOG[0]));
 await service({catalog:changed}).get(['dali']);assert.equal(calls,midnightBefore+2);
 // Expired workers must not overwrite a new owner.
 const s=new Store();await s.claim([{id:'dali',profile:'x'}],'old',baseDate(clock));clock+=46000;
 await s.claim([{id:'dali',profile:'x'}],'new',baseDate(clock));assert.deepEqual(await s.finish('old',[{cityId:'dali',profile:'x',forecast:forecast()}],baseDate(clock)),[]);
 console.log('PASS invalid upstream, six-hour stale cutoff, midnight/coordinate identity and expired-owner fencing');
})().catch(e=>{console.error(e);process.exitCode=1;});
