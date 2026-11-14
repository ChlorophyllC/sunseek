"""Shared place search: real atlas, qualified names, ranking, preview and async isolation."""
import json
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from playwright.sync_api import sync_playwright,expect
from fixtures import fixture

ROOT=Path(__file__).resolve().parent.parent
atlas=json.loads((ROOT/'assets/search-places.json').read_text())
assert len(atlas['rows'])>25000
assert atlas['license']=='CC BY 4.0' and len(atlas['sources'])==4
assert all(ctx[1][0] not in ['CN','TW','HK','MO'] for ctx in atlas['contexts'])
assert len({r[0] for r in atlas['rows']})==len(atlas['rows'])
assert all(len(s['sha256'])==64 for s in atlas['sources'])

with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 context=b.new_context(viewport={'width':1440,'height':1100},locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
 context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:false}");page=context.new_page();page.set_default_timeout(12000)
 errors=[];weather=[];geocoding=[];held=[];mode={'value':'empty'};loads=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def forecast(route):
  weather.extend(parse_qs(urlparse(route.request.url).query)['latitude'][0].split(','));fixture(route)
 def geocoder(route):
  geocoding.append(parse_qs(urlparse(route.request.url).query))
  if mode['value']=='hold':held.append(route);return
  if mode['value']=='fail':route.abort();return
  route.fulfill(json={})
 page.route('https://api.open-meteo.com/**',forecast)
 page.route('https://geocoding-api.open-meteo.com/**',geocoder)
 page.on('request',lambda r:loads.append(r.url) if r.url.endswith('/assets/search-places.json') else None)
 page.goto('http://localhost:4173',wait_until='domcontentloaded')
 expect(page.locator('#data-status')).to_contain_text('实时预报')
 assert len(weather)==48 and not loads
 assert page.locator('.filter-panel #discovery-scope').count()==1
 assert page.locator('.discovery-coverage,#discovery-hint,#region-dialog').count()==0
 page.locator('#region-search-btn').click();expect(page.locator('#search-dialog')).to_be_visible()
 assert not loads,'opening an empty search should not download the extended atlas'
 page.locator('#city-search').fill('象山县')
 expect(page.locator('#search-results [data-online-place]').first).to_contain_text('象山县')
 expect(page.locator('#search-results [data-online-place]').first).to_contain_text('宁波')
 assert len(loads)==1
 def query(q):
  page.locator('#city-search').fill(q)
  return page.locator('#search-results .search-result').first
 for q,leaf in [('宁海县','宁海县'),('慈溪市','慈溪市'),('宁波慈溪','慈溪'),('浙江宁波象山县','象山县'),('寧波象山縣','象山县')]:
  result=query(q);expect(result).to_contain_text(leaf);expect(result).to_contain_text('宁波')
 result=query('花鸟岛');expect(result).to_contain_text('岛屿');expect(result).to_contain_text('花鸟')
 result=query('安徽黄山');expect(result).to_have_attribute('data-open-city','huangshan');expect(result).to_contain_text('安徽')
 query('黄山');expect(page.locator('#search-results [data-open-city="huangshan"]')).to_be_visible()
 query('黃山');expect(page.locator('#search-results [data-open-city="huangshan"]')).to_be_visible()
 result=query('area-360200');expect(result).to_have_attribute('data-open-city','area-360200')
 result=query('新竹县');expect(result).to_have_attribute('data-open-city','geo-1675107')
 result=query('新竹市');expect(result).to_have_attribute('data-open-city','geo-1675103')
 assert len(weather)==48,'typing must not request weather for the search corpus'
 query('安徽黄山');page.locator('#city-search').press('Enter');expect(page.locator('.city-dialog-title h2')).to_have_text('黄山');expect(page.locator('.preview-badge')).to_have_count(0)
 page.keyboard.press('Escape')
 # Adding a place reuses known catalog results rather than creating a duplicate preview.
 page.locator('#add-place-btn').click();page.locator('#place-name').fill('景德镇');page.locator('#place-search-btn').click()
 expect(page.locator('#city-search')).to_have_value('景德镇')
 page.locator('#search-results [data-open-city="area-360200"]').click()
 expect(page.locator('.city-dialog-title h2')).to_have_text('景德镇');expect(page.locator('.preview-badge')).to_have_count(0)
 page.keyboard.press('Escape')
 # The island keeps its source label, coordinates and explicit preview/save semantics.
 page.locator('#region-search-btn').click();query('花鸟岛').click()
 expect(page.locator('.city-dialog-title h2')).to_have_text('花鸟山');expect(page.locator('.preview-badge')).to_contain_text('尚未保存')
 assert page.evaluate("localStorage.getItem('sunseek-places-v3')") is None
 page.keyboard.press('Escape')
 assert page.locator('#saved-places').is_hidden()
 print('PASS county/city affiliations, composite and traditional names, island type relevance, shared entry points, catalog reuse, no weather on typing')

 page.locator('#search-btn').click();query('安徽黄山');page.locator('#search-online').click()
 expect(page.locator('#online-results')).to_contain_text('在线暂无更多')
 assert geocoding[-1]['name']==['黄山'] and geocoding[-1]['count']==['100'] and geocoding[-1]['countryCode']==['CN']
 expect(page.locator('#search-results [data-open-city="huangshan"]')).to_be_visible()
 query('浙江宁波象山县');page.locator('#search-online').click();expect(page.locator('#online-results')).to_contain_text('在线暂无更多')
 assert geocoding[-1]['name']==['象山县'] and geocoding[-1]['countryCode']==['CN']
 query('台湾金门县');page.locator('#search-online').click();expect(page.locator('#online-results')).to_contain_text('在线暂无更多')
 assert geocoding[-1]['name']==['金门县'] and geocoding[-1]['countryCode']==['TW']
 query('景德镇');page.locator('#search-online').click();expect(page.locator('#online-results')).to_contain_text('在线暂无更多')
 assert geocoding[-1]['name']==['景德镇'],'do not strip a genuine city name ending in 镇'
 mode['value']='fail';query('象山县');page.locator('#search-online').click()
 expect(page.locator('#online-results')).to_contain_text('在线搜索暂时不可用');expect(page.locator('#search-results .search-result').first).to_contain_text('宁波')
 mode['value']='hold';query('旧查询村');page.locator('#search-online').click();page.wait_for_timeout(100)
 assert held
 query('宁海县');held.pop(0).fulfill(json={'results':[{'id':999999,'name':'旧查询村','latitude':29.3,'longitude':121.4,'country_code':'CN'}]})
 expect(page.locator('#search-results .search-result').first).to_contain_text('宁海县');expect(page.locator('#search-results')).not_to_contain_text('旧查询村')
 page.keyboard.press('Escape');mode['value']='empty'
 page.locator('#region-search-btn').click();query('华北');page.locator('#city-search').press('ArrowDown');page.keyboard.press('Enter')
 expect(page.locator('#region-filter')).to_have_value('华北')
 print('PASS general query planning, upstream failures keep local results, stale remote response isolation, keyboard scope selection')

 page.locator('#region-filter').select_option('710000');page.wait_for_function("!document.querySelector('#data-status').textContent.includes('更新中')")
 expect(page.locator('#map-scope-note')).to_contain_text('22 个已收录地点')
 ids=page.evaluate("SunseekPlaces.buildCatalog([],[]).filter(c=>c.code===710000).map(c=>c.id)")
 assert len(ids)==22 and len(set(ids))==22
 for q,city_id in [('台中','geo-9613500'),('臺南','geo-1668352'),('花莲','geo-1674502'),('金门县','geo-1676511'),('连江县','geo-6724655')]:
  page.locator('#search-btn').click();expect(query(q)).to_have_attribute('data-open-city',city_id);page.keyboard.press('Escape')
 # Source Taiwan identity takes precedence over a nearby mainland coastline for outlying islands.
 page.locator('#search-btn').click();query('金城');page.locator('#search-results [data-online-place]').filter(has_text='台湾').first.click()
 expect(page.locator('.preview-badge')).to_be_visible();expect(page.locator('.city-dialog-title')).to_contain_text('金城')
 assert page.locator('#place-dialog').is_hidden()
 page.locator('[data-save-preview]').click()
 saved=json.loads(page.evaluate("localStorage.getItem('sunseek-places-v3')"));assert saved[0]['code']==710000
 page.keyboard.press('Escape');page.reload(wait_until='domcontentloaded')
 expect(page.locator('#saved-places')).to_contain_text('金城')
 page.locator(f'[data-edit-place="{saved[0]["id"]}"]').click();page.locator('#place-form button[type=submit]').click()
 expect(page.locator('.city-dialog-title')).to_contain_text('金城');page.keyboard.press('Escape')
 page.locator(f'[data-remove-place="{saved[0]["id"]}"]').click()
 page.locator('#map-national').click();expect(page.locator('#discovery-progress')).to_contain_text('48 个候选')
 print('PASS Taiwan 22 counties/cities, distinct county/city identities, simplified/traditional names, offshore source identity and fixed default scope')

 for width in [360,390,768,1440]:
  page.set_viewport_size({'width':width,'height':1100});page.screenshot(path=f'/tmp/sunseek-search-layout-{width}.png',full_page=True)
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),width
  page.locator('#region-search-btn').click();query('浙江宁波象山县')
  expect(page.locator('#search-results .search-result').first).to_contain_text('象山县')
  assert page.locator('#search-dialog').bounding_box()['width']<=width
  assert not page.locator('#search-dialog').evaluate('(n)=>n.scrollWidth>n.clientWidth'),width
  if width in [390,1440]:page.screenshot(path=f'/tmp/sunseek-search-dialog-{width}.png')
  page.keyboard.press('Escape')
 assert len(loads)==2 and not errors,errors
 context.close()
 # A failed lazy atlas cannot break base/add-place search; a later opening retries it.
 context=b.new_context();context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:false}");page=context.new_page();page.route('https://api.open-meteo.com/**',fixture);page.route('https://geocoding-api.open-meteo.com/**',lambda r:r.fulfill(json={}))
 page.route('**/assets/search-places.json',lambda r:r.abort());page.goto('http://localhost:4173')
 page.locator('#search-btn').click();page.locator('#city-search').fill('景德镇');expect(page.locator('#search-results [data-open-city="area-360200"]')).to_be_visible()
 expect(page.locator('#search-index-status')).to_contain_text('扩展地名索引暂不可用')
 page.keyboard.press('Escape');page.unroute('**/assets/search-places.json');page.locator('#region-search-btn').click();page.locator('#city-search').fill('宁海县')
 expect(page.locator('#search-results .search-result').first).to_contain_text('宁波')
 assert not errors,errors
 print('PASS compact desktop/mobile filters, search dialog layout, lazy-load reuse and retry without losing base places')
 b.close()
