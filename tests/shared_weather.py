"""Shared transport integration across isolated browsers, catalog scopes and failure recovery."""
import json,time
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from playwright.sync_api import sync_playwright,expect
from fixtures import payload_for
catalog=json.loads((Path(__file__).resolve().parent.parent/'server/weather-cache/catalog.json').read_text())
by_id={c['id']:c for c in catalog};cached={};calls=[];upstream=[];direct=[];mode='ok';pending_seen=set()
stamp=int(time.time()*1000)-20*60*1000

def shared(route):
 ids=parse_qs(urlparse(route.request.url).query)['ids'][0].split(',');calls.append(ids)
 assert 1<=len(ids)<=16 and ids==sorted(set(ids))
 if mode=='fail':route.fulfill(status=503,json={'error':'temporarily unavailable'});return
 if mode=='limit':route.fulfill(json={'version':1,'items':[{'cityId':id,'status':'error','reason':'rate-limited','retryAfter':61} for id in ids]});return
 items=[]
 for id in ids:
  if mode=='pending' and id not in pending_seen:
   pending_seen.add(id);items.append({'cityId':id,'status':'pending','retryAfter':3});continue
  if id not in cached:
   c=by_id[id];raw=payload_for(f"https://fixture/?latitude={c['lat']}&longitude={c['lon']}")[0]
   if id=='dali':raw['daily']['temperature_2m_max'][-1]=None
   cached[id]={'cityId':id,'status':'fresh','fetchedAt':stamp,'expiresAt':stamp+3600000,'forecast':raw};upstream.append(id)
  items.append(cached[id])
 route.fulfill(json={'version':1,'items':items})

def page_for(browser,missing_module=False):
 context=browser.new_context(locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
 context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:true,endpoint:'/api/weather'}")
 page=context.new_page();page.set_default_timeout(20000)
 page.route('**/api/weather?**',shared)
 if missing_module:page.route('**/assets/weather-client.js',lambda r:r.abort())
 page.route('https://api.open-meteo.com/**',lambda r:(direct.append(r.request.url),r.abort()))
 page.route('https://geocoding-api.open-meteo.com/**',lambda r:r.fulfill(json={}))
 page.goto('http://localhost:4173');return context,page

def settle(page):
 page.wait_for_function("!document.querySelector('#data-status').textContent.includes('连接') && !document.querySelector('#data-status').textContent.includes('更新中')")

def times(page):return page.evaluate("JSON.parse(localStorage.getItem('sunseek-weather-v3')).forecasts.map(f=>f.time)")

with sync_playwright() as p:
 browser=p.chromium.launch()
 a,page=page_for(browser);settle(page)
 assert len(upstream)==48 and len(calls)==3,(len(upstream),len(calls))
 assert set(times(page))=={stamp},'server fetchedAt must survive local persistence'
 before_reload=len(calls);page.reload();settle(page);reloaded={id for batch in calls[before_reload:] for id in batch};assert reloaded<={'shenzhen'},'a null last day must not cause repeat fetches inside the hour'
 page.locator('#region-filter').select_option('370000');settle(page)
 provincial=len(upstream);assert provincial>48
 page.locator('#region-filter').select_option('all');settle(page)
 expect(page.locator('#discovery-progress')).to_contain_text('48 个候选')
 assert len(upstream)==provincial
 b,other=page_for(browser);settle(other);assert len(upstream)==provincial
 other.locator('#discovery-scope').select_option('all');settle(other)
 assert len(upstream)==len(set(upstream))==506
 expect(other.locator('#discovery-progress')).to_contain_text('506 个候选')
 assert set(times(other))=={stamp}
 print('PASS two isolated browsers, 48-to-province-to-national isolation, all 506 demand-filled without duplicate upstream locations')
 # Manual refresh still uses shared records and preserves their original age.
 other.locator('#data-status').click();expect(other.locator('#about-dialog')).to_be_visible()
 other.locator('#retry-weather').click();settle(other)
 assert len(upstream)==506 and set(times(other))=={stamp}
 mode='fail';other.locator('#retry-weather').click();settle(other)
 expect(other.locator('#data-status')).to_contain_text('缓存预报')
 assert set(times(other))=={stamp} and not direct,'shared outage must not trigger browser direct fallback'
 a.close();b.close()
 mode='pending';c,waiting=page_for(browser);settle(waiting)
 expect(waiting.locator('#data-status')).to_contain_text('实时预报');assert len(pending_seen)==48 and len(upstream)==506
 assert not direct
 c.close()
 mode='ok';d,limited=page_for(browser);settle(limited);before=len(calls);persisted=len(times(limited));mode='limit'
 limited.locator('#discovery-scope').select_option('all');settle(limited)
 assert len(calls)==before+1,'shared quota must stop the remainder of the full-catalog queue'
 expect(limited.locator('#discovery-progress')).to_contain_text(str(506-persisted)+' 个获取失败')
 assert not direct
 d.close();before=len(calls);e,missing=page_for(browser,missing_module=True);settle(missing)
 expect(missing.locator('#data-status')).to_contain_text('暂无可用预报')
 assert len(calls)==before and not direct,'module load failure must also avoid upstream fan-out'
 e.close();browser.close()
 print('PASS source timestamps, bounded pending polling, manual cache reuse and outage fallback and full-catalog quota stop without upstream fan-out')
