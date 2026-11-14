"""Nearby travel places, source attribution, cache and wish-list browser acceptance.
Use --live to additionally exercise the real Wikipedia API for Hangzhou.
"""
import json
import sys
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect
from fixtures import fixture

sys.stdout.reconfigure(line_buffering=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1100},locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
    page=context.new_page();page.set_default_timeout(10000)
    errors=[];calls=[];mode='normal';pending=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://api.open-meteo.com/**',fixture)
    nearby=[{'pageid':i,'lat':30.27+i*.001,'lon':120.16,'title':f'地点{i}'} for i in range(1,13)]
    pages=[{'pageid':i,'title':f'杭州测试博物馆{i}','extract':'一段用于测试的资料摘要。','categories':[{'title':'Category:杭州博物馆'}]} for i in range(1,9)]
    pages += [
        {'pageid':9,'title':'湖畔公园','categories':[{'title':'Category:杭州公园'}]},
        {'pageid':10,'title':'名人故居','extract':'历史建筑资料。','categories':[{'title':'Category:文物保护单位'}]},
        {'pageid':11,'title':'测试中学','categories':[{'title':'Category:中学'},{'title':'Category:文物保护单位'}]},
        {'pageid':12,'title':'<img src=x onerror=alert(1)>','extract':'<script>alert(1)</script>','categories':[{'title':'Category:杭州博物馆'}]},
    ]
    nearby += [{'pageid':13,'lat':30.27901,'lon':120.16},{'pageid':14,'lat':40.27,'lon':120.16},{'pageid':15,'lat':None,'lon':120.16}]
    pages += [{'pageid':13,'title':'湖畔公园','categories':[{'title':'Category:杭州公园'}]},
              {'pageid':14,'title':'远方博物馆','categories':[{'title':'Category:博物馆'}]},
              {'pageid':15,'title':'无坐标博物馆','categories':[{'title':'Category:博物馆'}]}]
    def wiki(route):
        query=parse_qs(urlparse(route.request.url).query);calls.append(query)
        if mode=='delay' and query.get('list')==['geosearch']:
            pending.append(route);return
        if mode=='fail' or mode=='partial' and 'pageids' in query:
            route.fulfill(status=503,body='unavailable');return
        if query.get('list')==['geosearch']:
            data={'query':{'geosearch':[] if mode=='empty' else nearby}}
        else:
            ids=set(map(int,query['pageids'][0].split('|')))
            data={'query':{'pages':[item for item in pages if item['pageid'] in ids]}}
        route.fulfill(content_type='application/json',body=json.dumps(data))
    if '--live' not in sys.argv:page.route('https://zh.wikipedia.org/w/api.php*',wiki)
    page.goto('http://localhost:4173',wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('实时预报',timeout=15000)
    page.locator('#search-btn').click();page.locator('#city-search').fill('杭州')
    page.locator('#search-results [data-open-city="hangzhou"]').click()
    expect(page.locator('[data-explore-attractions]')).to_be_visible()
    assert not calls
    page.locator('[data-explore-attractions]').click()
    if '--live' in sys.argv:
        expect(page.locator('.attraction-status')).to_contain_text('获取',timeout=35000)
        print('LIVE',page.locator('.attraction-status').inner_text())
        print('LIVE PLACES',page.locator('.attraction-card h4').all_text_contents())
        page.locator('.attractions-section').screenshot(path='/tmp/sunseek-attractions-live.png')
        assert not errors,errors
        browser.close();sys.exit(0)
    expect(page.locator('.attraction-status')).to_contain_text('11 处')
    expect(page.locator('.attraction-card')).to_have_count(6)
    expect(page.locator('.attraction-source').first).to_contain_text('CC BY-SA 4.0')
    assert len(calls)==2
    page.locator('[data-attractions-more]').click()
    expect(page.locator('.attraction-card')).to_have_count(11)
    expect(page.locator('[data-attraction="11"]')).to_have_count(0)
    for invalid in [13,14,15]:expect(page.locator(f'[data-attraction="{invalid}"]')).to_have_count(0)
    expect(page.locator('[data-attraction="12"] h4')).to_have_text('<img src=x onerror=alert(1)>')
    expect(page.locator('[data-attraction="12"] img')).to_have_count(0)
    expect(page.locator('[data-attraction="12"] script')).to_have_count(0)
    assert page.locator('[data-attraction="12"] a').first.get_attribute('href')=='https://zh.wikipedia.org/?curid=12'
    page.locator('#attraction-type').select_option('nature')
    expect(page.locator('.attraction-card')).to_have_count(1)
    expect(page.locator('.attraction-card')).to_contain_text('湖畔公园')
    assert len(calls)==2
    page.locator('[data-attraction-save="9"]').click()
    expect(page.locator('[data-attraction-save="9"]').first).to_have_attribute('aria-pressed','true')
    page.keyboard.press('Escape')
    expect(page.locator('#attraction-wishlist')).to_be_visible()
    expect(page.locator('#visited-count')).to_have_text('0')
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('#attraction-wishlist')).to_contain_text('湖畔公园')
    page.locator('#attraction-wishlist [data-attraction-weather="9"]').click()
    expect(page.locator('#place-name')).to_have_value('湖畔公园')
    expect(page.locator('#place-province')).to_have_value('330000')
    assert abs(float(page.locator('#place-lat').input_value())-30.279)<.00001
    page.locator('#place-form button[type=submit]').click()
    expect(page.locator('.city-dialog-title h2')).to_have_text('湖畔公园')
    expect(page.locator('.detail-metrics')).not_to_contain_text('—')
    page.keyboard.press('Escape')
    page.locator('#search-btn').click();page.locator('#city-search').fill('杭州');page.locator('#search-results [data-open-city="hangzhou"]').click()
    page.locator('[data-explore-attractions]').click()
    assert len(calls)==2
    expect(page.locator('.attraction-status')).to_contain_text('11 处')
    print('PASS explicit lookup, travel categories, XSS escaping, attribution, local filters, wish-list persistence and coordinate weather handoff')
    mode='fail';page.locator('[data-attractions-load]').click()
    expect(page.locator('.attraction-status')).to_contain_text('继续显示此前缓存')
    expect(page.locator('.attraction-card').first).to_be_visible()
    page.locator('#attraction-radius').select_option('2')
    expect(page.locator('.attraction-status')).to_contain_text('暂时不可用')
    expect(page.locator('#attraction-panel .attraction-card')).to_have_count(0)
    mode='partial';page.locator('[data-attractions-load]').click()
    expect(page.locator('.attraction-status')).to_contain_text('暂时不可用')
    assert len(json.loads(page.evaluate("localStorage.getItem('sunseek-attractions-v1')")))==1
    mode='empty';page.locator('[data-attractions-load]').click()
    expect(page.locator('.attraction-empty')).to_contain_text('不代表当地没有景点')
    mode='normal';page.locator('[data-attractions-load]').click()
    expect(page.locator('.attraction-status')).to_contain_text('11 处')
    page.locator('#attraction-type').select_option('museum')
    expect(page.locator('.attraction-weather-note')).to_contain_text('部分场馆含露天区域')
    mode='delay';page.locator('#attraction-radius').select_option('10')
    page.wait_for_timeout(150)
    assert pending
    page.locator('#attraction-radius').select_option('5')
    expect(page.locator('.attraction-status')).to_contain_text('11 处')
    for route in pending:
        try:route.fulfill(content_type='application/json',body=json.dumps({'query':{'geosearch':[]}}))
        except Exception:pass
    expect(page.locator('#attraction-radius')).to_have_value('5')
    expect(page.locator('.attraction-status')).to_contain_text('11 处')
    print('PASS cached fallback, explicit failures, empty coverage, partial response isolation and stale request cancellation')
    page.locator('.attractions-section').screenshot(path='/tmp/sunseek-attractions-desktop.png')
    for width in [360,390,768]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.locator('#city-dialog').bounding_box()['width']<=width
        assert not page.locator('#city-dialog').evaluate('(node)=>node.scrollWidth>node.clientWidth')
        if width==390:page.locator('.attractions-section').screenshot(path='/tmp/sunseek-attractions-mobile.png')
    page.keyboard.press('Escape')
    page.locator('#attraction-wishlist [data-attraction-save="9"]').click()
    expect(page.locator('#attraction-wishlist')).not_to_be_visible()
    page.evaluate("()=>{let c=JSON.parse(localStorage.getItem('sunseek-attractions-v1'));c.forEach(e=>e.time=Date.now()-8*86400000);localStorage.setItem('sunseek-attractions-v1',JSON.stringify(c));}")
    mode='fail';page.reload(wait_until='domcontentloaded')
    page.locator('#search-btn').click();page.locator('#city-search').fill('杭州');page.locator('#search-results [data-open-city="hangzhou"]').click()
    expect(page.locator('#attraction-panel .attraction-card')).to_have_count(0)
    page.locator('[data-explore-attractions]').click()
    expect(page.locator('.attraction-status')).to_contain_text('暂时不可用')
    page.keyboard.press('Escape')
    page.locator('#search-btn').click();page.locator('#city-search').fill('北京');page.locator('#search-results [data-open-city="beijing"]').click()
    page.locator('#attraction-type').select_option('museum')
    expect(page.locator('.attraction-weather-note')).to_contain_text('室内场馆也不代表路途安全')
    page.keyboard.press('Escape');page.locator('#about-btn').click();page.locator('#demo-weather').click();page.keyboard.press('Escape')
    page.locator('#search-btn').click();page.locator('#city-search').fill('杭州');page.locator('#search-results [data-open-city="hangzhou"]').click()
    expect(page.locator('.attraction-weather-note')).to_contain_text('当前是天气演示')
    assert not errors,errors
    print('PASS mobile layout, wishlist removal, expired cache rejected, hazardous/demo weather context, no JavaScript errors')
    browser.close()
