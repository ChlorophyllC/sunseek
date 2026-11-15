'use strict';
// Invoked only by a short-lived, nonpublic diagnostic handler in an isolated namespace.
const assert=require('node:assert/strict');
const {createService}=require('./service.cjs'),{createCOS}=require('./cos.cjs');
const {CATALOG,PROFILE,baseDate,HOUR}=require('./profile.cjs'),{KEY}=require('./ledger.cjs');
function forecast(clock,value){
 const day=baseDate(clock),dates=Array.from({length:16},(_,i)=>new Date(Date.parse(day+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 return {timezone:'Asia/Shanghai',daily:{time:dates,...Object.fromEntries(PROFILE.daily.split(',').map(k=>[k,Array(16).fill(value)]))},hourly:{time:dates.flatMap(d=>Array.from({length:24},(_,h)=>`${d}T${String(h).padStart(2,'0')}:00`)),...Object.fromEntries(PROFILE.hourly.split(',').map(k=>[k,Array(384).fill(value)]))}};
}
exports.run=async()=>{
 const namespace=process.env.SUNSEEK_CACHE_PROBE_NAMESPACE;
 if(!/^probe-[a-f0-9]{32}$/.test(namespace||''))throw Error('An isolated test namespace is required');
 const rawCOS=createCOS({namespace}),created=new Set(),operations=[];
 const cos=async(method,key,options)=>{if(['PUT','POST'].includes(method))created.add(key);const result=await rawCOS(method,key,options);operations.push({method,key:key===KEY?'ledger':key.includes('/blobs/')?'blob':'public-cache',status:result.status});return result;};
 const report={namespace,postgresQueries:0,weatherCalls:0,checks:[],cleanup:false};
 let clock=Date.now(),calls=0,hold=false,release,announce;
 const provider=async url=>{
  calls++;const value=calls+20,raw=forecast(clock,value),count=new URL(url).searchParams.get('latitude').split(',').length;
  if(hold){hold=false;announce();await new Promise(r=>release=r);}
  return {ok:true,json:async()=>Array.from({length:count},()=>raw)};
 };
 const service=limits=>createService({cos,now:()=>clock,fetcher:provider,...(limits?{limits}:{})});
 try{
  const ids=CATALOG.slice(0,2).map(c=>c.id),first=await service().get(ids),source=first.items[0].fetchedAt;
  assert(first.items.every(i=>i.status==='fresh'));assert.equal(calls,1);
  const writes=operations.filter(o=>o.method==='POST').length,second=await service().get(ids);
  assert(second.items.every(i=>i.fetchedAt===source));assert.equal(calls,1);assert.equal(operations.filter(o=>o.method==='POST').length,writes);
  report.checks.push('separate-instances-share-source-time-without-upstream-or-ledger-writes');
  const blocked=await service([[60000,2],[HOUR,2],[24*HOUR,2]]).get([CATALOG[2].id]);assert.equal(blocked.items[0].reason,'rate-limited');assert.equal(calls,1);
  report.checks.push('persisted-budget-not-reset-by-new-instance');
  clock+=HOUR;hold=true;const waiting=new Promise(r=>announce=r),older=service().get([ids[0]]);
  await Promise.race([waiting,older.then(()=>{throw Error('Expected an in-flight owner');})]);
  const pending=await service().get([ids[0]]);assert.equal(pending.items[0].status,'stale');assert.equal(calls,2);
  clock+=46000;const newer=await service().get([ids[0]]);assert.equal(calls,3);const expected=newer.items[0].forecast.daily.temperature_2m_max[0];
  release();await older;
  const confirmed=await service().get([ids[0]]);assert.equal(confirmed.items[0].forecast.daily.temperature_2m_max[0],expected);
  report.checks.push('expired-lease-takeover-and-late-owner-fencing');
  report.callsToSyntheticProvider=calls;report.ledgerAppends=operations.filter(o=>o.method==='POST'&&o.status===200).length;
  assert(report.ledgerAppends>=5);report.passed=true;return report;
 }finally{
  let failed=false;
  for(const key of created){try{if((await rawCOS('DELETE',key)).status!==204)failed=true;}catch{failed=true;}}
  report.cleanup=!failed;if(failed)throw Error('Isolated cache check cleanup failed');
 }
};
