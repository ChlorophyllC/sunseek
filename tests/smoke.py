"""Run against localhost:4173 with Python Playwright and Chromium.
Weather is mocked; screenshots are written to /tmp.
"""
import sys
from datetime import timedelta
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect
from fixtures import TODAY, DATES, fixture

sys.stdout.reconfigure(line_buffering=True)
BASE='http://localhost:4173'


def setup_page(browser,width=1440,height=1100,failure=False,handler=None):
    context=browser.new_context(viewport={'width':width,'height':height},locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('https://api.open-meteo.com/**',handler or ((lambda route:route.abort()) if failure else fixture))
    page.goto(BASE,wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('暂无可用预报' if failure else '实时预报')
    return context,page,errors


with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True)
    context,page,errors=setup_page(browser)
    page.set_default_timeout(7000)
    expect(page.locator('.province')).to_have_count(35)
    expect(page.locator('#recommendation-list .destination-card')).to_have_count(3)
    for city in ['beijing','shenzhen','guangzhou','wuhan']:
        assert page.locator(f'#all-cards [data-city="{city}"]').count()==0,city
    expect(page.locator('#all-cards [data-city="dali"]')).to_contain_text('27 / 27h 合拍')
    expect(page.locator('#all-cards [data-city="lijiang"]')).to_contain_text('9 / 27h 合拍')
    assert '%' not in page.locator('#recommendation-list .match-score').first.inner_text()
    assert page.evaluate("localStorage.getItem('sunseek-weather-v3').length")<2_000_000
    print('PASS hourly daylight ranking, night-rain handling, gust and null-data exclusion, compact cache')

    for preference in ['snow','rain','cool','sun']:
        page.locator(f'[data-preference="{preference}"]').click()
        expect(page.locator(f'[data-preference="{preference}"]')).to_have_attribute('aria-pressed','true')
        assert page.locator('#all-cards .destination-card').count()>0
    page.locator('#hour-start').select_option('13')
    expect(page.locator('#all-cards [data-city="dali"]')).to_contain_text('15 / 15h 合拍')
    assert page.locator('#all-cards [data-city="lijiang"]').count()==0
    page.locator('#hour-end').select_option('12')
    expect(page.locator('#filter-error')).to_contain_text('结束时间应晚于')
    page.locator('#hour-end').select_option('18')
    page.locator('#hour-start').select_option('9')
    page.locator('#more-filters').click()
    page.locator('#strict-match').check()
    assert page.locator('#all-cards [data-city="lijiang"]').count()==0
    page.locator('#strict-match').uncheck()
    print('PASS weather preferences, active-time changes, invalid windows, daily half-window rule')

    page.locator('[data-preference="rain"]').click()
    page.locator('#origin-city').select_option('shanghai')
    expect(page.locator('#max-distance')).to_be_enabled()
    page.locator('#max-distance').select_option('200')
    for city in ['hangzhou','suzhou']:
        assert page.locator(f'#all-cards [data-city="{city}"]').count()==1
    for city in ['shanghai','chengdu']:
        assert page.locator(f'#all-cards [data-city="{city}"]').count()==0
    expect(page.locator('#recommendation-list')).to_contain_text('直线')
    page.locator('#sort-order').select_option('distance')
    expect(page.locator('#recommendation-list .destination-card').first).to_have_attribute('data-city','suzhou')
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('#origin-city')).to_have_value('shanghai')
    expect(page.locator('#max-distance')).to_have_value('200')
    expect(page.locator('#data-status')).to_contain_text('缓存预报')
    page.locator('#origin-city').select_option('')
    expect(page.locator('#max-distance')).to_be_disabled()
    print('PASS origin/radius filters, origin exclusion, distance sorting, saved preferences')

    first=page.locator('#recommendation-list .destination-card').first
    city_id=first.get_attribute('data-city')
    first.locator('[data-visit]').click()
    expect(page.locator('#visited-count')).to_have_text('1')
    assert page.locator(f'#recommendation-list [data-city="{city_id}"]').count()==0
    page.locator('#footprints-nav').click()
    page.locator('[data-visit-note]').first.fill('旅行记忆 <script>alert(1)</script>')
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('#visited-count')).to_have_text('1')
    page.locator('#footprints-nav').click()
    expect(page.locator('[data-visit-note]').first).to_have_value('旅行记忆 <script>alert(1)</script>')
    page.locator(f'#visited-content [data-visit="{city_id}"]').click()
    expect(page.locator('#visited-count')).to_have_text('0')
    print('PASS footprint compatibility, exclusion, persistent notes, escaped text, restore')

    for index in range(3):page.locator('#recommendation-list [data-compare]').nth(index).click()
    expect(page.locator('#compare-tray .compare-chips>span')).to_have_count(3)
    page.locator('#show-all-btn').click()
    page.locator('#all-cards [data-compare][aria-pressed=false]').first.click()
    expect(page.locator('#toast')).to_contain_text('最多比较 3 个')
    page.locator('[data-open-compare]').click()
    expect(page.locator('#compare-dialog')).to_be_visible()
    expect(page.locator('.comparison-table thead th')).to_have_count(4)
    expect(page.locator('.comparison-table')).to_contain_text('日间合拍小时')
    page.locator('.comparison-remove').first.click()
    expect(page.locator('.comparison-table thead th')).to_have_count(3)
    page.keyboard.press('Escape')
    page.locator('#hour-start').select_option('13')
    page.locator('[data-open-compare]').click()
    expect(page.locator('.comparison-heading')).to_contain_text('13–18')
    page.keyboard.press('Escape')
    page.locator('[data-clear-compare]').click()
    expect(page.locator('#compare-tray')).not_to_be_visible()
    page.locator('#hour-start').select_option('9')
    page.locator('#collapse-results').click()
    print('PASS compare selection/limit/removal, updated criteria, clearing')

    page.locator('#search-btn').click()
    page.locator('#city-search').fill('大理')
    expect(page.locator('#search-results [data-open-city=\"dali\"]')).to_have_count(1)
    page.locator('#search-results [data-open-city=\"dali\"]').click()
    expect(page.locator('#city-dialog')).to_be_visible()
    expect(page.locator('.day-plan')).to_have_count(3)
    page.locator('.hour-slot').first.click()
    expect(page.locator('.hour-detail-line').first).to_contain_text('体感')
    page.locator('.score-explanation summary').click()
    expect(page.locator('.score-parts meter')).to_have_count(4)
    expect(page.locator('.score-explanation')).to_contain_text('不表示天气发生概率')
    page.keyboard.press('Escape')
    # Crowded non-recommended cities are available through the opt-in point layer.
    page.locator('#map-extra-points').check()
    page.locator('[data-map-city="beijing"]').click()
    expect(page.locator('.detail-badge.warning').first).to_contain_text('有恶劣天气')
    page.keyboard.press('Escape')
    page.locator('#map-extra-points').uncheck()
    print('PASS search, hourly details, score explanation, hazardous detail, keyboard close')

    page.locator('#more-filters').click()
    page.locator('#min-temp').fill('40');page.locator('#min-temp').dispatch_event('change')
    expect(page.locator('.empty-results')).to_be_visible()
    page.locator('#max-temp').fill('20');page.locator('#max-temp').dispatch_event('change')
    expect(page.locator('#filter-error')).to_contain_text('最低可接受温度')
    page.locator('#reset-filters').click()
    page.locator('#start-date').fill(DATES[5]);page.locator('#start-date').dispatch_event('change')
    expect(page.locator('#filter-error')).to_contain_text('返程日期不能早于')
    page.locator('#end-date').fill((TODAY+timedelta(days=25)).isoformat());page.locator('#end-date').dispatch_event('change')
    expect(page.locator('#filter-error')).to_contain_text('未来 16 天')
    page.locator('[data-quick-date="week"]').click()
    expect(page.locator('#filter-error')).not_to_be_visible()
    expect(page.locator('#trip-length')).to_have_text('共 7 天')
    page.locator('#map-zoom-in').click()
    assert 'scale(1.3)' in page.locator('#map-viewport').get_attribute('transform')
    page.locator('#map-reset').click()
    assert 'scale(1)' in page.locator('#map-viewport').get_attribute('transform')
    assert not errors,errors
    print('PASS date/temperature validation, quick dates, map controls, no JavaScript errors')

    page.route('https://api.open-meteo.com/**',lambda route:route.abort())
    page.evaluate("const c=JSON.parse(localStorage.getItem('sunseek-weather-v3'));c.forecasts.forEach(f=>f.time=Date.now()-2*3600000);localStorage.setItem('sunseek-weather-v3',JSON.stringify(c))")
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('#data-notice')).to_contain_text('本次连接未成功')
    expect(page.locator('#data-status')).to_contain_text('缓存预报')
    assert page.locator('#all-cards .destination-card').count()>0
    page.evaluate("const c=JSON.parse(localStorage.getItem('sunseek-weather-v3'));c.forecasts.forEach(f=>f.time=Date.now()-7*3600000);localStorage.setItem('sunseek-weather-v3',JSON.stringify(c))")
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('暂无可用预报')
    expect(page.locator('#all-cards .destination-card')).to_have_count(0)
    context.close()
    print('PASS failed refresh preserves timed cache; expired cache stops recommendations')

    context,page,errors=setup_page(browser,failure=True)
    expect(page.locator('#recommendation-list .destination-card')).to_have_count(0)
    page.locator('[data-enter-demo]').click()
    expect(page.locator('#data-notice')).to_contain_text('正在体验演示模式')
    expect(page.locator('#recommendation-list .destination-card')).to_have_count(3)
    assert page.evaluate("JSON.parse(localStorage.getItem('sunseek-weather-v3')||'{\"forecasts\":[]}').forecasts.length") == 0
    page.locator('#recommendation-list .destination-card').first.click()
    expect(page.locator('.detail-badge.warning')).to_contain_text('示例数据')
    page.keyboard.press('Escape')
    page.locator('[data-return-live]').click()
    expect(page.locator('#data-status')).to_contain_text('暂无可用预报')
    expect(page.locator('#all-cards .destination-card')).to_have_count(0)
    assert not errors,errors
    context.close()
    print('PASS unavailable state, explicit demo opt-in, demo isolation, return to real data')

    def partial(route):
        latitudes=parse_qs(urlparse(route.request.url).query)['latitude'][0]
        fixture(route) if latitudes.startswith('25.61,') else route.abort()
    context,page,errors=setup_page(browser,handler=partial)
    expect(page.locator('#data-notice')).to_contain_text('15 / 48')
    assert page.locator('#all-cards [data-city="lhasa"]').count()==0
    assert '示例' not in page.locator('#data-status').inner_text()
    assert not errors,errors
    context.close()
    print('PASS partial API failures never mix example and real forecasts')

    for width in [360,390,768,1024,1440]:
        context,page,errors=setup_page(browser,width=width,height=900)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'),f'Overflow at {width}'
        if width in [390,1440]:
            page.screenshot(path=f'/tmp/sunseek-v2-{width}.png',full_page=True)
            for index in range(2):page.locator('#recommendation-list [data-compare]').nth(index).click()
            page.locator('[data-open-compare]').click()
            page.screenshot(path=f'/tmp/sunseek-v2-compare-{width}.png')
            assert page.locator('#compare-dialog').bounding_box()['width']<=width
            page.keyboard.press('Escape')
            page.locator('#recommendation-list .destination-card').first.click()
            page.screenshot(path=f'/tmp/sunseek-v2-detail-{width}.png')
            assert page.locator('#city-dialog').bounding_box()['width']<=width
        assert not errors,(width,errors)
        context.close()
    browser.close()
    print('PASS five viewport sizes, mobile comparison/details; all v0.2 checks passed.')
