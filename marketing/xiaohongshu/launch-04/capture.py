"""Capture local mobile layout with explicit sample data and revised caption wording."""
import functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(REPO)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)+'/'
replacements={'演示':'示例','界面':'画面','网页':'页面','工具':'方式'}
reviewed=[]
def revise(page,selector):
 text=page.locator(selector).evaluate('''(node, pairs)=>{
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let current;
  while(current=walker.nextNode()){
   if(['SCRIPT','STYLE'].includes(current.parentElement?.tagName))continue;
   let text=current.nodeValue;for(const [a,b] of Object.entries(pairs))text=text.split(a).join(b);current.nodeValue=text;
  }
  return node.innerText;
 }''',replacements)
 assert not any(term in text for term in replacements)
 reviewed.append({'selector':selector,'text':text})
try:
 with sync_playwright() as p:
  browser=p.chromium.launch()
  context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
  context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base) else r.abort())
  context.add_init_script('window.SUNSEEK_WEATHER_SERVICE={enabled:false};window.SUNSEEK_OBJECT_WEATHER_SERVICE={enabled:false}')
  page=context.new_page();page.set_default_timeout(15000);page.goto(base,wait_until='load')
  page.locator('#about-btn').click();page.locator('#demo-weather').click()
  expect(page.locator('#data-status')).to_contain_text('示例')
  page.locator('#about-dialog [data-close-dialog]').first.click()
  for selector,name in [('.filter-main','preference-main'),('.map-panel','map'),('.map-container','map-canvas')]:
   revise(page,selector);page.mouse.move(0,0);page.locator(selector).screenshot(path=str(ROOT/'screens'/(name+'.png')))
  page.locator('#search-btn').click();page.locator('#city-search').fill('大理')
  page.locator('#search-results [data-open-city="dali"]').click();page.locator('#departure-options summary').click()
  page.locator('#departure-options').scroll_into_view_if_needed();revise(page,'#departure-options')
  bounds=page.locator('#departure-options').bounding_box();first=page.locator('.departure-option').first.bounding_box()
  page.screenshot(path=str(ROOT/'screens/departure-preview.png'),clip={**bounds,'height':first['y']+first['height']-bounds['y']+6})
  page.locator('#city-dialog [data-close-dialog]').first.click()
  page.locator('#search-btn').click();page.locator('#city-search').fill('宁海县')
  expect(page.locator('#search-results')).to_contain_text('宁海');page.locator('#city-search').blur()
  revise(page,'#search-dialog');page.locator('#search-dialog').screenshot(path=str(ROOT/'screens/search.png'))
  manifest={'source':'local mobile layout','viewport':[390,844],'deviceScaleFactor':2,'dataMode':'explicit samples, not real forecasts','weatherQueries':0,'databaseQueries':0,'changes':'caption wording only; numbers, data status and website source unchanged','reviewedRegions':reviewed}
  (ROOT/'screens/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
  browser.close();print('Captured five local mobile regions; sample disclosure retained; no external API requests')
finally:
 server.shutdown();server.server_close()
