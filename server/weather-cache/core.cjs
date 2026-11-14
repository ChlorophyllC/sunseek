'use strict';
const {createHash,randomUUID}=require('node:crypto');
const CATALOG=require('./catalog.json');
const DAILY='weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max';
const HOURLY='weather_code,temperature_2m,apparent_temperature,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,cloud_cover,is_day';
const PROFILE={daily:DAILY,hourly:HOURLY,timezone:'Asia/Shanghai',forecast_days:'16',wind_speed_unit:'kmh',precipitation_unit:'mm',temperature_unit:'celsius'};
const HOUR=3600000;
function baseDate(now){return new Date(now+8*HOUR).toISOString().slice(0,10);}
function datesFrom(date){return Array.from({length:16},(_,i)=>new Date(Date.parse(date+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));}
function profileFor(city){return createHash('sha256').update(JSON.stringify({version:1,id:city.id,lat:city.lat,lon:city.lon,...PROFILE})).digest('hex');}
function validForecast(raw,date){
 const days=datesFrom(date),hours=days.flatMap(d=>Array.from({length:24},(_,i)=>`${d}T${String(i).padStart(2,'0')}:00`));
 return raw&&raw.timezone==='Asia/Shanghai'&&raw.daily?.time?.length===16&&raw.hourly?.time?.length===384
  &&days.every((d,i)=>raw.daily.time[i]===d)&&hours.every((h,i)=>raw.hourly.time[i]===h)
  &&[['daily',DAILY.split(','),16],['hourly',HOURLY.split(','),384]].every(([part,fields,size])=>fields.every(f=>
   Array.isArray(raw[part][f])&&raw[part][f].length===size&&raw[part][f].every(v=>v===null||typeof v==='number'&&Number.isFinite(v))));
}
function makeService({store,fetcher=require('./http.cjs').fetchForecast,now=Date.now,coverage='all',catalog=CATALOG,log=()=>{}}){
 const cities=new Map(catalog.filter(c=>coverage==='all'||c.featured).map(c=>[c.id,c]));
 const hot=new Map();
 function item(row,clock){
  const fetchedAt=Date.parse(row.fetchedAt),expiresAt=fetchedAt+HOUR;
  const usable=row.forecast&&Number.isFinite(fetchedAt)&&fetchedAt<=clock+5000&&clock-fetchedAt<6*HOUR;
  return {cityId:row.cityId,status:row.fresh&&usable?'fresh':usable?'stale':row.pending?'pending':'error',
   ...(usable?{forecast:row.forecast,fetchedAt,expiresAt}:{}),
   ...(!row.fresh?{retryAfter:Math.min(3600,Math.max(3,Math.ceil((Date.parse(row.retryAt)-clock)/1000)||3)),reason:row.failure||'updating'}:{})};
 }
 return {async get(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>16||ids.some(id=>typeof id!=='string'||!cities.has(id))){const error=Error('Unknown place or invalid batch (maximum 16)');error.status=400;throw error;}
  ids=[...new Set(ids)].sort();const clock=now(),date=baseDate(clock),owner=randomUUID(),result=new Map();
  for(const id of ids){const value=hot.get(id);if(value&&value.expiresAt>clock&&value.baseDate===date)result.set(id,{...value,baseDate:undefined});}
  const missing=ids.filter(id=>!result.has(id));
  if(!missing.length)return {version:1,items:ids.map(id=>result.get(id))};
  const rows=await store.claim(missing.map(id=>({id,profile:profileFor(cities.get(id))})),owner,date);
  const claimed=rows.filter(r=>r.claimed),byID=new Map(rows.map(r=>[r.cityId,r]));
  if(claimed.length){
   try{
    const points=claimed.map(r=>cities.get(r.cityId));
    // Two smaller upstream groups keep domestic-to-overseas transfers below the timeout.
    const groups=[];for(let i=0;i<points.length;i+=8)groups.push(points.slice(i,i+8));
    const outcomes=await Promise.all(groups.map(async group=>{
     try{
      const params=new URLSearchParams({...PROFILE,latitude:group.map(c=>c.lat).join(','),longitude:group.map(c=>c.lon).join(',')});
      const response=await fetcher(`https://api.open-meteo.com/v1/forecast?${params}`,{signal:AbortSignal.timeout(22000)});
      if(!response.ok){const error=Error('Upstream unavailable');error.rateLimited=response.status===429;error.retryAfter=Math.max(60,Number(response.headers.get('retry-after'))||180);throw error;}
      const payload=await response.json(),list=Array.isArray(payload)?payload:[payload];
      if(list.length!==group.length)throw Error('Invalid upstream point count');return {group,list};
     }catch(error){return {group,error};}
    }));
    const valid=[];
    for(const {group,list,error} of outcomes){
     const invalid=[];
     group.forEach((c,i)=>{if(!error&&validForecast(list[i],date))valid.push({cityId:c.id,profile:profileFor(c),forecast:list[i]});else invalid.push(c.id);});
     if(invalid.length){
      const reason=error?.rateLimited?'rate-limited':error?'upstream-unavailable':'invalid-forecast',cooldown=error?.rateLimited?Math.min(3600,error.retryAfter):60;
      await store.fail(owner,invalid,reason,cooldown);
      for(const id of invalid)byID.set(id,{...byID.get(id),pending:false,failure:reason,retryAt:new Date(now()+cooldown*1000).toISOString()});
      log({event:'weather-upstream-failed',points:invalid.length,reason,code:error?.code||error?.cause?.code||error?.name,detail:error?.message?.slice(0,160)});
     }
    }
    if(valid.length){
     const saved=await store.finish(owner,valid,date),times=new Map(saved.map(r=>[r.cityId,r.fetchedAt]));
     for(const value of valid){
      const stamp=times.get(value.cityId);
      if(stamp)byID.set(value.cityId,{cityId:value.cityId,fresh:true,forecast:value.forecast,fetchedAt:stamp});
      else byID.set(value.cityId,{...byID.get(value.cityId),fresh:false,pending:true});
     }
    }
    log({event:'weather-upstream',points:points.length,saved:valid.length});
   }catch(error){
    const reason=error.rateLimited?'rate-limited':'upstream-unavailable',cooldown=error.rateLimited?Math.min(3600,error.retryAfter):60;
    await store.fail(owner,claimed.map(r=>r.cityId),reason,cooldown);
    for(const row of claimed)byID.set(row.cityId,{...row,pending:false,failure:reason,retryAt:new Date(now()+cooldown*1000).toISOString()});
    log({event:'weather-upstream-failed',points:claimed.length,reason,code:error.code||error.cause?.code||error.name,detail:error.message?.slice(0,160)});
   }
  }
  for(const id of missing){
   const value=item(byID.get(id)||{cityId:id,pending:true},now());result.set(id,value);
   if(value.status==='fresh')hot.set(id,{...value,baseDate:date});
  }
  return {version:1,items:ids.map(id=>result.get(id))};
 },hot};
}
module.exports={makeService,validForecast,baseDate,profileFor,PROFILE,CATALOG};
