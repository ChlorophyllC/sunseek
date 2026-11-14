"""Search request budgets: idle delay, local exhaustion, IME, separate lists and bounded cache."""
import sys
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from fixtures import fixture

sys.stdout.reconfigure(line_buffering=True)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 context=b.new_context(viewport={'width':1440,'height':1100},locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
 page=context.new_page();page.set_default_timeout(12000);page.clock.install(time=datetime.now())
 calls=[];held=[];errors=[];mode={'value':'normal'}
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://api.open-meteo.com/**',fixture)
 def geocoder(route):
  calls.append(route.request.url)
  if mode['value']=='hold':held.append(route);return
  if mode['value']=='fail':route.abort();return
  name='新增测试海湾' if mode['value']=='new' else '测试海湾'
  route.fulfill(json={'results':[{'id':19999999,'name':name,'latitude':29.5,'longitude':121.6,'country_code':'CN','admin1':'浙江','admin2':'宁波市','feature_code':'PPL'}]})
 page.route('https://geocoding-api.open-meteo.com/**',geocoder)
 page.goto('http://localhost:4173');expect(page.locator('#data-status')).to_contain_text('实时预报')
 page.locator('#search-btn').click();page.locator('#city-search').fill('象山县');expect(page.locator('#search-results')).to_contain_text('宁波');expect(page.locator('#search-index-status')).to_be_empty()
 page.clock.run_for(1500);assert not calls,'a local match must not query online just because typing stopped'
 expect(page.locator('#online-results')).to_be_hidden()
 # Local results remain in the same order when explicitly requesting an online supplement.
 local_ids=page.locator('#search-results .search-result').all_text_contents()
 page.locator('#search-online').click();expect(page.locator('#online-results')).to_be_visible()
 expect(page.locator('#online-results')).to_contain_text('在线暂无更多')
 assert page.locator('#search-results .search-result').all_text_contents()==local_ids and len(calls)==1
 # Empty local result: only the final query after one full idle second is sent.
 page.locator('#city-search').fill('测试海');page.clock.run_for(600);assert len(calls)==1
 page.locator('#city-search').fill('测试海湾');page.clock.run_for(999);assert len(calls)==1
 page.clock.run_for(1);expect(page.locator('#online-search-results .search-result')).to_contain_text('测试海湾');assert len(calls)==2
 expect(page.locator('#search-results')).not_to_contain_text('测试海湾')
 page.locator('#city-search').fill('测');page.clock.run_for(1500);assert len(calls)==2
 page.locator('#city-search').fill('测试海湾');page.clock.run_for(1000)
 expect(page.locator('#online-search-results .search-result')).to_contain_text('测试海湾');assert len(calls)==2,'repeat query should use the tab cache'
 print('PASS local-first behavior, separate results, stable ordering, 1 s idle reset, one-character suppression and positive cache')

 # Native IME composition may take longer than the debounce without making requests or opening a result.
 page.locator('#city-search').dispatch_event('compositionstart');page.locator('#city-search').fill('合成测试海湾')
 page.clock.run_for(1800);page.locator('#city-search').press('Enter');assert len(calls)==2
 expect(page.locator('#search-dialog')).to_be_visible()
 page.locator('#city-search').fill('新增测试海湾');page.locator('#city-search').dispatch_event('compositionend');mode['value']='new'
 page.clock.run_for(999);assert len(calls)==2
 page.clock.run_for(1);expect(page.locator('#online-search-results .search-result')).to_contain_text('新增测试海湾');assert len(calls)==3
 page.locator('#city-search').fill('关闭测试海湾');page.keyboard.press('Escape');page.clock.run_for(2000);assert len(calls)==3
 page.locator('#search-btn').click();page.locator('#city-search').fill('黄山');page.clock.run_for(1000)
 assert len(calls)==3
 assert page.locator('#search-scroll').evaluate('(n)=>n.scrollHeight>n.clientHeight')
 while page.locator('[data-search-more]').count():
  page.locator('#search-scroll').evaluate('(n)=>{n.scrollTop=n.scrollHeight;n.dispatchEvent(new Event("scroll"))}')
 page.locator('#search-scroll').evaluate('(n)=>{n.scrollTop=n.scrollHeight;n.dispatchEvent(new Event("scroll"))}')
 expect(page.locator('#online-results')).to_be_visible();expect(page.locator('#online-results')).to_contain_text('在线暂无更多');assert len(calls)==4
 page.locator('#city-search').fill('江苏');page.clock.run_for(1100);count=len(calls)
 assert page.locator('[data-search-more]').count()==1
 before=page.locator('#search-results .search-result').count()
 page.locator('#search-scroll').evaluate('(n)=>{n.scrollTop=n.scrollHeight;n.dispatchEvent(new Event("scroll"))}')
 assert page.locator('#search-results .search-result').count()>before and len(calls)==count,'load remaining local pages before querying online'
 page.clock.run_for(1200);assert len(calls)==count
 print('PASS IME and Enter isolation, close cancellation, bottom-of-list trigger and local pagination before online lookup')

 # One request per query while pending; changing query isolates a late response.
 mode['value']='hold';page.locator('#city-search').fill('迟到测试海湾');page.locator('#search-online').click();page.wait_for_timeout(100)
 count=len(calls);assert held
 page.locator('#search-online').evaluate('(n)=>n.dispatchEvent(new MouseEvent("click",{bubbles:true}))');page.clock.run_for(1500);assert len(calls)==count
 page.locator('#city-search').fill('宁海县');held.pop().fulfill(json={'results':[{'id':99999,'name':'迟到测试海湾','latitude':29.5,'longitude':121.6,'country_code':'CN'}]})
 expect(page.locator('#search-results')).to_contain_text('宁海县');expect(page.locator('#online-results')).to_be_hidden()
 # Failures can be manually retried; empty results are cached briefly.
 mode['value']='fail';page.locator('#city-search').fill('失败测试海湾');page.locator('#search-online').click()
 expect(page.locator('#online-results')).to_contain_text('在线搜索暂时不可用');count=len(calls)
 mode['value']='normal';page.locator('#search-online').click();expect(page.locator('#online-results')).to_contain_text('在线暂无更多');assert len(calls)==count+1
 page.locator('#city-search').fill('其他空结果');page.locator('#search-online').click();expect(page.locator('#online-results')).to_contain_text('在线暂无更多');count=len(calls)
 page.locator('#city-search').fill('宁海县');page.locator('#city-search').fill('其他空结果');page.locator('#search-online').click()
 expect(page.locator('#online-results')).to_contain_text('在线暂无更多');assert len(calls)==count
 # The provider returned unrelated data above, but a real empty payload gets a 2 minute TTL.
 page.route('https://geocoding-api.open-meteo.com/**',lambda r:(calls.append(r.request.url),r.fulfill(json={})))
 page.locator('#city-search').fill('真正空结果');page.locator('#search-online').click();expect(page.locator('#online-results')).to_contain_text('在线暂无更多');count=len(calls)
 page.locator('#search-online').click();assert len(calls)==count
 page.clock.fast_forward(120001);page.locator('#search-online').click();expect(page.locator('#online-results')).to_contain_text('在线暂无更多');assert len(calls)==count+1
 assert not errors,errors
 print('PASS in-flight deduplication, stale-response isolation, explicit error retry and empty-cache expiry')
 context.close()
 # A slow atlas is not mistaken for an empty local search and does not trigger an online lookup early.
 context=b.new_context();page=context.new_page();page.clock.install(time=datetime.now());held_atlas=[];requests=[]
 page.route('https://api.open-meteo.com/**',fixture)
 page.route('**/assets/search-places.json',lambda r:held_atlas.append(r))
 page.route('https://geocoding-api.open-meteo.com/**',lambda r:(requests.append(r.request.url),r.fulfill(json={})))
 page.goto('http://localhost:4173');page.locator('#search-btn').click();page.locator('#city-search').fill('宁海县');page.clock.run_for(1800)
 assert held_atlas and not requests
 held_atlas.pop().fulfill(path=Path(__file__).resolve().parent.parent/'assets/search-places.json',content_type='application/json')
 expect(page.locator('#search-results')).to_contain_text('宁波');page.clock.run_for(1500);assert not requests
 print('PASS pending local atlas is awaited before an automatic online lookup')
 b.close()
