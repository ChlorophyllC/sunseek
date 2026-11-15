'use strict';
const {createHash}=require('node:crypto');
const CATALOG=require('./catalog.json');
const PROFILE={daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max',hourly:'weather_code,temperature_2m,apparent_temperature,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,cloud_cover,is_day',timezone:'Asia/Shanghai',forecast_days:'16',wind_speed_unit:'kmh',precipitation_unit:'mm',temperature_unit:'celsius'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const CONTRACT=hash(JSON.stringify({version:2,profile:PROFILE,catalog:CATALOG}));
const HOUR=3600000,MAX_AGE=6*HOUR;
const baseDate=now=>new Date(now+8*HOUR).toISOString().slice(0,10);
const profileFor=city=>hash(JSON.stringify({version:2,...city,...PROFILE}));
const batchKey=ids=>hash(CONTRACT+'\n'+[...new Set(ids)].sort().join(','));
function validForecast(raw,date){
 const dates=Array.from({length:16},(_,i)=>new Date(Date.parse(date+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 return raw?.timezone==='Asia/Shanghai'&&raw.daily?.time?.length===16&&raw.hourly?.time?.length===384
  &&dates.every((d,i)=>raw.daily.time[i]===d)&&dates.every((d,i)=>Array.from({length:24},(_,h)=>`${d}T${String(h).padStart(2,'0')}:00`).every((t,h)=>raw.hourly.time[i*24+h]===t))
  &&[['daily',PROFILE.daily,16],['hourly',PROFILE.hourly,384]].every(([part,fields,size])=>fields.split(',').every(k=>Array.isArray(raw[part][k])&&raw[part][k].length===size&&raw[part][k].every(v=>v===null||typeof v==='number'&&Number.isFinite(v))));
}
module.exports={CATALOG,PROFILE,CONTRACT,HOUR,MAX_AGE,baseDate,profileFor,batchKey,validForecast};
