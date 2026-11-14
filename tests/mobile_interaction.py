"""Native touch scrolling/pinch, readable controls, keyboard-sized dialogs and background lock."""
import json,sys,time
from playwright.sync_api import sync_playwright,expect
from fixtures import fixture
sys.stdout.reconfigure(line_buffering=True)

def touch(cdp,kind,points):
 cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x,'y':y,'id':i,'radiusX':2,'radiusY':2} for i,x,y in points]})
def swipe(page,cdp,x,y,dy):
 touch(cdp,'touchStart',[(1,x,y)])
 for step in range(1,9):
  touch(cdp,'touchMove',[(1,x,y+dy*step/8)]);page.wait_for_timeout(22)
 touch(cdp,'touchEnd',[]);page.wait_for_timeout(250)
def pinch(page,cdp,box,start=50,end=100,shift=0):
 x=box['x']+box['width']/2;y=box['y']+box['height']/2
 touch(cdp,'touchStart',[(1,x-start,y),(2,x+start,y)])
 for step in range(1,9):
  span=start+(end-start)*step/8;delta=shift*step/8
  touch(cdp,'touchMove',[(1,x-span,y+delta),(2,x+span,y+delta)]);page.wait_for_timeout(22)
 touch(cdp,'touchEnd',[]);page.wait_for_timeout(150)

with sync_playwright() as p:
 b=p.chromium.launch()
 context=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
 context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:false}");page=context.new_page();page.set_default_timeout(10000);errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://api.open-meteo.com/**',fixture)
 page.route('https://geocoding-api.open-meteo.com/**',lambda r:(requests.append(r.request.url),r.fulfill(json={})))
 page.goto('http://localhost:4173');expect(page.locator('#data-status')).to_contain_text('实时预报')
 cdp=context.new_cdp_session(page)
 def center_map():
  page.locator('#weather-map').evaluate('(n)=>window.scrollTo({top:n.getBoundingClientRect().top+scrollY-(innerHeight-n.getBoundingClientRect().height)/2,behavior:"instant"})');page.wait_for_timeout(150)
  return page.locator('#weather-map').bounding_box()
 box=center_map();old_y=page.evaluate('scrollY');scope=page.locator('#region-filter').input_value()
 swipe(page,cdp,box['x']+box['width']/2,box['y']+box['height']*.65,-130)
 assert page.evaluate('scrollY')>old_y+40,'single-finger map swipe should scroll the page'
 assert page.locator('#region-filter').input_value()==scope,'scroll must not select a province'
 box=center_map();old_y=page.evaluate('scrollY');before=page.locator('#map-viewport').get_attribute('transform')
 pinch(page,cdp,box)
 after=page.locator('#map-viewport').get_attribute('transform')
 assert after!=before and 'scale(1)' not in after,(before,after)
 assert abs(page.evaluate('scrollY')-old_y)<3
 assert page.evaluate('visualViewport.scale')==1,'pinch should zoom the map, not the browser'
 assert page.locator('#region-filter').input_value()==scope
 pinch(page,cdp,box,start=75,end=75,shift=30)
 assert page.locator('#map-viewport').get_attribute('transform')!=after,'two-finger pan should move the zoomed map'
 old_transform=page.locator('#map-viewport').get_attribute('transform');old_y=page.evaluate('scrollY')
 swipe(page,cdp,box['x']+box['width']/2,box['y']+box['height']*.65,-100)
 assert page.evaluate('scrollY')>old_y+30
 assert page.locator('#map-viewport').get_attribute('transform')==old_transform,'single finger should keep page scrolling after map zoom'
 page.locator('#map-reset').click();assert 'scale(1)' in page.locator('#map-viewport').get_attribute('transform')
 print('PASS real touch: one-finger page scroll over map, two-finger map zoom/pan, no browser zoom or accidental province selection')

 page.locator('#region-filter').select_option('230000');page.wait_for_function("!document.querySelector('#map-scope-note').textContent.includes('查询中')")
 for width in [360,390,768,1024,1440]:
  page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(180)
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),width
  nav=page.locator('.map-breadcrumb').bounding_box();actions=page.locator('.map-actions').bounding_box();note=page.locator('#map-scope-note').bounding_box()
  buttons=page.locator('.map-actions button:visible').all()
  tops=[button.bounding_box()['y'] for button in buttons]
  assert max(tops)-min(tops)<2,(width,tops)
  assert note['y']>=actions['y']+actions['height']-1,(width,note,actions)
  if width<=760:
   assert actions['y']>=nav['y']+nav['height']-1
   assert abs(actions['x']-nav['x'])<2
  assert page.locator('.map-actions .map-tool').first.evaluate('(n)=>parseFloat(getComputedStyle(n).fontSize)')>=11
  assert page.locator('#map-scope-note').evaluate('(n)=>parseFloat(getComputedStyle(n).fontSize)')>=10
  assert page.locator('.preference strong').first.evaluate('(n)=>parseFloat(getComputedStyle(n).fontSize)')>=10
  page.screenshot(path=f'/tmp/sunseek-readable-layout-{width}.png',full_page=True)
 print('PASS original type scale and stable toolbar actions/note layout at five viewport widths')

 page.set_viewport_size({'width':390,'height':844});page.locator('#map-national').click();center_map()
 old_y=page.evaluate('scrollY');old_rect=page.locator('#map-container').bounding_box()
 page.locator('#region-search-btn').evaluate('(n)=>n.click()')
 page.locator('#city-search').fill('江苏');expect(page.locator('#search-results')).to_contain_text('江苏')
 expect(page.locator('#search-index-status')).to_be_empty()
 assert page.locator('body').evaluate('(n)=>getComputedStyle(n).position')=='fixed'
 assert page.locator('#city-search').evaluate('(n)=>parseFloat(getComputedStyle(n).fontSize)')>=16
 # Model the reduced visible area caused by a soft keyboard; native keyboard chrome is unavailable headless.
 page.set_viewport_size({'width':390,'height':430});page.wait_for_timeout(180)
 dialog=page.locator('#search-dialog').bounding_box();viewport=page.evaluate('({height:visualViewport.height,top:visualViewport.offsetTop})')
 assert dialog['y']>=viewport['top']+8 and dialog['y']+dialog['height']<=viewport['top']+viewport['height']-8,(dialog,viewport)
 scroll=page.locator('#search-scroll');box=scroll.bounding_box()
 assert box['height']>60 and scroll.evaluate('(n)=>n.scrollHeight>n.clientHeight'),box
 background=page.locator('#map-container').bounding_box()['y'];old_top=scroll.evaluate('(n)=>n.scrollTop')
 swipe(page,cdp,box['x']+box['width']/2,box['y']+box['height']*.8,-min(120,box['height']*.65))
 assert scroll.evaluate('(n)=>n.scrollTop')>old_top+15,'results must scroll by touch with the keyboard-sized viewport'
 assert abs(page.locator('#map-container').bounding_box()['y']-background)<2,'background must stay locked'
 assert not requests,'typing and scrolling remaining local pages must not query online'
 page.screenshot(path='/tmp/sunseek-search-keyboard-size.png')
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
 page.locator('#search-dialog [data-close-dialog]').click();page.wait_for_timeout(150)
 assert page.locator('body').evaluate('(n)=>getComputedStyle(n).position')!='fixed'
 assert abs(page.evaluate('scrollY')-old_y)<3,(old_y,page.evaluate('scrollY'))
 # Reopening/changing modal must keep lock state, and closing restores it once.
 page.locator('#search-btn').evaluate('(n)=>n.click()');page.locator('#city-search').fill('丽江');page.locator('#search-results [data-open-city="lijiang"]').click()
 expect(page.locator('#city-dialog')).to_be_visible();assert page.locator('body').evaluate('(n)=>getComputedStyle(n).position')=='fixed'
 page.keyboard.press('Escape');assert page.locator('body').evaluate('(n)=>getComputedStyle(n).position')!='fixed'
 assert not errors,errors
 print('PASS touch result scrolling, keyboard-sized viewport fit, fixed background, 16 px input, modal transition and scroll restoration')
 context.close()
 # Desktop dragging retains pointer behavior after the touch changes.
 context=b.new_context(viewport={'width':1440,'height':1100});context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:false}");page=context.new_page();page.route('https://api.open-meteo.com/**',fixture);page.goto('http://localhost:4173');expect(page.locator('#data-status')).to_contain_text('实时预报')
 page.locator('#map-zoom-in').click();page.locator('#weather-map').scroll_into_view_if_needed();box=page.locator('#weather-map').bounding_box();before=page.locator('#map-viewport').get_attribute('transform')
 page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5);page.mouse.down();page.mouse.move(box['x']+box['width']*.5+45,box['y']+box['height']*.5+30,steps=5);page.mouse.up()
 assert page.locator('#map-viewport').get_attribute('transform')!=before
 print('PASS desktop mouse drag after button zoom')
 b.close()
