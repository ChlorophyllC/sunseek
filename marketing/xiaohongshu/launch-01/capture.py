"""Capture actual mobile UI using the product's explicit demo mode, with no live APIs."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parent
with sync_playwright() as p:
 browser=p.chromium.launch()
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
 blocked=[]
 def restrict(route):
  if route.request.url.startswith('http://localhost:4173/'):route.continue_()
  else:blocked.append(route.request.url);route.abort()
 context.route('**/*',restrict)
 context.add_init_script('window.SUNSEEK_WEATHER_SERVICE={enabled:false};window.SUNSEEK_OBJECT_WEATHER_SERVICE={enabled:false};')
 page=context.new_page();page.set_default_timeout(15000)
 page.goto('http://localhost:4173/',wait_until='load')
 page.locator('#about-btn').click();page.locator('#demo-weather').click()
 expect(page.locator('#data-status')).to_contain_text('示例')
 if page.locator('#about-dialog').evaluate('(n)=>n.open'):page.locator('#about-dialog [data-close-dialog]').first.click()
 page.locator('.filter-main').screenshot(path=str(ROOT/'screens/preference-main.png'))
 page.locator('.map-panel').screenshot(path=str(ROOT/'screens/map.png'))
 page.locator('.map-container').screenshot(path=str(ROOT/'screens/map-canvas.png'))
 page.locator('#search-btn').click();page.locator('#city-search').fill('大理')
 page.locator('#search-results [data-open-city="dali"]').click()
 expect(page.locator('#city-dialog')).to_be_visible()
 page.locator('#departure-options summary').click()
 bounds=page.locator('#departure-options').bounding_box();first=page.locator('.departure-option').first.bounding_box()
 page.screenshot(path=str(ROOT/'screens/departure-preview.png'),clip={**bounds,'height':first['y']+first['height']-bounds['y']+6})
 page.locator('#city-dialog [data-close-dialog]').first.click()
 page.locator('#search-btn').click();page.locator('#city-search').fill('宁海县')
 expect(page.locator('#search-results')).to_contain_text('宁海')
 page.locator('#city-search').blur();page.locator('#search-dialog').screenshot(path=str(ROOT/'screens/search.png'))
 (ROOT/'screens/manifest.json').write_text(json.dumps({'mode':'explicit-product-demo','weather':'illustrative, not a real forecast','viewport':{'width':390,'height':844,'deviceScaleFactor':2},'externalRequestsBlocked':len(blocked),'liveWeatherRequests':0,'postgresQueries':0},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'captured':sorted(f.name for f in (ROOT/'screens').glob('*.png')),'liveWeatherRequests':0}))
 context.close();browser.close()
