"""Daily map preview and flexible departure dates; all weather responses are mocked."""
import json
import sys
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright, expect
from fixtures import DATES, payload_for

sys.stdout.reconfigure(line_buffering=True)
BASE = 'http://localhost:4173'


def setup(browser, width=1440, clock=False):
    context = browser.new_context(viewport={'width': width, 'height': 1100},
                                  locale='zh-CN', timezone_id='Asia/Shanghai', reduced_motion='reduce')
    page = context.new_page()
    if clock:
        page.clock.install()
    page.set_default_timeout(10000)
    errors, calls = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def forecast(route):
        calls.append(route.request.url)
        payload = payload_for(route.request.url)
        lats = parse_qs(urlparse(route.request.url).query)['latitude'][0].split(',')
        for lat, data in zip(lats, payload):
            if lat == '25.61':
                # Dali has two cloudy travel days, then clear days; day three is missing one hour.
                for i, stamp in enumerate(data['hourly']['time']):
                    date = stamp[:10]
                    if date in DATES[1:3] and 8 <= int(stamp[11:13]) < 20:
                        data['hourly']['weather_code'][i] = 3
                        data['hourly']['cloud_cover'][i] = 95
                    if date == DATES[3] and stamp.endswith('T12:00'):
                        data['hourly']['cloud_cover'][i] = None
            if lat == '22.82':
                # A day with a nighttime storm must affect the whole trip, not other single-day views.
                for i, stamp in enumerate(data['hourly']['time']):
                    if stamp == DATES[2] + 'T21:00':
                        data['hourly']['weather_code'][i] = 95
        route.fulfill(content_type='application/json', body=json.dumps(payload))

    page.route('https://api.open-meteo.com/**', forecast)
    page.route('https://geocoding-api.open-meteo.com/**', lambda route: route.fulfill(
        content_type='application/json', body=json.dumps({'results': [
            {'id': 1805780, 'name': '宏村', 'latitude': 30.00361, 'longitude': 117.98167,
             'country_code': 'CN', 'country': '中国', 'admin1': '安徽', 'admin2': '黄山市'}]})))
    page.goto(BASE, wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('实时预报')
    return context, page, errors, calls


def open_city(page, name, city_id):
    page.locator('#search-btn').click()
    page.locator('#city-search').fill(name)
    page.locator(f'#search-results [data-open-city="{city_id}"]').click()
    expect(page.locator('#city-dialog')).to_be_visible()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context, page, errors, calls = setup(browser)
    # Include crowded/non-matching points when inspecting their per-day weather.
    page.locator('#map-extra-points').check()
    expect(page.locator('[data-map-date]')).to_have_count(4)
    original_cards = page.locator('#recommendation-list').inner_html()
    original_dates = [page.locator('#start-date').input_value(), page.locator('#end-date').input_value()]
    request_count = len(calls)
    page.locator(f'[data-map-date="{DATES[1]}"]').click()
    expect(page.locator('#map-date-label')).to_contain_text('单日')
    expect(page.locator('#map-preview-note')).to_contain_text('推荐仍按')
    expect(page.locator('[data-map-city="dali"]')).to_have_attribute('aria-label', '大理，阴，平均最高温22摄氏度，点击查看详情')
    assert page.locator('#recommendation-list').inner_html() == original_cards
    assert [page.locator('#start-date').input_value(), page.locator('#end-date').input_value()] == original_dates
    assert len(calls) == request_count
    page.locator(f'[data-map-date="{DATES[1]}"]').press('End')
    expect(page.locator(f'[data-map-date="{DATES[3]}"]')).to_be_focused()
    expect(page.locator('[data-map-city="dali"]')).to_have_attribute('aria-label', '大理，所选日期或小时数据不完整，点击查看详情')
    page.locator(f'[data-map-date="{DATES[3]}"]').press('ArrowLeft')
    expect(page.locator(f'[data-map-date="{DATES[2]}"]')).to_have_attribute('aria-pressed', 'true')
    page.locator(f'[data-map-date="{DATES[2]}"]').press('Home')
    expect(page.locator('[data-map-date=""]')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('[data-map-date=""]')).to_be_focused()
    print('PASS daily map reads the selected day, preserves trip recommendations/dates, and supports keyboard navigation')

    page.locator('#region-filter').select_option('450000')
    expect(page.locator('#map-scope-note')).to_contain_text('14 个所选时段预报完整')
    page.locator(f'[data-map-date="{DATES[1]}"]').click()
    nanning = page.locator('[data-map-city="nanning"]')
    nanning.hover()
    expect(page.locator('#map-tooltip')).to_contain_text('9 / 9h 合拍')
    expect(page.locator('#map-tooltip')).not_to_contain_text('有不利天气')
    safe_fill = page.locator('[data-province="450000"]').get_attribute('fill')
    page.locator(f'[data-map-date="{DATES[2]}"]').click()
    page.locator('[data-map-city="nanning"]').hover()
    expect(page.locator('#map-tooltip')).to_contain_text('有不利天气')
    assert page.locator('[data-province="450000"]').get_attribute('fill') != safe_fill
    page.locator('#map-national').click()
    expect(page.locator(f'[data-map-date="{DATES[2]}"]')).to_have_attribute('aria-pressed', 'true')
    page.locator('#end-date').fill(DATES[1]); page.locator('#end-date').dispatch_event('change')
    expect(page.locator('[data-map-date=""]')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('[data-map-date]')).to_have_count(2)
    page.locator('#end-date').fill(DATES[3]); page.locator('#end-date').dispatch_event('change')
    page.locator('#map-extra-points').uncheck()
    print('PASS province colors and hazards follow the preview day, region changes retain it, date-range changes reset it')

    open_city(page, '大理', 'dali')
    expect(page.locator('#departure-options')).not_to_have_attribute('open', '')
    page.locator('#departure-options summary').click()
    expect(page.locator('#departure-duration')).to_have_value('3')
    expect(page.locator('.departure-option')).to_have_count(3)
    first = page.locator('[data-use-departure-start]').first
    assert first.get_attribute('data-use-departure-start') == DATES[4]
    expect(page.locator('#departure-summary')).to_contain_text('10 / 13 段预报完整')
    expect(page.locator('.departure-option').first).to_contain_text('27 / 27h')
    assert page.locator('#departure-options').evaluate("node=>!!(document.querySelector('.daily-details').compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)")
    assert page.locator('#attraction-panel').evaluate("node=>!!(document.querySelector('#departure-options').compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)")
    initial_calls = len(calls)
    page.locator('#departure-duration').select_option('2')
    expect(page.locator('.departure-option').first).to_contain_text('18 / 18h')
    first = page.locator('[data-use-departure-start]').first
    chosen_start, chosen_end = first.get_attribute('data-use-departure-start'), first.get_attribute('data-use-departure-end')
    first.click()
    expect(page.locator('#start-date')).to_have_value(chosen_start)
    expect(page.locator('#end-date')).to_have_value(chosen_end)
    expect(page.locator('.day-plan')).to_have_count(2)
    expect(page.locator('#departure-options')).to_have_attribute('open', '')
    expect(page.locator('[data-use-departure-start]').first).to_be_disabled()
    expect(page.locator('#departure-duration')).to_be_focused()
    expect(page.locator('#all-cards [data-city="dali"]')).to_contain_text('18 / 18h')
    assert len(calls) == initial_calls, 'date comparisons and adoption must reuse loaded forecasts'
    assert page.evaluate("localStorage.getItem('sunseek-footprints-v1')") is None
    page.locator('#departure-duration').select_option('16')
    expect(page.locator('.departure-empty')).to_contain_text('预报范围不足')
    expect(page.locator('[data-use-departure-start]')).to_have_count(0)
    page.locator('#departure-duration').select_option('3')
    page.locator('#departure-options').screenshot(path='/tmp/sunseek-v5-departure-desktop.png')
    assert not errors, errors
    page.keyboard.press('Escape')
    print('PASS distinct complete departure windows, inherited duration, weather-first placement, adoption and no extra weather calls')

    # A preview can apply trip dates without becoming a saved destination or footprint.
    page.locator('[data-preference="rain"]').click()
    page.locator('#search-btn').click()
    page.locator('#city-search').fill('宏村')
    page.locator('[data-online-place]').first.click()
    expect(page.locator('.preview-badge')).to_contain_text('尚未保存')
    expect(page.locator('.place-fetch-status')).not_to_contain_text('正在获取')
    page.locator('#departure-options summary').click()
    expect(page.locator('.departure-option')).to_have_count(3)
    page.locator('#departure-duration').select_option('1')
    page.locator('[data-use-departure-start]').first.click()
    expect(page.locator('.preview-badge')).to_contain_text('尚未保存')
    assert page.evaluate("localStorage.getItem('sunseek-places-v3')") is None
    assert page.evaluate("localStorage.getItem('sunseek-footprints-v1')") is None
    assert 'preview-' not in page.evaluate("localStorage.getItem('sunseek-weather-v3')")
    page.keyboard.press('Escape')
    expect(page.locator('#saved-places')).to_be_hidden()
    assert not errors, errors
    context.close()
    print('PASS applying suggested dates to an unsaved destination does not save it or record a visit')

    context, page, errors, calls = setup(browser, clock=True)
    open_city(page, '大理', 'dali')
    page.locator('#departure-options summary').click()
    expect(page.locator('.departure-option')).to_have_count(3)
    page.clock.fast_forward(6 * 3600000 + 61000)
    expect(page.locator('[data-use-departure-start]')).to_have_count(0)
    expect(page.locator('.departure-empty')).to_contain_text('不足以比较完整行程')
    page.keyboard.press('Escape')
    cache_before_demo = page.evaluate("localStorage.getItem('sunseek-weather-v3')")
    page.locator('#source-btn').click()
    page.locator('#demo-weather').click()
    page.keyboard.press('Escape')
    open_city(page, '大理', 'dali')
    page.locator('#departure-options summary').click()
    expect(page.locator('#departure-summary')).to_contain_text('示例数据')
    expect(page.locator('.departure-label').first).to_contain_text('示例')
    assert page.evaluate("localStorage.getItem('sunseek-weather-v3')") == cache_before_demo
    assert not errors, errors
    context.close()
    print('PASS expired forecasts lose departure suggestions; explicit demo is labeled and never cached as real weather')

    for width in [360, 390, 768, 1440]:
        context, page, errors, calls = setup(browser, width)
        page.locator('#end-date').fill(DATES[15]); page.locator('#end-date').dispatch_event('change')
        page.locator('[data-map-date=""]').focus()
        page.keyboard.press('End')
        selected = page.locator(f'[data-map-date="{DATES[15]}"]')
        expect(selected).to_be_focused()
        rect, strip = selected.bounding_box(), page.locator('#map-date-tabs').bounding_box()
        assert rect['x'] >= strip['x'] - 2 and rect['x'] + rect['width'] <= strip['x'] + strip['width'] + 2
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        if width in [390, 1440]:
            page.locator('.map-panel').screenshot(path=f'/tmp/sunseek-v5-timeline-{width}.png')
        open_city(page, '大理', 'dali')
        page.locator('#departure-options summary').click()
        page.locator('#departure-duration').select_option('3')
        expect(page.locator('.departure-option')).to_have_count(3)
        assert page.locator('#city-dialog').evaluate('(node)=>node.scrollWidth<=node.clientWidth'), width
        if width == 390:
            page.locator('#departure-options').screenshot(path='/tmp/sunseek-v5-departure-mobile.png')
        assert not errors, errors
        context.close()
    browser.close()
    print('PASS date-strip scrolling, keyboard visibility, responsive map and departure cards at four widths')
