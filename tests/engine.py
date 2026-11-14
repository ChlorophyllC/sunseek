"""Forecast boundary checks in Chromium, with no HTTP requests."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from fixtures import payload_for, DATES

root=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page()
    page.add_script_tag(path=str(root/'weather.js'))
    result=page.evaluate('''({raw,dates})=>{
      const W=window.SunseekWeather;
      let checks=0;
      const assert=(condition,message)=>{checks++;if(!condition)throw new Error(message);};
      const city={id:'dali',lat:25.61,lon:100.27};
      const data=W.normalizeForecast(raw);
      const options={dates:dates.slice(1,4),hourStart:9,hourEnd:18,today:dates[0],currentHour:17,preference:'sun',min:null,max:null,strict:false,origin:null,maxDistance:null};
      const a=W.assess(city,data,options);
      assert(a.goodHours===27&&a.availableHours===27,'night rain must not remove sunny days');
      assert(a.score===a.breakdown.reduce((sum,p)=>sum+p.points,0),'score must equal explained parts');
      const late=W.assess(city,data,{...options,dates:[dates[0]]});
      assert(late.goodHours===1&&late.availableHours===1&&late.best.start===17,'elapsed hours must not count');
      const ended=W.assess(city,data,{...options,dates:[dates[0]],currentHour:19});
      assert(!ended.eligible&&ended.availableHours===0&&ended.days[0].requestedStart===19,'ended day must remain empty');
      const dark=W.assess(city,data,{...options,hourStart:6,hourEnd:8});
      assert(!dark.eligible&&dark.availableHours===0,'night hours must not count');
      const missing=JSON.parse(JSON.stringify(data));
      missing[1].hours=missing[1].hours.filter(h=>h.hour!==11);
      assert(!W.assess(city,missing,options).complete,'missing daylight slot must not count as zero rain');
      const storm=JSON.parse(JSON.stringify(data));
      storm[1].hours.find(h=>h.hour===21).code=95;
      assert(!W.assess(city,storm,options).eligible,'night thunderstorms still exclude unsafe city');
      const shifted=JSON.parse(JSON.stringify(raw));
      const hour9=shifted.hourly.time.indexOf(dates[1]+'T09:00');
      shifted.hourly.precipitation[hour9]=3;
      shifted.hourly.wind_gusts_10m[hour9]=44;
      const shiftedDay=W.normalizeForecast(shifted).find(d=>d.date===dates[1]);
      assert(shiftedDay.hours.find(h=>h.hour===8).precip===3,'preceding-hour accumulation must shift to interval start');
      assert(shiftedDay.hours.find(h=>h.hour===9).precip===0,'next interval must use next accumulation');
      assert(shiftedDay.hours.find(h=>h.hour===8).gust===44,'preceding-hour gust maximum must use interval end');
      const origin={id:'shanghai',lat:31.23,lon:121.47},suzhou={lat:31.30,lon:120.59};
      assert(W.distanceKm(origin,origin)===0,'same-point distance');
      const dist=W.distanceKm(origin,suzhou);
      assert(dist>70&&dist<100&&Math.abs(dist-W.distanceKm(suzhou,origin))<1e-9,'distance magnitude and symmetry');
      const now=Date.now(),cache=W.packCache(new Map([['dali',data]]),now);
      assert(W.unpackCache(cache,new Set(['dali']),now+2*3600000).data.size===1,'valid cached forecast');
      assert(W.unpackCache(cache,new Set(['dali']),now+6*3600000)===null,'expire exactly at max age');
      assert(W.unpackCache({...cache,time:now+1000},new Set(['dali']),now)===null,'future timestamp rejected');
      assert(W.unpackCache({...cache,source:'demo'},new Set(['dali']),now)===null,'demo never accepted as live cache');
      const planOptions={...options,dates, duration:3};
      const windows=W.departureWindows(city,data,planOptions);
      assert(windows.possible===13&&windows.complete===13&&windows.eligible===13,'future complete three-day windows');
      assert(windows.windows.length===3&&windows.windows[0].start===dates[1],'equal scores choose earlier departure and omit today');
      assert(windows.windows[1].start===dates[4]&&windows.windows[2].start===dates[7],'suggestions must not overlap');
      assert(windows.windows[0].goodHours===27,'window metrics use the same hourly scoring');
      const badDay=JSON.parse(JSON.stringify(data));
      badDay[2].hours.find(h=>h.hour===21).code=95;
      const safe=W.departureWindows(city,badDay,planOptions);
      assert(safe.windows[0].start===dates[3]&&safe.eligible===11,'night hazard excludes every overlapping trip');
      const incomplete=W.departureWindows(city,missing,planOptions);
      assert(incomplete.complete===12&&incomplete.windows[0].start===dates[2],'missing hourly data excludes overlapping windows');
      assert(W.departureWindows(city,data,{...planOptions,min:30}).eligible===0,'temperature filter applies to date suggestions');
      assert(W.departureWindows(city,data,{...planOptions,preference:'snow'}).eligible===0,'weather preference applies to date suggestions');
      assert(W.departureWindows(city,data,{...planOptions,hourStart:6,hourEnd:8}).eligible===0,'no daylight is not a travel window');
      assert(W.departureWindows(city,data,{...planOptions,duration:16}).possible===0,'do not extend the forecast horizon');
      assert(W.departureWindows(city,data,{...planOptions,duration:0}).possible===0,'reject invalid duration');
      const gaps=W.departureWindows(city,data,{...planOptions,dates:[dates[1],dates[3],dates[4]],duration:2});
      assert(gaps.possible===1&&gaps.windows[0].start===dates[3],'calendar gaps must not become consecutive days');
      return {checks,score:a.score,distanceKm:Math.round(dist)};
    }''',{'raw':payload_for('https://example.test/?latitude=25.61&longitude=100.27')[0],'dates':DATES})
    print('PASS pure forecast boundary checks:',result)
    browser.close()
