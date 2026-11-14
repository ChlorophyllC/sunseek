"""Opt-in real endpoint check from two isolated browsers. Run only with --live."""
import argparse,json
from playwright.sync_api import sync_playwright,expect
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--live',action='store_true',required=True);p.parse_args()
ENDPOINT='https://1330730699-86nlrqp1le.ap-shanghai.tencentscf.com/api/weather'
with sync_playwright() as p:
 browser=p.chromium.launch();original=None;report=[]
 for index in range(2):
  context=browser.new_context(locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
  context.add_init_script('window.SUNSEEK_WEATHER_SERVICE='+json.dumps({'enabled':True,'endpoint':ENDPOINT}))
  page=context.new_page();errors=[];direct=[];responses=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:responses.append(r) if r.url.startswith(ENDPOINT) else None)
  page.route('https://api.open-meteo.com/**',lambda r:(direct.append(r.request.url),r.abort()))
  page.goto('http://localhost:4173')
  expect(page.locator('#data-status')).to_contain_text('实时预报',timeout=90000)
  page.wait_for_function("!document.querySelector('#data-status').textContent.includes('更新中')")
  entries=page.evaluate("JSON.parse(localStorage.getItem('sunseek-weather-v3')).forecasts.map(f=>({id:f.data[0][0],time:f.time,days:f.data[0][1].length}))")
  source={i['cityId']:i['fetchedAt'] for r in responses for i in r.json()['items']}
  print(json.dumps({'browser':index+1,'persistedPlaces':len(entries),'receivedPlaces':len(source),'normalizedDays':sorted(set(e['days'] for e in entries))}),flush=True)
  assert len(source)==48 and entries and all(e['time']==source[e['id']] for e in entries)
  expect(page.locator('#discovery-progress')).to_contain_text('48 个候选')
  assert all(len(i['forecast']['daily']['time'])==16 and len(i['forecast']['hourly']['time'])==384 for r in responses for i in r.json()['items'])
  stamps=source
  if original is None:original=stamps
  else:assert stamps==original,'a second isolated browser must retain all 48 source timestamps'
  assert len(responses)==3 and not direct and not errors,(len(responses),direct,errors)
  report.append({'browser':index+1,'sharedRequests':len(responses),'receivedPlaces':len(source),'persistedPlaces':len(entries),'browserDirectRequests':len(direct)})
  page.reload();expect(page.locator('#data-status')).to_contain_text('缓存预报',timeout=20000)
  page.wait_for_function("!document.querySelector('#data-status').textContent.includes('更新中')")
  assert len(responses)==3,'warm reload must not query the shared server again solely because the provider last day is incomplete'
  context.close()
 browser.close();print('PASS real public cache and CORS from two isolated browsers:',json.dumps(report))
