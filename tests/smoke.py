"""Browser checks. Requires Python Playwright and a server at localhost:4173.

Run: python3 tests/smoke.py
Uses deterministic API fixtures; screenshots are saved in /tmp.
"""
import json
import sys
sys.stdout.reconfigure(line_buffering=True)
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright, expect

TODAY = datetime.now(ZoneInfo('Asia/Shanghai')).date()
DATES = [(TODAY + timedelta(days=i)).isoformat() for i in range(16)]
BASE = 'http://localhost:4173'


def fixture(route):
    query = parse_qs(urlparse(route.request.url).query)
    latitudes = [float(v) for v in query['latitude'][0].split(',')]
    longitudes = [float(v) for v in query['longitude'][0].split(',')]
    payload = []
    for lat, lon in zip(latitudes, longitudes):
        code, maximum, snow, rain = 0, 22, 0, 0
        if lat >= 42:
            code, maximum, snow, rain = 71, -2, 2, 2
        elif 28 < lat < 33:
            code, maximum, rain = 61, 20, 4
        if lat == 39.9:  # Beijing: hazardous weather must never be recommended.
            code, rain = 95, 60
        if lat == 22.54:  # Shenzhen: missing data must not become zero values.
            maximum = None
        daily = {
            'time': DATES, 'weather_code': [code] * 16,
            'temperature_2m_max': [maximum] * 16,
            'temperature_2m_min': [maximum - 8 if maximum is not None else None] * 16,
            'precipitation_probability_max': [80 if rain else 5] * 16,
            'precipitation_sum': [rain] * 16, 'snowfall_sum': [snow] * 16,
            'wind_speed_10m_max': [8] * 16,
        }
        payload.append({'latitude': lat, 'longitude': lon, 'daily': daily})
    route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))


def setup_page(browser, width=1440, height=1100, failure=False):
    context = browser.new_context(viewport={'width': width, 'height': height}, locale='zh-CN', timezone_id='Asia/Shanghai')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.route('https://fonts.googleapis.com/**', lambda route: route.abort())
    page.route('https://api.open-meteo.com/**', (lambda route: route.abort()) if failure else fixture)
    page.goto(BASE, wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('示例数据' if failure else '实时预报')
    return context, page, errors


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context, page, errors = setup_page(browser)
    expect(page.locator('.province')).to_have_count(35)
    expect(page.locator('#recommendation-list .destination-card')).to_have_count(3)
    assert page.locator('#all-cards [data-city="beijing"]').count() == 0
    assert page.locator('#all-cards [data-city="shenzhen"]').count() == 0
    print('PASS live forecast, map, hazardous weather exclusion, missing-data exclusion')

    for preference in ['snow', 'rain', 'cool', 'sun']:
        page.locator(f'[data-preference="{preference}"]').click()
        expect(page.locator(f'[data-preference="{preference}"]')).to_have_attribute('aria-pressed', 'true')
        assert page.locator('#all-cards .destination-card').count() > 0
    print('PASS all four preference filters')

    first = page.locator('#recommendation-list .destination-card').first
    city_id = first.get_attribute('data-city')
    first.locator('[data-visit]').click()
    expect(page.locator('#visited-count')).to_have_text('1')
    assert page.locator(f'#recommendation-list [data-city="{city_id}"]').count() == 0
    page.locator('#footprints-nav').click()
    note = page.locator('[data-visit-note]').first
    note.fill('一段旅行的记忆 <script>alert(1)</script>')
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('#visited-count')).to_have_text('1')
    page.locator('#footprints-nav').click()
    expect(page.locator('[data-visit-note]').first).to_have_value('一段旅行的记忆 <script>alert(1)</script>')
    page.locator(f'#visited-content [data-visit="{city_id}"]').click()
    expect(page.locator('#visited-count')).to_have_text('0')
    assert page.locator(f'#all-cards [data-city="{city_id}"]').count() == 1
    print('PASS visited exclusions, persisted notes, safe text rendering, restore recommendation')

    page.locator('#search-btn').click()
    page.locator('#city-search').fill('哈尔滨')
    expect(page.locator('#search-results .search-result')).to_have_count(1)
    page.locator('#search-results .search-result').click()
    expect(page.locator('#city-dialog')).to_be_visible()
    expect(page.locator('.city-dialog-title h2')).to_have_text('哈尔滨')
    expect(page.locator('.forecast-table tbody tr')).to_have_count(3)
    page.keyboard.press('Escape')
    expect(page.locator('#city-dialog')).not_to_be_visible()
    page.locator('[data-map-city="beijing"]').click()
    expect(page.locator('.detail-badge.warning')).to_contain_text('有恶劣天气')
    page.keyboard.press('Escape')
    print('PASS search, daily forecast, hazardous city detail, dialog keyboard close')

    page.locator('#more-filters').click()
    page.locator('#min-temp').fill('40')
    page.locator('#min-temp').dispatch_event('change')
    expect(page.locator('.empty-results')).to_be_visible()
    page.locator('#max-temp').fill('20')
    page.locator('#max-temp').dispatch_event('change')
    expect(page.locator('#filter-error')).to_contain_text('最低可接受温度')
    page.locator('#reset-filters').click()
    page.locator('#start-date').fill(DATES[5])
    page.locator('#start-date').dispatch_event('change')
    expect(page.locator('#filter-error')).to_contain_text('返程日期不能早于')
    page.locator('#end-date').fill((TODAY + timedelta(days=25)).isoformat())
    page.locator('#end-date').dispatch_event('change')
    expect(page.locator('#filter-error')).to_contain_text('未来 16 天')
    page.locator('[data-quick-date="week"]').click()
    expect(page.locator('#filter-error')).not_to_be_visible()
    expect(page.locator('#trip-length')).to_have_text('共 7 天')
    print('PASS temperature validation, empty results, date order/range validation, quick dates')

    page.locator('#region-filter').select_option('西南')
    assert '云南' in page.locator('#recommendation-list').inner_text()
    page.locator('#sort-order').select_option('days')
    page.locator('#show-all-btn').click()
    expect(page.locator('#all-destinations')).to_be_visible()
    page.locator('#collapse-results').click()
    expect(page.locator('#all-destinations')).not_to_be_visible()
    page.locator('#map-zoom-in').click()
    assert 'scale(1.3)' in page.locator('#map-viewport').get_attribute('transform')
    page.locator('#map-reset').click()
    assert 'scale(1)' in page.locator('#map-viewport').get_attribute('transform')
    assert not errors, errors
    print('PASS region, sort, expand/collapse, map zoom/reset; no JavaScript errors')
    context.close()

    context, page, errors = setup_page(browser, failure=True)
    page.screenshot(path='/tmp/sunseek-demo-desktop.png', full_page=True)
    page.locator('#recommendation-list .destination-card').first.click()
    expect(page.locator('.detail-badge.warning')).to_contain_text('示例数据')
    page.keyboard.press('Escape')
    assert not errors, errors
    context.close()
    print('PASS offline demo labelling in overview and city details')

    for width in [360, 390, 768, 1024, 1440]:
        context, page, errors = setup_page(browser, width=width, height=844)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), f'Overflow at {width}'
        if width == 390:
            page.screenshot(path='/tmp/sunseek-mobile.png', full_page=True)
            page.locator('#recommendation-list .destination-card').first.click()
            page.locator('#city-dialog').evaluate('(dialog) => Promise.all(dialog.getAnimations().map(animation => animation.finished))')
            page.screenshot(path='/tmp/sunseek-mobile-detail.png')
            expect(page.locator('#city-dialog')).to_be_visible()
            assert page.locator('#city-dialog').bounding_box()['width'] <= width
        assert not errors, (width, errors)
        context.close()
    print('PASS 360, 390, 768, 1024 and 1440px layouts and mobile city details')
    browser.close()
    print('All browser smoke checks passed.')
