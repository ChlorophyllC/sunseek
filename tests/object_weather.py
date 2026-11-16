"""48-point object transport, static cross-user hits and original local weather behavior."""
import gzip,hashlib,json,re,time
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from playwright.sync_api import sync_playwright,expect
from fixtures import payload_for

ROOT=Path(__file__).resolve().parent.parent
source=(ROOT/'assets/weather-service-config.js').read_text()
config=json.loads(source.split('={...',1)[1].split(',enabled:',1)[0])
config.update(enabled=True,endpoint='/api/weather-object')
catalog=json.loads((ROOT/'server/weather-object-cache/catalog.json').read_text());by_id={c['id']:c for c in catalog}
cached={};files={};functions=[];provider=[];direct=[];mode='ok';seen=set();stamp=int(time.time()*1000)-20*60000

def healthy(url):
 raw=payload_for(url)
 for row in raw:
  row['timezone']='Asia/Shanghai'
  row['daily']['temperature_2m_max']=[v if v is not None else 22 for v in row['daily']['temperature_2m_max']]
  row['hourly']['apparent_temperature']=[v if v is not None else 22 for v in row['hourly']['apparent_temperature']]
 return raw

def serve(route):
 ids=parse_qs(urlparse(route.request.url).query)['ids'][0].split(',');functions.append(ids)
 assert ids==sorted(set(ids)) and all(id in by_id for id in ids)
 if mode=='outage':route.fulfill(status=503,json={'error':'Unavailable'});return
 if mode=='partial-outage' and len(ids)==1:route.fulfill(status=503,json={'error':'Unavailable'});return
 if mode=='limit':route.fulfill(json={'version':1,'contract':config['contract'],'items':[{'cityId':id,'status':'error','reason':'rate-limited','retryAfter':61} for id in ids]});return
 items=[]
 for id in ids:
  if mode=='partial-outage' and id==ids[-1]:items.append({'cityId':id,'status':'pending','retryAfter':3});continue
  if mode=='pending' and id not in seen:seen.add(id);items.append({'cityId':id,'status':'pending','retryAfter':3});continue
  if id not in cached:
   c=by_id[id];raw=healthy(f"https://fixture/?latitude={c['lat']}&longitude={c['lon']}")[0]
   cached[id]={'cityId':id,'status':'fresh','fetchedAt':stamp,'expiresAt':stamp+3600000,'forecast':raw};provider.append(id)
  items.append(cached[id])
 payload={'version':1,'contract':config['contract'],'baseDate':time.strftime('%Y-%m-%d',time.gmtime(time.time()+8*3600)),'items':items}
 if all(i['status']=='fresh' for i in items):
  key=hashlib.sha256((config['contract']+'\n'+','.join(ids)).encode()).hexdigest();hour=int(time.time()//3600)
  files[f"/{config['cacheBase']}/{config['contract']}/{key}/{hour}.json.gz"]=gzip.compress(json.dumps(payload).encode())
 route.fulfill(json=payload)

def static(route):
 path=urlparse(route.request.url).path
 if path in files:route.fulfill(body=files[path],content_type='application/gzip')
 else:route.fulfill(status=404,body='missing')

def setup(browser,missing=False):
 context=browser.new_context(locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
 context.add_init_script('window.SUNSEEK_OBJECT_WEATHER_SERVICE='+json.dumps(config))
 page=context.new_page();page.set_default_timeout(20000);page.route('**/api/weather-object?**',serve);page.route('**/_weather-shared/v2/batches/**',static)
 page.route('https://api.open-meteo.com/**',lambda r:(direct.append(r.request.url),r.fulfill(json=healthy(r.request.url))))
 page.route('**/*.tencentscf.com/**',lambda r:(_ for _ in ()).throw(AssertionError('old PG cache must be unused')))
 if missing:page.route('**/assets/weather-object-client.js*',lambda r:r.abort())
 page.goto('http://localhost:4173');return context,page

def settle(page):page.wait_for_function("!document.querySelector('#data-status').textContent.includes('连接')&&!document.querySelector('#data-status').textContent.includes('更新中')")
def times(page):return page.evaluate("JSON.parse(localStorage.getItem('sunseek-weather-v3')).forecasts.map(f=>f.time)")

with sync_playwright() as p:
 browser=p.chromium.launch()
 a,page=setup(browser);settle(page);expect(page.locator('#discovery-progress')).to_contain_text('48 个候选 · 48 个完整')
 assert len(provider)==48 and len(functions)==3 and not direct
 assert set(times(page))=={stamp};before=len(functions);page.reload();settle(page);assert len(functions)==before
 b,other=setup(browser);settle(other);expect(other.locator('#discovery-progress')).to_contain_text('48 个候选 · 48 个完整')
 assert len(functions)==before and len(provider)==48 and not direct,'new browser must read static cache without worker calls'
 assert set(times(other))=={stamp}
 reverse=config['ids'][:16][::-1]
 assert other.evaluate('async ids=>(await SunseekObjectWeatherClient.request(ids,new AbortController().signal)).map(i=>i.cityId)',reverse)==reverse
 other.locator('#region-filter').select_option('370000');settle(other);expect(other.locator('#map-scope-note')).to_contain_text('16 个所选时段预报完整')
 assert direct and len(functions)==before,'nonfeatured province points remain direct'
 other.locator('#region-filter').select_option('all');settle(other);expect(other.locator('#discovery-progress')).to_contain_text('48 个候选')
 a.close();b.close();print('PASS 48 cold, static cross-browser reuse without function calls, original timestamps, local reload and mixed provincial scope')

 # A cache generated now must not make an old source forecast fresh.
 for key,data in list(files.items()):
  payload=json.loads(gzip.decompress(data))
  for item in payload['items']:item['fetchedAt']-=2*3600000;item['expiresAt']-=2*3600000
  files[key]=gzip.compress(json.dumps(payload).encode())
 before=len(functions);c,recovery=setup(browser);settle(recovery);assert len(functions)==before+3 and len(provider)==48
 assert set(times(recovery))=={stamp};c.close();print('PASS stale public objects cannot renew source TTL; worker reuses valid persisted data')

 files.clear();mode='limit';before=len(functions);direct_count=len(direct);d,limited=setup(browser);settle(limited)
 assert len(functions)==before+1 and len(direct)==direct_count,'quota must stop queue without direct fan-out'
 d.close();mode='outage';before=len(functions);e,failed=setup(browser);settle(failed)
 assert len(functions)==before+1 and len(direct)==direct_count;e.close()
 mode='ok';before=len(functions);f,missing=setup(browser,True);settle(missing)
 assert len(functions)==before and len(direct)==direct_count;f.close()
 mode='pending';g,waiting=setup(browser);settle(waiting);expect(waiting.locator('#discovery-progress')).to_contain_text('48 个候选 · 48 个完整')
 assert len(seen)==48 and len(provider)==48 and len(direct)==direct_count;g.close()
 print('PASS quota/outage/missing module do not fan out; bounded pending polling preserves 48-point cache')

 files.clear();mode='partial-outage';before=len(functions);h,partial=setup(browser);settle(partial)
 expect(partial.locator('#discovery-progress')).to_contain_text('48 个候选 · 15 个完整')
 assert len(functions)==before+2 and len(functions[-1])==1 and len(direct)==direct_count
 assert len(times(partial))==15 and set(times(partial))=={stamp},'successful partial results must survive later service outage without renewing source times'
 failed=partial.evaluate("JSON.parse(localStorage.getItem('sunseek-weather-v3')).forecasts.flatMap(f=>f.data.map(d=>d[0]))")
 assert set(failed)==set(functions[before][:-1])
 h.close();browser.close()
 print('PASS partial 503 retains 15 valid points in UI/local cache, stops later batches and does not fan out')
