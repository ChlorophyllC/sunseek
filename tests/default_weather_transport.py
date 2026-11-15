"""Production defaults: direct transport survives a broken shared service/module, with no cloud calls."""
import json
from urllib.parse import parse_qs,urlparse
from playwright.sync_api import sync_playwright,expect
from fixtures import payload_for

def healthy(route):
 payload=payload_for(route.request.url)
 for raw in payload:
  raw['daily']['temperature_2m_max']=[v if v is not None else 22 for v in raw['daily']['temperature_2m_max']]
  raw['hourly']['apparent_temperature']=[v if v is not None else 22 for v in raw['hourly']['apparent_temperature']]
 route.fulfill(json=payload)

with sync_playwright() as p:
 browser=p.chromium.launch()
 for missing_module,legacy_module in [(False,False),(True,False),(False,True)]:
  context=browser.new_context(locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
  page=context.new_page();page.set_default_timeout(10000);shared=[];direct=[];errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*.tencentscf.com/**',lambda r:(shared.append(r.request.url),r.abort()))
  if missing_module:page.route('**/assets/weather-client.js*',lambda r:r.abort())
  if legacy_module:page.route('**/assets/weather-client.js*',lambda r:r.fulfill(content_type='application/javascript',body="window.SunseekWeatherClient={configuration:()=>({enabled:true}),request:()=>{throw Error('Old cloud module should be unused')}}"))
  def direct_weather(route):
   direct.append(route.request.url);healthy(route)
  page.route('https://api.open-meteo.com/**',direct_weather)
  page.goto('http://localhost:4173')
  expect(page.locator('#data-status')).to_contain_text('实时预报')
  expect(page.locator('#discovery-progress')).to_contain_text('48 个候选 · 48 个完整')
  assert page.evaluate('window.SUNSEEK_WEATHER_SERVICE===undefined'),'test must use production defaults'
  assert len(direct)==3 and not shared,(len(direct),shared)
  assert sum(len(parse_qs(urlparse(u).query)['latitude'][0].split(',')) for u in direct)==48
  if not missing_module and not legacy_module:assert page.evaluate('SunseekWeatherClient.configuration().enabled') is False
  page.reload();expect(page.locator('#data-status')).to_contain_text('缓存预报')
  expect(page.locator('#discovery-progress')).to_contain_text('48 个候选 · 48 个完整')
  assert len(direct)==3 and not shared,'warm reload should use local cache'
  page.locator('#region-filter').select_option('370000')
  expect(page.locator('#map-scope-note')).to_contain_text('16 个所选时段预报完整')
  after=len(direct)
  page.locator('#region-filter').select_option('all')
  expect(page.locator('#discovery-progress')).to_contain_text('48 个候选')
  assert len(direct)==after and not shared and not errors,(shared,errors)
  context.close()
 browser.close()
 print('PASS default cold/warm/province/national requests bypass shared cloud; missing or older cached optional module does not block weather')
