"""Explicit overview pools remain independent of browsing history and cache contents."""
import json
from urllib.parse import parse_qs,urlparse
from playwright.sync_api import sync_playwright,expect
from fixtures import payload_for


def clean_fixture(route):
    raw=payload_for(route.request.url)
    for row in raw:
        row['daily']['temperature_2m_max']=[v if v is not None else 22 for v in row['daily']['temperature_2m_max']]
        row['hourly']['apparent_temperature']=[v if v is not None else 22 for v in row['hourly']['apparent_temperature']]
    route.fulfill(json=raw)


def setup(browser,seed=None):
    context=browser.new_context(viewport={'width':1440,'height':1100},locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
    page=context.new_page();page.set_default_timeout(12000)
    calls=[];held=[];mode={'value':'normal'};errors=[]
    def weather(route):
        query=parse_qs(urlparse(route.request.url).query)
        calls.append(list(zip(query['latitude'][0].split(','),query['longitude'][0].split(','))))
        if mode['value']=='hold':mode['value']='normal';held.append(route);return
        if mode['value']=='limit':route.fulfill(status=429,body='rate limited');return
        clean_fixture(route)
    page.route('https://api.open-meteo.com/**',weather)
    page.on('pageerror',lambda error:errors.append(str(error)))
    if seed:page.add_init_script('localStorage.setItem("sunseek-places-v3",'+json.dumps(json.dumps(seed,ensure_ascii=False))+')')
    page.goto('http://localhost:4173',wait_until='domcontentloaded')
    settle(page)
    return context,page,calls,held,mode,errors


def settle(page):page.wait_for_function("!document.querySelector('#retry-weather').disabled",timeout=30000)
def snapshot(page):return page.evaluate('''()=>({ids:[...document.querySelectorAll('#all-cards [data-city]')].map(el=>el.dataset.city),colors:[...document.querySelectorAll('[data-province]')].map(el=>el.getAttribute('fill')),summary:document.querySelector('#results-summary').textContent,markers:document.querySelector('#city-markers').innerHTML})''')


with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context,page,calls,held,mode,errors=setup(browser)
    expect(page.locator('#discovery-scope')).to_have_value('featured')
    expect(page.locator('#discovery-progress')).to_contain_text('48 个候选 · 48 个完整')
    assert sum(map(len,calls))==48
    featured_cache=set(page.evaluate("JSON.parse(localStorage.getItem('sunseek-weather-v3')).forecasts.map(f=>f.data[0][0])"))
    before=snapshot(page)
    page.locator('#region-filter').select_option('510000');settle(page)
    expect(page.locator('#discovery-scope')).to_be_disabled()
    expect(page.locator('#discovery-progress')).to_contain_text('省内全部地点')
    assert len(calls)>3
    page.locator('#map-national').click();settle(page)
    assert snapshot(page)==before,'province visit changed the national candidate set/colors/markers'
    page.reload(wait_until='domcontentloaded');settle(page)
    assert snapshot(page)==before,'warm cache changed the default overview'
    page.locator('#region-filter').select_option('西南')
    regional=snapshot(page)
    page.locator('#region-filter').select_option('510000');settle(page)
    page.locator('[data-map-scope="西南"]').click();settle(page)
    assert snapshot(page)==regional,'regional overview changed with cached province data'
    page.locator('#map-national').click();settle(page)
    page.locator('#search-btn').click();page.locator('#city-search').fill('攀枝花')
    page.locator('[data-open-city="area-510400"]').click();page.keyboard.press('Escape')
    old=len(calls)
    page.locator('#source-btn').click();page.locator('#retry-weather').click();settle(page);page.keyboard.press('Escape')
    assert sum(map(len,calls[old:]))==48,'refresh must not query closed detail cities from browsing history'
    assert snapshot(page)==before
    print('PASS cold/warm cache, province visits and regional returns preserve the fixed candidate set, ranking, counts and colors',flush=True)

    page.locator('#more-filters').click();page.locator('#min-temp').fill('50');page.locator('#min-temp').dispatch_event('change')
    old=len(calls);mode['value']='hold'
    page.locator('#discovery-scope').select_option('all')
    expect(page.locator('#discovery-progress')).to_contain_text('506 个候选')
    page.wait_for_timeout(100)
    assert len(held)==1 and len(calls)==old+1,'expansion must run one batch at a time'
    expect(page.locator('#discovery-progress')).to_contain_text('查询中')
    expect(page.locator('#recommendation-list')).to_contain_text('正在查询')
    page.locator('#discovery-scope').select_option('featured');settle(page)
    clean_fixture(held.pop());page.wait_for_timeout(100)
    page.locator('#min-temp').fill('');page.locator('#min-temp').dispatch_event('change');page.locator('#more-filters').click()
    assert snapshot(page)==before
    assert len(calls)==old+1,'switching back must not continue queued full-catalog requests'
    print('PASS returning to featured cancels the expanded queue; late success cannot alter overview or resume requests',flush=True)

    calls_before=len(calls)
    page.locator('#discovery-scope').select_option('all');settle(page)
    expect(page.locator('#discovery-progress')).to_contain_text('506 个候选 · 506 个完整')
    stored=page.evaluate("()=>{const raw=localStorage.getItem('sunseek-weather-v3');return {size:raw.length,ids:JSON.parse(raw).forecasts.map(f=>f.data[0][0])}}")
    assert stored['size']<=1600000 and 48<len(stored['ids'])<506
    assert featured_cache<=set(stored['ids']),'bounded cache must preserve featured forecasts'
    assert all(len(batch)<=16 for batch in calls)
    assert sum(map(len,calls[calls_before:]))==506-68,'full scan must reuse all valid province cache'
    assert len(set(pair for batch in calls[calls_before:] for pair in batch))==506-68
    expanded=snapshot(page)
    assert any(id.startswith('area-') for id in expanded['ids'])
    assert expanded['colors']!=before['colors']
    page.locator('[data-map-date]').nth(1).click()
    count=len(calls)
    page.locator('#discovery-scope').select_option('featured');settle(page)
    assert len(calls)==count
    page.locator('#discovery-scope').select_option('all');settle(page)
    assert len(calls)==count,'warm full scan must not refetch valid forecasts'
    expect(page.locator('[data-map-date]').nth(1)).to_have_attribute('aria-pressed','true')
    page.locator('[data-map-date=""]').click()
    assert snapshot(page)==expanded
    page.reload(wait_until='domcontentloaded');settle(page)
    expect(page.locator('#discovery-scope')).to_have_value('featured')
    assert snapshot(page)==before
    assert len(calls)==count
    assert not errors,errors
    print('PASS complete opt-in scan, <=16 batches, valid-cache reuse, daily preview retention and featured default after reload',flush=True)
    for width in [360,390,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.locator('.filter-panel').screenshot(path=f'/tmp/sunseek-discovery-{width}.png')
    context.close()

    context,page,calls,held,mode,errors=setup(browser)
    old=len(calls);mode['value']='limit'
    page.locator('#discovery-scope').select_option('all');settle(page)
    assert len(calls)==old+1,'429 must stop remaining batches and not retry automatically'
    expect(page.locator('#discovery-progress')).to_contain_text('458 个获取失败')
    expect(page.locator('#retry-discovery')).to_be_enabled()
    mode['value']='normal';old=len(calls)
    page.locator('#retry-discovery').click();settle(page)
    expect(page.locator('#discovery-progress')).to_contain_text('506 个候选 · 506 个完整')
    assert sum(map(len,calls[old:]))==458,'manual retry must only query missing forecasts'
    assert not errors,errors
    context.close()
    print('PASS rate limit stops the queue, keeps valid forecasts and manually retries only missing locations',flush=True)

    context,page,calls,held,mode,errors=setup(browser)
    page.locator('#region-filter').select_option('华东');regional=snapshot(page)
    old=len(calls);mode['value']='hold'
    page.locator('#discovery-scope').select_option('all');page.wait_for_timeout(60)
    assert len(held)==1
    page.locator('#region-filter').select_option('370000');settle(page)
    expect(page.locator('#discovery-progress')).to_contain_text('省内全部地点 · 16 个候选 · 16 个完整')
    assert sum(map(len,calls[old:]))==16+14
    clean_fixture(held.pop());page.wait_for_timeout(80)
    assert sum(map(len,calls[old:]))==30
    page.locator('[data-map-scope="华东"]').click();settle(page)
    expect(page.locator('#discovery-scope')).to_have_value('all')
    page.locator('#discovery-scope').select_option('featured');settle(page)
    assert snapshot(page)==regional
    page.locator('#map-national').click()
    cache=page.evaluate("localStorage.getItem('sunseek-weather-v3')");count=len(calls)
    page.locator('#source-btn').click();page.locator('#demo-weather').click();page.keyboard.press('Escape')
    page.locator('#discovery-scope').select_option('all')
    expect(page.locator('#discovery-progress')).to_contain_text('示例数据')
    page.locator('#discovery-scope').select_option('featured')
    assert len(calls)==count and page.evaluate("localStorage.getItem('sunseek-weather-v3')")==cache
    page.locator('#source-btn').click();page.locator('#demo-weather').click();settle(page)
    assert sum(map(len,calls[count:]))==48
    assert not errors,errors
    context.close()
    print('PASS regional expansion switches to province-only requests; demo range changes stay isolated and exit refreshes only the active pool',flush=True)

    personal=[dict(id='user-home',name='我的地点',lat=30.00361,lon=117.98167,code=340000,timezone='Asia/Shanghai',source='custom',geoId=None)]
    context,page,calls,held,mode,errors=setup(browser,personal)
    expect(page.locator('#discovery-progress')).to_contain_text('49 个候选 · 49 个完整')
    expect(page.locator('#discovery-scope option[value="featured"]')).to_have_text('精选与个人地点')
    assert sum(map(len,calls))==49
    assert not errors,errors
    context.close()
    print('PASS saved personal locations form a fixed overview pool and load on cold start',flush=True)

    context,page,calls,held,mode,errors=setup(browser)
    records=page.evaluate("()=>Object.fromEntries(['sunseek-places-v3','sunseek-footprints-v1','sunseek-wishlist-v1','sunseek-preferences-v2'].map(k=>[k,localStorage.getItem(k)]))")
    page.evaluate("()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='sunseek-weather-v3'&&v.length>750000)throw new DOMException('quota','QuotaExceededError');return set.call(this,k,v)}}")
    page.locator('#discovery-scope').select_option('all');settle(page)
    expect(page.locator('#discovery-progress')).to_contain_text('506 个候选 · 506 个完整')
    cache=page.evaluate("()=>{const raw=localStorage.getItem('sunseek-weather-v3');return {size:raw.length,ids:JSON.parse(raw).forecasts.map(f=>f.data[0][0])}}")
    assert cache['size']<=750000 and featured_cache<=set(cache['ids'])
    assert records==page.evaluate("()=>Object.fromEntries(['sunseek-places-v3','sunseek-footprints-v1','sunseek-wishlist-v1','sunseek-preferences-v2'].map(k=>[k,localStorage.getItem(k)]))")
    assert not errors,errors
    context.close()
    print('PASS smaller storage quota keeps a prioritized valid cache without changing user records or live coverage',flush=True)

    # Change modes while the original first batch is still in flight.
    context=browser.new_context(locale='zh-CN',timezone_id='Asia/Shanghai')
    page=context.new_page();calls=[];held=[]
    def slow_start(route):
        calls.append(route)
        if len(calls)==1:held.append(route)
        else:clean_fixture(route)
    page.route('https://api.open-meteo.com/**',slow_start)
    page.goto('http://localhost:4173',wait_until='domcontentloaded')
    page.wait_for_timeout(80)
    assert len(held)==1
    page.locator('#discovery-scope').select_option('all')
    page.locator('#discovery-scope').select_option('featured');settle(page)
    clean_fixture(held.pop());page.wait_for_timeout(100)
    assert sum(len(parse_qs(urlparse(r.request.url).query)['latitude'][0].split(',')) for r in calls)==64
    expect(page.locator('#discovery-progress')).to_contain_text('48 个候选 · 48 个完整')
    print('PASS early full/featured switching clears queued expansion during the original cold-start request',flush=True)
    browser.close()
