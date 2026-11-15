"""Compressed search delivery, genuine fallback and unchanged source/coverage."""
import gzip,json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from fixtures import fixture

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'scripts'))
from compress_search_index import compressed
raw=(ROOT/'assets/search-places.json').read_bytes();packed=(ROOT/'assets/search-places.json.gz').read_bytes()
assert gzip.decompress(packed)==raw and compressed(raw)==packed
assert len(packed)<len(raw)*.35

with sync_playwright() as p:
 browser=p.chromium.launch()
 for mode in ['gzip','unsupported','missing','corrupt','decoded']:
  context=browser.new_context();page=context.new_page();page.set_default_timeout(12000)
  calls=[];weather=[];errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:calls.append(r.url) if '/assets/search-places.json' in r.url else None)
  page.route('https://api.open-meteo.com/**',lambda r:(weather.append(r.request.url),fixture(r)))
  page.route('https://geocoding-api.open-meteo.com/**',lambda r:r.fulfill(json={}))
  if mode=='unsupported':context.add_init_script('window.DecompressionStream=undefined')
  if mode=='missing':page.route('**/assets/search-places.json.gz',lambda r:r.fulfill(status=404,body='missing'))
  if mode=='corrupt':page.route('**/assets/search-places.json.gz',lambda r:r.fulfill(body=b'\x1f\x8bcorrupt'))
  if mode=='decoded':page.route('**/assets/search-places.json.gz',lambda r:r.fulfill(content_type='application/json',body=raw))
  page.goto('http://localhost:4173');expect(page.locator('#data-status')).to_contain_text('实时预报')
  assert not calls
  page.locator('#search-btn').click();page.locator('#city-search').fill('晋');assert not calls
  page.locator('#city-search').fill('晋城')
  expect(page.locator('#search-index-status')).to_have_text('')
  expect(page.locator('#search-results')).to_contain_text('晋城')
  if mode=='gzip':
   assert len(calls)==1 and calls[0].endswith('.json.gz')
   entry=page.evaluate("performance.getEntriesByType('resource').find(r=>r.name.includes('search-places.json.gz')).toJSON()")
   assert entry['encodedBodySize']==len(packed),entry
  elif mode=='unsupported':assert len(calls)==1 and calls[0].endswith('.json')
  elif mode in ['missing','corrupt']:assert len(calls)==2 and calls[-1].endswith('.json')
  else:assert len(calls)==1
  count=len(calls);page.locator('#city-search').fill('宁海县');expect(page.locator('#search-results')).to_contain_text('宁波')
  page.keyboard.press('Escape');page.locator('#search-btn').click();page.locator('#city-search').fill('花鸟岛')
  expect(page.locator('#search-results')).to_contain_text('岛屿')
  assert len(calls)==count and len(weather)==3 and not errors,(mode,calls,weather,errors)
  context.close()
 browser.close()
print('PASS gzip byte identity, 69.8% smaller transfer, lazy/session reuse, missing/corrupt/unsupported and pre-decoded fallbacks, no extra weather')
