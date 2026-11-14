"""Destination browsing/search/custom-place tests using mock forecast and geocoder APIs."""
import json,sys
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from playwright.sync_api import sync_playwright,expect
from fixtures import fixture
sys.stdout.reconfigure(line_buffering=True)

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1440,'height':1100},locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
 page=context.new_page();page.set_default_timeout(8000)
 errors=[];requests=[]
 page.on('pageerror',lambda e:(errors.append(str(e)),print('JS ERROR',str(e))))
 def forecast(route):
  requests.append(parse_qs(urlparse(route.request.url).query)['latitude'][0].split(','));fixture(route)
 page.route('https://api.open-meteo.com/**',forecast)
 def geocoder(route):
  route.fulfill(content_type='application/json',body=json.dumps({'results':[{'id':1805780,'name':'宏村','latitude':30.00361,'longitude':117.98167,'country_code':'CN','country':'中国','admin1':'安徽','admin2':'黄山市'}]}))
 page.route('https://geocoding-api.open-meteo.com/**',geocoder)
 page.goto('http://localhost:4173',wait_until='domcontentloaded')
 expect(page.locator('#data-status')).to_contain_text('实时预报',timeout=15000)
 assert sum(map(len,requests))==48
 initial_cache=json.loads(page.evaluate("localStorage.getItem('sunseek-weather-v3')"))
 initial_times={f['data'][0][0]:f['time'] for f in initial_cache['forecasts']}
 top=page.locator('#recommendation-list .destination-province').all_text_contents()
 assert len(set(text.split(' · ')[0] for text in top))==3,top
 expect(page.locator('#province-alternatives')).to_contain_text('云南还有')
 page.locator('.province-more summary').first.click()
 expect(page.locator('.province-more[open] [data-open-city]').first).to_be_visible()
 page.locator('#sort-order').select_option('weather')
 expect(page.locator('#province-alternatives')).to_be_empty()
 page.locator('#sort-order').select_option('score')
 print('PASS featured geographic diversity, same-province alternatives, explicit weather-only sort')

 page.locator('#show-all-btn').click()
 expect(page.locator('#all-sort-order')).to_have_value('score')
 all_provinces=[text.split(' · ')[0] for text in page.locator('#all-cards .destination-province').all_text_contents()]
 assert len(set(all_provinces[:len(set(all_provinces))]))==len(set(all_provinces))
 counts={};rounds=[]
 for province_name in all_provinces:
  rounds.append(counts.get(province_name,0));counts[province_name]=rounds[-1]+1
 assert rounds==sorted(rounds)
 all_ids=page.locator('#all-cards [data-city]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.city)')
 assert len(all_ids)==len(set(all_ids))
 assert page.locator('#recommendation-list [data-city]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.city)')==all_ids[:3]
 assert page.locator('#all-sort-order option[value=distance]').evaluate('(option)=>option.disabled')
 page.locator('#all-sort-order').select_option('weather')
 expect(page.locator('#sort-order')).to_have_value('weather')
 scores=page.locator('#all-cards .match-score').evaluate_all('(nodes)=>nodes.map(n=>parseInt(n.textContent))')
 assert scores==sorted(scores,reverse=True)
 assert set(page.locator('#all-cards [data-city]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.city)'))==set(all_ids)
 page.locator('#sort-order').select_option('score')
 expect(page.locator('#all-sort-order')).to_have_value('score')
 page.locator('#all-destinations').screenshot(path='/tmp/sunseek-all-regional.png')
 page.locator('#collapse-results').click()
 page.locator('#region-search-btn').click()
 page.locator('#region-search').fill('不存在的地区')
 expect(page.locator('#region-search-results')).to_contain_text('没有找到')
 page.locator('#region-search').fill('华东');page.locator('#region-search').press('Enter')
 expect(page.locator('#region-filter')).to_have_value('华东')
 expect(page.locator('#map-scope-name')).to_have_text('华东')
 page.locator('#region-search-btn').click();page.locator('#region-search').fill('云南省')
 expect(page.locator('#region-search-results [data-select-region]')).to_have_count(1)
 page.locator('#region-search').press('ArrowDown');page.keyboard.press('Enter')
 expect(page.locator('#region-filter')).to_have_value('530000')
 expect(page.locator('#region-dialog')).not_to_be_visible()
 page.wait_for_function("!document.querySelector('#data-status').textContent.includes('更新中')")
 page.locator('#map-national').click()
 print('PASS full-list geographic rounds, no lost/duplicate destinations, synchronized sorting, searchable regions and keyboard selection')

 national_path=page.locator('[data-province="330000"]').get_attribute('d')
 for region in ['华东','华南','华中','华北','西南','西北','东北']:
  page.locator('#region-filter').select_option(region)
  expect(page.locator('#map-scope-name')).to_have_text(region)
  assert page.locator('[data-province="330000"]').get_attribute('d')!=national_path
  assert page.locator('#island-inset').evaluate('(node)=>getComputedStyle(node).display')=='none'
  if region=='华南':page.locator('.map-panel').screenshot(path='/tmp/sunseek-south-map.png')
 page.locator('#map-national').click()
 assert page.locator('[data-province="330000"]').get_attribute('d')==national_path
 province=page.locator('[data-province="630000"]')
 point=page.locator('#map-viewport').evaluate('(node)=>{const p=new DOMPoint(61+(96-73)*12.15,32+(54-35)*12.65).matrixTransform(node.getScreenCTM());return {x:p.x,y:p.y}}')
 page.mouse.move(point['x'],point['y'])
 assert page.locator('#province-hover path').get_attribute('d')==province.get_attribute('d')
 page.locator('#map-national').hover()
 expect(page.locator('#province-hover path')).to_have_count(0)
 province.focus()
 assert page.locator('#province-hover path').get_attribute('d')==province.get_attribute('d')
 assert page.locator('#province-hover').evaluate('(node)=>getComputedStyle(node).pointerEvents')=='none'
 assert page.locator('#province-hover').evaluate("node=>!!(document.querySelector('#province-paths').compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)")
 page.locator('.map-panel').screenshot(path='/tmp/sunseek-hover-map.png')
 page.locator('#map-national').focus()
 expect(page.locator('#province-hover path')).to_have_count(0)
 for code in ['810000','820000']:
  page.locator('#region-filter').select_option(code)
  assert page.evaluate("code=>{const a=LOCAL_BOUNDARIES.features.find(f=>f.properties.adcode===Number(code));const b=CHINA_GEO.features.find(f=>f.properties.adcode===Number(code));return JSON.stringify(a.geometry).length>JSON.stringify(b.geometry).length*3}",code)
  page.wait_for_function("!document.querySelector('#data-status').textContent.includes('更新中')")
  page.locator('.map-panel').screenshot(path=f'/tmp/sunseek-map-{code}.png')
 page.locator('#map-national').click()
 print('PASS seven regional map extents, national reset, unobstructed focus outline, detailed Hong Kong/Macao outlines')

 page.locator('#search-btn').click();page.locator('#city-search').fill('云南')
 expect(page.locator('#search-results [data-open-province="530000"]')).to_be_visible()
 page.locator('#search-results [data-open-province="530000"]').click()
 expect(page.locator('#region-filter')).to_have_value('530000')
 expect(page.locator('#map-scope-name')).to_have_text('云南')
 page.wait_for_function("!document.querySelector('#data-status').textContent.includes('更新中')")
 assert sum(map(len,requests))>48
 expect(page.locator('#map-scope-note')).to_contain_text('已收录地点')
 assert page.locator('#city-markers [data-map-city^="area-"]').count()>0
 province_path=page.locator('[data-province="530000"]').get_attribute('d')
 page.locator('#map-national').click()
 assert page.locator('[data-province="530000"]').get_attribute('d')!=province_path
 print('PASS province search, projected province map, on-demand city weather, national return')

 page.locator('#search-btn').click();page.locator('#city-search').fill('景德镇')
 expect(page.locator('#search-results .search-result')).to_have_count(1)
 page.locator('#search-results .search-result').click()
 expect(page.locator('.city-dialog-title h2')).to_have_text('景德镇')
 expect(page.locator('.city-dialog-hero .place-placeholder')).to_be_visible()
 expect(page.locator('.city-dialog-hero img')).to_have_count(0)
 expect(page.locator('.detail-metrics')).not_to_contain_text('—',timeout=8000)
 expanded_cache=json.loads(page.evaluate("localStorage.getItem('sunseek-weather-v3')"))
 expanded_times={f['data'][0][0]:f['time'] for f in expanded_cache['forecasts']}
 assert all(expanded_times[id]==stamp for id,stamp in initial_times.items())
 assert expanded_times['area-360200']>max(initial_times.values())
 print('PASS incremental weather fetch preserves every existing destination timestamp')
 page.locator('[data-origin-city]').filter(has_text='设为出发地').click()
 expect(page.locator('#origin-city')).to_have_value('area-360200')
 page.locator('#origin-city').select_option('')
 print('PASS ordinary-city lookup, weather-on-demand, neutral illustration, using an ordinary city as origin')

 page.locator('#add-place-btn').click();page.locator('#place-search-btn').click();page.locator('#city-search').fill('宏村')
 expect(page.locator('[data-online-place="0"]')).to_contain_text('宏村')
 page.locator('#city-search').fill('宏')
 page.wait_for_timeout(600)
 expect(page.locator('[data-online-place]')).to_have_count(0)
 page.locator('#city-search').fill('宏村')
 expect(page.locator('[data-online-place="0"]')).to_contain_text('宏村')
 page.locator('[data-online-place="0"]').click()
 expect(page.locator('#place-name')).to_have_value('宏村')
 expect(page.locator('#place-province')).to_have_value('340000')
 page.locator('#place-form button[type=submit]').click()
 expect(page.locator('.city-dialog-title h2')).to_have_text('宏村')
 expect(page.locator('.detail-metrics')).not_to_contain_text('—',timeout=8000)
 custom=json.loads(page.evaluate("localStorage.getItem('sunseek-places-v3')"));custom_id=custom[0]['id']
 assert len(custom)==1
 page.locator('#city-dialog [data-compare]').click()
 page.locator('#city-dialog [data-visit]').click()
 page.keyboard.press('Escape')
 expect(page.locator('#saved-places')).to_be_visible()
 page.reload(wait_until='domcontentloaded')
 expect(page.locator('#visited-count')).to_have_text('1')
 page.locator('#footprints-nav').click();expect(page.locator('#visited-content')).to_contain_text('宏村')
 expect(page.locator(f'[data-remove-place="{custom_id}"]')).to_be_disabled()
 page.locator(f'#visited-content [data-visit="{custom_id}"]').click()
 page.locator(f'[data-edit-place="{custom_id}"]').click()
 page.locator('#place-name').fill('<img src=x onerror=alert(1)>')
 page.locator('#place-form button[type=submit]').click()
 expect(page.locator('.city-dialog-title h2')).to_have_text('<img src=x onerror=alert(1)>')
 expect(page.locator('.city-dialog-title h2 img')).to_have_count(0)
 page.keyboard.press('Escape')
 page.locator(f'[data-edit-place="{custom_id}"]').click();page.locator('#place-name').fill('宏村');page.locator('#place-form button[type=submit]').click();page.keyboard.press('Escape')
 print('PASS online search, confirm/save, custom weather/compare/footprints persistence, edit, XSS escaping')

 page.locator('#add-place-btn').click()
 page.locator('#place-name').fill('测试地点');page.locator('#place-lat').fill('35.6');page.locator('#place-lon').fill('139.7')
 assert not page.locator('#place-form').evaluate('(form)=>form.checkValidity()')
 page.locator('#place-lat').fill('30.00361');page.locator('#place-lon').fill('117.98167');page.locator('#place-province').select_option('530000')
 page.locator('#place-form button[type=submit]').click();expect(page.locator('#place-error')).to_contain_text('安徽')
 page.keyboard.press('Escape')
 page.locator('#add-place-btn').click()
 page.locator('#place-name').fill('宏村');page.locator('#place-lat').fill('30.00361');page.locator('#place-lon').fill('117.98167');page.locator('#place-province').select_option('530000')
 page.locator('#place-form button[type=submit]').click();expect(page.locator('#place-error')).to_contain_text('安徽')
 page.keyboard.press('Escape')
 page.locator('#region-filter').select_option('530000')
 page.locator('#map-pick').click()
 marker=page.locator('[data-map-city="kunming"]')
 # Pick the city marker's geographic origin after translating through its SVG transform.
 marker.scroll_into_view_if_needed()
 point=marker.evaluate('(node)=>{const p=new DOMPoint(0,0).matrixTransform(node.getScreenCTM());return {x:p.x,y:p.y}}')
 page.mouse.click(point['x'],point['y'])
 expect(page.locator('#place-dialog')).to_be_visible()
 expect(page.locator('#place-province')).to_have_value('530000')
 assert abs(float(page.locator('#place-lat').input_value())-25.04)<.03,(point,page.locator('#place-lat').input_value(),page.locator('#place-lon').input_value())
 page.keyboard.press('Escape')
 print('PASS coordinate validation, province mismatch, province map point picking')

 page.locator('#map-national').click()
 page.locator('#search-btn').click();page.locator('#city-search').fill('宏村');page.locator('#search-online').click();page.locator('[data-online-place="0"]').click();page.locator('#place-form button[type=submit]').click()
 expect(page.locator('.city-dialog-title h2')).to_have_text('宏村')
 assert len(json.loads(page.evaluate("localStorage.getItem('sunseek-places-v3')")))==1
 page.keyboard.press('Escape')
 page.locator(f'[data-open-city="{custom_id}"]').first.click()
 page.locator('[data-focus-city]').click()
 expect(page.locator('#map-scope-name')).to_have_text('宏村附近')
 page.locator(f'[data-remove-place="{custom_id}"]').click()
 expect(page.locator('#map-scope-name')).to_have_text('安徽')
 expect(page.locator('#saved-places')).not_to_be_visible()
 assert not errors,errors
 print('PASS duplicate place reuse and removal without orphaned saved records')
 page.locator('#search-btn').click();page.locator('#city-search').fill('未收录村庄')
 page.route('https://geocoding-api.open-meteo.com/**',lambda route:route.abort())
 page.locator('#search-online').click();expect(page.locator('#online-results')).to_contain_text('在线搜索暂时不可用')
 page.locator('#city-search').fill('景德镇');expect(page.locator('#search-results .search-result')).to_have_count(1)
 page.keyboard.press('Escape')
 print('PASS online lookup failure keeps local search available')

 page.screenshot(path='/tmp/sunseek-v3-desktop.png',full_page=True)
 for width in [360,390,768,1024]:
  page.set_viewport_size({'width':width,'height':900})
  page.wait_for_timeout(180)
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),width
  page.locator('#region-search-btn').click()
  assert page.locator('#region-dialog').bounding_box()['width']<=width
  page.keyboard.press('Escape')
  page.locator('#show-all-btn').click()
  expect(page.locator('#all-sort-order')).to_be_visible()
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),width
  if width==390:page.locator('#all-destinations .panel-heading').screenshot(path='/tmp/sunseek-all-controls-mobile.png')
  page.locator('#collapse-results').click()
  page.locator('#add-place-btn').click()
  assert page.locator('#place-dialog').bounding_box()['width']<=width
  page.keyboard.press('Escape')
  if width==390:page.screenshot(path='/tmp/sunseek-v3-mobile.png',full_page=True)
 print('PASS responsive map tools, added-place dialog, 4 viewport widths')
 legacy={'version':2,'source':'open-meteo','time':min(initial_times.values()),'data':[entry for f in initial_cache['forecasts'] for entry in f['data']]}
 page.evaluate("cache=>{localStorage.removeItem('sunseek-weather-v3');localStorage.setItem('sunseek-weather-v2',JSON.stringify(cache));}",legacy)
 request_count=len(requests)
 page.reload(wait_until='domcontentloaded')
 page.wait_for_function("!document.querySelector('#data-status').textContent.includes('更新中')")
 # The fixture deliberately gives Shenzhen no valid daily temperatures; only it needs refetching.
 assert [lat for batch in requests[request_count:] for lat in batch]==['22.54']
 page.locator('#search-btn').click();page.locator('#city-search').fill('大理')
 page.locator('#search-results [data-open-city="dali"]').click()
 expect(page.locator('.detail-metrics')).not_to_contain_text('—')
 page.keyboard.press('Escape')
 page.locator('#search-btn').click();page.locator('#city-search').fill('景德镇');page.locator('#search-results .search-result').click()
 expect(page.locator('.detail-metrics')).not_to_contain_text('—',timeout=8000)
 migrated=json.loads(page.evaluate("localStorage.getItem('sunseek-weather-v3')"))
 migrated_times={f['data'][0][0]:f['time'] for f in migrated['forecasts']}
 assert all(migrated_times[id]==legacy['time'] for id in initial_times if id!='shenzhen')
 assert migrated_times['area-360200']>legacy['time']
 assert not errors,errors
 print('PASS v0.2 cache reuse and migration retains original timestamps alongside new forecasts')
 browser.close()
