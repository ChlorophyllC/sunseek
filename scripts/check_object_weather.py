"""Explicit live 48-point cold/static-warm check. No PostgreSQL or full-catalog scan.

Default is offline preview. A live run may fill missing featured forecasts once;
it does not force-refresh valid points or install any scheduled task.
"""
import argparse,json,re,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from deploy_tencent import ROOT

def main(live=False,output=None):
 target=json.loads((ROOT/'scripts/weather-object-target.json').read_text())
 text=(ROOT/'assets/weather-service-config.js').read_text();config=json.loads(text.split('={...',1)[1].split(',enabled:',1)[0])
 if not live:print(json.dumps({'live':False,'coverage':len(config['ids']),'postgresQueries':0,'forceRefresh':False}));return
 if not target['endpoint']:raise RuntimeError('Object function URL is not configured')
 config.update(enabled=True,endpoint=target['endpoint'],cacheBase=target['origin']+'/_weather-shared/v2/batches')
 report={'coverage':48,'postgresQueries':0,'cold':{},'warm':{},'errors':[]}
 with sync_playwright() as p:
  browser=p.chromium.launch()
  def reader(label):
   context=browser.new_context(locale='zh-CN',timezone_id='Asia/Shanghai');page=context.new_page();page.set_default_timeout(20000)
   context.route('https://api.open-meteo.com/**',lambda r:r.abort())
   context.route('https://geocoding-api.open-meteo.com/**',lambda r:r.abort())
   blocked=[];responses=[]
   def route(r):
    if r.request.url.startswith(target['endpoint']):r.continue_()
    else:blocked.append(r.request.url);r.abort()
   context.route('**/*.tencentscf.com/**',route)
   page.on('response',lambda r:responses.append(r) if r.url.startswith(target['endpoint']) else None)
   page.on('pageerror',lambda e:report['errors'].append(str(e)))
   page.goto(target['origin'],wait_until='domcontentloaded',timeout=45000)
   if not page.locator('#data-status').count():
    consent=page.get_by_role('button',name=re.compile('确定访问'));expect(consent).to_be_enabled(timeout=30000);consent.click()
   expect(page.locator('#data-status')).to_be_visible(timeout=20000)
   page.wait_for_function('!!window.SunseekWeather')
   page.evaluate('config=>window.SUNSEEK_OBJECT_WEATHER_SERVICE=config',config)
   page.add_script_tag(content=(ROOT/'assets/weather-object-client.js').read_text())
   started=time.monotonic();rows=[]
   for i in range(0,48,16):
    row=page.evaluate('''async ids=>{
     const start=performance.now(),items=await SunseekObjectWeatherClient.request(ids,new AbortController().signal);
     return {elapsedMs:Math.round(performance.now()-start),items:items.map(i=>({id:i.cityId,status:i.status,reason:i.reason,fetchedAt:i.fetchedAt,date:i.forecast?.daily?.time?.[0],days:i.forecast?SunseekWeather.normalizeForecast(i.forecast).length:0}))};
    }''',config['ids'][i:i+16]);rows.append(row)
   elapsed=round(time.monotonic()-started,2)
   bodies=[r.json() for r in responses]
   result={'seconds':elapsed,'functionRequests':len(responses),'upstreamPoints':sum(b.get('upstreamPoints',0) for b in bodies),'upstreamFailures':[failure for b in bodies for failure in b.get('upstreamFailures',[])],'batches':rows,'oldPGRequests':len(blocked)}
   if blocked:raise RuntimeError('Legacy PG path was requested')
   context.close();return result
  try:
   report['cold']=reader('cold')
   assert all(i['status']=='fresh' for b in report['cold']['batches'] for i in b['items']),report['cold']
   report['warm']=reader('warm')
   assert report['warm']['functionRequests']==0 and report['warm']['upstreamPoints']==0,report['warm']
   cold={i['id']:i['fetchedAt'] for b in report['cold']['batches'] for i in b['items']};warm={i['id']:i['fetchedAt'] for b in report['warm']['batches'] for i in b['items']}
   assert len(cold)==48 and cold==warm and not report['errors']
   report['passed']=True
  finally:
   browser.close()
   if output:Path(output).write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--live',action='store_true');parser.add_argument('--output');args=parser.parse_args();main(args.live,args.output)
