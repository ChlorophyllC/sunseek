'use strict';

// Pure forecast and ranking functions. No network, DOM, storage, or implicit clock.
window.SunseekWeather = (() => {
  const HOUR_FIELDS = ['hour','code','temp','feels','precip','snow','wind','gust','cloud','isDay'];
  const DAY_FIELDS = ['date','code','max','min','rainProbability','precip','snow','wind','gust'];
  const HAZARD_CODES = new Set([48,56,57,65,66,67,75,82,86,95,96,99]);
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const average = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
  const stampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:00$/;
  const validDate = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

  function distanceKm(a,b) {
    if(!a || !b)return null;
    const rad=n=>n*Math.PI/180;
    const dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon);
    const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;
    return 6371.0088*2*Math.atan2(Math.sqrt(clamp(h,0,1)),Math.sqrt(1-clamp(h,0,1)));
  }
  function validHour(h) {
    return h && HOUR_FIELDS.every(k=>finite(h[k])) && Number.isInteger(h.hour) && h.hour>=0 && h.hour<=23
      && [0,1].includes(h.isDay) && h.cloud>=0 && h.cloud<=100 && h.precip>=0 && h.snow>=0 && h.wind>=0 && h.gust>=0;
  }
  function validDay(d) {
    return d && validDate(d.date) && DAY_FIELDS.slice(1).every(k=>finite(d[k])) && d.max>=d.min
      && d.rainProbability>=0 && d.rainProbability<=100 && d.precip>=0 && d.snow>=0 && d.wind>=0 && d.gust>=0;
  }
  function isHazard(d) {
    return HAZARD_CODES.has(d.code) || d.wind>=50 || d.gust>=70 || d.precip>=50 || d.snow>=15;
  }
  function matchesHour(h,preference) {
    if(!validHour(h) || !h.isDay || HAZARD_CODES.has(h.code) || h.wind>=50 || h.gust>=70)return false;
    if(preference==='sun')return [0,1,2].includes(h.code) && h.cloud<=40 && h.precip<=0.1 && h.snow===0;
    if(preference==='snow')return [71,73,77,85].includes(h.code) && h.snow>0 && h.snow<=2;
    if(preference==='rain')return [51,53,55,61,63,80,81].includes(h.code) && h.precip>0 && h.precip<=2.5 && h.snow===0 && h.wind<25 && h.gust<40;
    return h.feels>=15 && h.feels<=25 && h.precip<=0.2 && h.snow===0 && h.wind<25 && h.gust<40;
  }
  function normalizeForecast(response) {
    const d=response?.daily,h=response?.hourly;
    if(!Array.isArray(d?.time) || !Array.isArray(h?.time))return [];
    const slots=new Map();
    const positions=new Map(h.time.map((time,i)=>[time,i]));
    for(let i=0;i<h.time.length;i++){
      const stamp=h.time[i];
      if(typeof stamp!=='string' || !stampPattern.test(stamp))continue;
      const date=stamp.slice(0,10),hour=Number(stamp.slice(11,13));
      // Rain/snow accumulations and maximum gusts describe the preceding hour.
      // A [09:00,10:00) slot uses their 10:00 values with 09:00 instantaneous conditions.
      const next=hour<23?positions.get(`${date}T${String(hour+1).padStart(2,'0')}:00`):undefined;
      const slot={hour,code:h.weather_code?.[i],temp:h.temperature_2m?.[i],feels:h.apparent_temperature?.[i],
        precip:next===undefined?null:h.precipitation?.[next],snow:next===undefined?null:h.snowfall?.[next],
        wind:h.wind_speed_10m?.[i],gust:next===undefined?null:h.wind_gusts_10m?.[next],cloud:h.cloud_cover?.[i],isDay:h.is_day?.[i]};
      if(!slots.has(date))slots.set(date,[]);
      slots.get(date).push(slot);
    }
    const dates=new Set();
    return d.time.map((date,i)=>({date,code:d.weather_code?.[i],max:d.temperature_2m_max?.[i],min:d.temperature_2m_min?.[i],
      rainProbability:d.precipitation_probability_max?.[i],precip:d.precipitation_sum?.[i],snow:d.snowfall_sum?.[i],
      wind:d.wind_speed_10m_max?.[i],gust:d.wind_gusts_10m_max?.[i],hours:slots.get(date)||[]})).filter(day=>{
        if(!validDay(day) || dates.has(day.date))return false;
        dates.add(day.date);return true;
      });
  }
  function analyzeDay(day,options) {
    const firstHour=day.date===options.today?Math.max(options.hourStart,options.currentHour):options.hourStart;
    const requested=[];
    for(let hour=firstHour;hour<options.hourEnd;hour++)requested.push(hour);
    const byHour=new Map((day.hours||[]).map(h=>[h.hour,h]));
    const slots=requested.map(hour=>byHour.get(hour));
    const complete=slots.every(h=>h && [0,1].includes(h.isDay) && (!h.isDay || validHour(h)));
    const daylight=slots.filter(h=>h && h.isDay===1 && validHour(h));
    const matching=daylight.filter(h=>matchesHour(h,options.preference));
    let run=null,best=null;
    for(const h of matching){
      if(run && run.end===h.hour){run.end=h.hour+1;run.length++;}
      else run={date:day.date,start:h.hour,end:h.hour+1,length:1};
      if(!best || run.length>best.length)best={...run};
    }
    const matched=complete && daylight.length>0 && matching.length>=Math.ceil(daylight.length/2);
    return {...day,slots,daylight,matching,complete,requestedStart:firstHour,availableHours:daylight.length,matchedHours:matching.length,matched,best,
      feels:average(daylight.map(h=>h.feels)),maxGust:daylight.length?Math.max(...daylight.map(h=>h.gust)):null};
  }
  function assess(city,rawDays,options) {
    const byDate=new Map((rawDays||[]).filter(validDay).map(d=>[d.date,d]));
    const days=options.dates.map(date=>byDate.get(date)).filter(Boolean).map(d=>analyzeDay(d,options));
    const complete=days.length===options.dates.length && days.every(d=>d.complete);
    const hazardous=days.some(isHazard) || days.some(d=>(d.hours||[]).some(h=>h && (HAZARD_CODES.has(h.code)||h.wind>=50||h.gust>=70)));
    const daylight=days.flatMap(d=>d.daylight);
    const goodHours=days.reduce((a,d)=>a+d.matchedHours,0),availableHours=days.reduce((a,d)=>a+d.availableHours,0);
    const matchCount=days.filter(d=>d.matched).length;
    const best=days.map(d=>d.best).filter(Boolean).sort((a,b)=>b.length-a.length||a.date.localeCompare(b.date))[0]||null;
    const ideal=options.preference==='snow'?-3:options.preference==='cool'?20:22;
    const meanFeels=average(daylight.map(h=>h.feels));
    const comfort=average(daylight.map(h=>clamp(1-Math.abs(h.feels-ideal)/20,0,1)))||0;
    const windComfort=average(daylight.map(h=>clamp(1-h.wind/50,0,1)))||0;
    const breakdown=[
      {label:'合拍小时',points:Math.round((availableHours?goodHours/availableHours:0)*60),max:60,detail:'合拍小时 ÷ 可用白昼小时'},
      {label:'连续时段',points:Math.round(Math.min((best?.length||0)/4,1)*15),max:15,detail:'最长连续 4 小时及以上得满分'},
      {label:'体感舒适',points:Math.round(comfort*15),max:15,detail:`逐小时体感与 ${ideal}°C 的接近程度`},
      {label:'风速舒适',points:Math.round(windComfort*10),max:10,detail:'按日间小时平均风速计算'}
    ];
    const score=complete && availableHours>0?breakdown.reduce((a,b)=>a+b.points,0):null;
    const tempOK=days.every(d=>(options.min===null||d.max>=options.min)&&(options.max===null||d.max<=options.max));
    const distance=distanceKm(options.origin,city);
    const distanceOK=distance===null || (city.id!==options.origin.id && (options.maxDistance===null||distance<=options.maxDistance));
    const min=days.length?Math.min(...days.map(d=>d.min)):null,max=days.length?Math.max(...days.map(d=>d.max)):null;
    const mean=average(days.map(d=>d.max));
    const caution=hazardous?'有强风、强雨雪、冻雨或雷暴，已排除':!complete?'所选时段预报不完整':!availableHours?'所选时段没有可用的白昼小时':
      days.some(d=>d.max-d.min>=12)?'早晚温差较大，记得准备外套':meanFeels!==null&&meanFeels<5?'日间体感偏冷，注意保暖':meanFeels!==null&&meanFeels>29?'日间体感偏热，注意补水':
      daylight.some(h=>h.gust>=35)?'部分时段阵风较明显':goodHours<availableHours?`有 ${availableHours-goodHours} 小时未匹配偏好，可安排室内活动`:'天气仍可能变化，出发前再确认';
    return {...city,days,complete,hazardous,availableHours,goodHours,matchCount,expected:options.dates.length,best,meanFeels,score,breakdown,
      min,max,mean,distance,distanceOK,tempOK,caution,eligible:complete&&!hazardous&&availableHours>0&&goodHours>0&&tempOK&&distanceOK&&(!options.strict||matchCount===options.dates.length)};
  }
  function packCache(data,time) {
    return {version:2,time,source:'open-meteo',data:[...data].map(([id,days])=>[id,days.map(d=>[...DAY_FIELDS.map(k=>d[k]),(d.hours||[]).map(h=>HOUR_FIELDS.map(k=>h[k]??null))])])};
  }
  function unpackCache(cache,validIDs,now,maxAge=6*3600000) {
    if(!cache || cache.version!==2 || cache.source!=='open-meteo' || !finite(cache.time) || now<cache.time || now-cache.time>=maxAge || !Array.isArray(cache.data))return null;
    const data=new Map();
    for(const entry of cache.data){
      if(!Array.isArray(entry)||!validIDs.has(entry[0])||!Array.isArray(entry[1]))continue;
      const days=[];
      for(const row of entry[1]){
        if(!Array.isArray(row)||row.length!==10||!Array.isArray(row[9]))continue;
        const day=Object.fromEntries(DAY_FIELDS.map((key,i)=>[key,row[i]]));
        if(!validDay(day))continue;
        day.hours=row[9].filter(h=>Array.isArray(h)&&h.length===HOUR_FIELDS.length).map(h=>Object.fromEntries(HOUR_FIELDS.map((key,i)=>[key,h[i]])));
        days.push(day);
      }
      if(days.length)data.set(entry[0],days);
    }
    return data.size?{data,time:cache.time}:null;
  }
  return Object.freeze({distanceKm,validHour,validDay,isHazard,matchesHour,normalizeForecast,analyzeDay,assess,packCache,unpackCache});
})();
