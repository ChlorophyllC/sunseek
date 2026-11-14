"""Original type proportions, consistent recommendation photos, visible mobile About and GitHub links."""
from playwright.sync_api import sync_playwright,expect
from fixtures import fixture
with sync_playwright() as p:
 b=p.chromium.launch();context=b.new_context(viewport={'width':1440,'height':1100},locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
 page=context.new_page();errors=[];github_requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://api.open-meteo.com/**',fixture)
 page.route('https://geocoding-api.open-meteo.com/**',lambda r:r.fulfill(json={}))
 page.route('https://github.com/**',lambda r:(github_requests.append(r.request.url),r.abort()))
 page.goto('http://localhost:4173');expect(page.locator('#data-status')).to_contain_text('实时预报')
 page.locator('#show-all-btn').click();expect(page.locator('#all-destinations')).to_be_visible()
 for width in [320,360,390,480,600,760,768,1000,1024,1060,1200,1440]:
  page.set_viewport_size({'width':width,'height':1000});page.evaluate('scrollTo({top:0,behavior:"instant"})');page.wait_for_timeout(150)
  assert page.locator('body').evaluate('(n)=>parseFloat(getComputedStyle(n).fontSize)')==14
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),width
  about=page.get_by_role('button',name='关于晴游',exact=True);expect(about).to_be_visible()
  header=page.locator('.header-inner').bounding_box();button=about.bounding_box();search=page.locator('#search-btn').bounding_box()
  assert button['x']>=header['x'] and button['x']+button['width']<=search['x']+1,(width,button,search)
  assert button['y']+button['height']<=header['y']+header['height']+1
  image=page.locator('#recommendation-list .destination-image').first.bounding_box()
  all_image=page.locator('#all-cards .destination-image').first.bounding_box()
  assert abs(image['width']-all_image['width'])<1,(width,image,all_image)
  if width<=480 or width>=761:
   assert image['width']==(80 if width<=480 else 90),(width,image)
  if width==1440:
   assert page.locator('.preference strong').first.evaluate('(n)=>parseFloat(getComputedStyle(n).fontSize)')==12
  about.click();expect(page.locator('#about-dialog')).to_be_visible()
  source=page.locator('#about-dialog a[href="https://github.com/ChlorophyllC/sunseek"]');expect(source).to_be_visible()
  assert source.get_attribute('target')=='_blank' and 'noopener' in source.get_attribute('rel')
  page.keyboard.press('Escape')
  star=page.locator('.site-footer .github-star');expect(star).to_have_attribute('href','https://github.com/ChlorophyllC/sunseek');expect(star).to_be_visible()
  assert star.get_attribute('target')=='_blank' and 'noreferrer' in star.get_attribute('rel')
  page.screenshot(path=f'/tmp/sunseek-recommendation-photo-{width}.png',full_page=True)
 assert not github_requests,'star links should not fetch GitHub data or counts on load'
 assert not errors,errors
 print('PASS original body/heading proportions, matching recommendation photo widths, accessible mobile About, responsive header and local-only star links at twelve widths')
 b.close()
