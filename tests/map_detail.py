"""HK/Macao shortcuts, decorative subdivisions and ranked/crowded city markers."""
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect
from fixtures import payload_for

ROOT=Path(__file__).resolve().parent.parent
sources=json.loads((ROOT/'assets/subdivisions/sources.json').read_text())
assert len(sources)==34
for row in sources:
    data=json.loads((ROOT/f"assets/subdivisions/{row['province']}.json").read_text())
    assert data['province']==row['province'] and data['children']==row['children']
    assert all(len(line)>=4 and all(len(p)==2 and all(isinstance(n,(int,float)) for n in p) for p in line) for line in data['lines'])
assert next(r for r in sources if r['province']==370000)['children']==16
assert next(r for r in sources if r['province']==710000)['children']==0
print('PASS 34 local boundary files, Shandong cities and explicit missing Taiwan source',flush=True)


def forecast(route):
    payload=payload_for(route.request.url)
    for row in payload:
        lat=row['latitude']
        clear=9 if lat in [36.65,37.5393,36.70925] else 8 if lat==36.07 else 3
        for i,stamp in enumerate(row['hourly']['time']):
            matched=9<=int(stamp[11:13])<9+clear
            row['hourly']['weather_code'][i]=0 if matched else 3
            row['hourly']['cloud_cover'][i]=20 if matched else 90
    route.fulfill(json=payload)


def setup(browser):
    context=browser.new_context(viewport={'width':1440,'height':1100},locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
    context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:false}");page=context.new_page();page.set_default_timeout(8000)
    errors=[];boundaries=[];weather=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def request(req):
        if '/assets/subdivisions/' in req.url:boundaries.append(urlparse(req.url).path)
        if req.url.startswith('https://api.open-meteo.com/'):weather.append(req.url)
    page.on('request',request)
    page.route('https://api.open-meteo.com/**',forecast)
    page.goto('http://localhost:4173',wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('实时预报')
    expect(page.locator('#map-extra-points')).not_to_be_checked()
    expect(page.locator('.compact-marker')).to_have_count(0)
    return context,page,errors,boundaries,weather


with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context,page,errors,boundaries,weather=setup(browser)
    assert not boundaries, 'national view must not load province subdivision assets'
    page.locator('#region-filter').select_option('华南')
    expect(page.locator('#map-special-regions')).to_be_visible()
    count=len(weather)
    assert page.locator('#map-special-regions [data-map-shortcut]').count()==2
    assert len(weather)==count, 'showing shortcuts must not fetch weather'
    date=page.locator('[data-map-date]').nth(1).get_attribute('data-map-date')
    page.locator(f'[data-map-date="{date}"]').click()
    page.locator('[data-map-shortcut="810000"]').click()
    expect(page.locator('#region-filter')).to_have_value('810000')
    expect(page.locator('#map-scope-name')).to_have_text('香港')
    expect(page.locator('#subdivision-lines path')).to_have_count(1)
    expect(page.locator('[data-map-scope="华南"]')).to_be_visible()
    expect(page.locator(f'[data-map-date="{date}"]')).to_have_attribute('aria-pressed','true')
    page.locator('[data-map-shortcut="820000"]').focus();page.keyboard.press('Enter')
    expect(page.locator('#map-scope-name')).to_have_text('澳门')
    expect(page.locator('#subdivision-lines path')).to_have_count(1)
    assert page.locator('#scope-land-path').get_attribute('d')==page.locator('[data-province="820000"]').get_attribute('d')
    assert page.locator('#subdivision-lines path').evaluate('el=>getComputedStyle(el).pointerEvents')=='none'
    assert page.locator('#subdivision-paths').get_attribute('aria-hidden')=='true'
    assert page.locator('#subdivision-paths [tabindex],[data-province] [data-child]').count()==0
    old=len(boundaries)
    page.locator('[data-map-shortcut="810000"]').click()
    expect(page.locator('#subdivision-lines path')).to_have_count(1)
    assert len(boundaries)==old, 'reuse loaded decorative geometry'
    page.locator('[data-map-scope="华南"]').click()
    expect(page.locator('#subdivision-lines path')).to_have_count(0)
    page.locator('.map-panel').screenshot(path='/tmp/sunseek-south-shortcuts.png')
    for width in [390,360]:
        page.set_viewport_size({'width':width,'height':1000})
        button=page.locator('[data-map-shortcut="820000"]')
        expect(button).to_be_visible()
        assert button.bounding_box()['height']>=40
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        if width==390:page.locator('.map-panel').screenshot(path='/tmp/sunseek-south-shortcuts-mobile.png')
        button.click()
        expect(page.locator('#map-scope-name')).to_have_text('澳门')
        page.locator('[data-map-scope="华南"]').click()
    page.set_viewport_size({'width':1440,'height':1100})
    print('PASS visible HK/Macao shortcuts, keyboard access, 华南 parent, preview date, land clipping, noninteractive boundaries and geometry reuse',flush=True)

    page.locator('[data-map-date=""]').click()
    page.locator('#region-filter').select_option('370000')
    expect(page.locator('#map-scope-note')).to_contain_text('16 个所选时段预报完整')
    expect(page.locator('#subdivision-lines path')).to_have_count(1)
    ranked=page.locator('#all-cards [data-city]').evaluate_all('(els)=>els.map(el=>el.dataset.city)')
    assert ranked.index('qingdao')==3,ranked
    expected={'jinan','qingdao'}|{'area-'+str(code) for code in [370300,370400,370500,370600,370700,370800,370900,371000,371100,371300,371400,371500,371600,371700]}
    for width in [1440,768,390,360]:
        page.set_viewport_size({'width':width,'height':1100})
        page.wait_for_timeout(160)
        expect(page.locator('.compact-marker')).to_have_count(0)
        qingdao=page.locator('[data-map-city="qingdao"]')
        expect(qingdao).to_be_visible()
        expect(qingdao.locator('text').first).to_have_text('青岛')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.locator('.map-panel').screenshot(path=f'/tmp/sunseek-shandong-detail-{width}.png')
        labels=page.locator('#city-markers .map-city').evaluate_all('(els)=>els.map(el=>el.outerHTML)')
        old_calls=len(weather)
        page.locator('#map-extra-points').check()
        shown=set(page.locator('#city-markers [data-map-city]').evaluate_all('(els)=>els.map(el=>el.dataset.mapCity)'))
        assert expected<=shown,(width,expected-shown)
        assert labels==page.locator('#city-markers .map-city:not(.compact-marker)').evaluate_all('(els)=>els.map(el=>el.outerHTML)')
        page.locator('#map-extra-points').uncheck()
        expect(page.locator('.compact-marker')).to_have_count(0)
        assert len(weather)==old_calls, 'display preference must not request weather'
    page.locator('#map-extra-points').check()
    compact=page.locator('.compact-marker')
    assert compact.count()>0
    target=compact.first
    point=None
    page.locator('#weather-map').scroll_into_view_if_needed()
    for i in range(compact.count()):
        target=compact.nth(i)
        point=target.evaluate('''el=>{const p=new DOMPoint(0,0).matrixTransform(el.getScreenCTM());return document.elementFromPoint(p.x,p.y)?.closest('[data-map-city]')===el?{x:p.x,y:p.y}:null;}''')
        if point:break
    assert point,'at least one crowded city dot must be directly clickable'
    name=target.get_attribute('aria-label').split('，')[0]
    target.focus()
    page.mouse.click(point['x'],point['y'])
    expect(page.locator('.city-dialog-title h2')).to_have_text(name)
    page.keyboard.press('Escape')
    page.locator('#region-filter').select_option('华南')
    expect(page.locator('#map-extra-points')).to_be_checked()
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('#map-extra-points')).not_to_be_checked()
    expect(page.locator('.compact-marker')).to_have_count(0)
    assert not errors,errors
    print('PASS Qingdao named at four widths; dots default off, opt-in preserves labels and weather requests, clickable dots, scope retention and reload reset',flush=True)
    context.close()

    context,page,errors,boundaries,weather=setup(browser)
    held=[]
    page.route('**/assets/subdivisions/370000.json',lambda route:held.append(route))
    page.locator('#region-filter').select_option('370000')
    page.wait_for_timeout(80)
    assert len(held)==1
    page.locator('#region-filter').select_option('440000')
    expect(page.locator('#subdivision-lines path')).to_have_count(1)
    current=page.locator('#subdivision-lines path').get_attribute('d')
    held.pop().fulfill(path=ROOT/'assets/subdivisions/370000.json',content_type='application/json')
    page.wait_for_timeout(100)
    assert page.locator('#subdivision-lines path').get_attribute('d')==current
    page.locator('#region-filter').select_option('710000')
    expect(page.locator('#subdivision-lines path')).to_have_count(0)
    expect(page.locator('#map-subdivision-note')).not_to_be_visible()
    page.route('**/assets/subdivisions/630000.json',lambda route:route.fulfill(status=503,body='unavailable'))
    with page.expect_response('**/assets/subdivisions/630000.json'):
        page.locator('#region-filter').select_option('630000')
    page.wait_for_timeout(60)
    expect(page.locator('#map-scope-name')).to_have_text('青海')
    expect(page.locator('#subdivision-lines path')).to_have_count(0)
    expect(page.locator('#map-subdivision-note')).not_to_be_visible()
    assert not errors,errors
    context.close()
    print('PASS late boundary response isolation, missing source and failed asset do not block the map',flush=True)
    browser.close()
