"""Weather transport recovery and province coverage, with deterministic API fixtures.

Run against localhost:4173. No live forecast quota is consumed.
"""
import json
import sys
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright
from fixtures import fixture, payload_for

sys.stdout.reconfigure(line_buffering=True)
BASE = 'http://localhost:4173'


def new_page(browser, handler, width=1440):
    context = browser.new_context(viewport={'width': width, 'height': 1100},
                                  locale='zh-CN', timezone_id='Asia/Shanghai', reduced_motion='reduce')
    context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:false}");page = context.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://api.open-meteo.com/**', handler)
    page.route('https://geocoding-api.open-meteo.com/**', lambda route: route.fulfill(
        content_type='application/json', body='{"results":[]}'))
    return context, page, errors


def latitudes(route):
    return parse_qs(urlparse(route.request.url).query)['latitude'][0]


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    held = []
    calls = []

    def timeout_once(route):
        lats = latitudes(route)
        calls.append(lats)
        if lats.startswith('25.61,') and calls.count(lats) == 1:
            held.append(route)
        else:
            fixture(route)

    context, page, errors = new_page(browser, timeout_once)
    page.clock.install()
    page.goto(BASE, wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('连接')
    page.wait_for_timeout(100)
    assert len(held) == 1
    page.clock.fast_forward(22010)
    expect(page.locator('#data-status')).to_contain_text('实时预报')
    assert len(calls) == 4 and calls[0] == calls[1], calls
    assert calls[2].startswith('26.65,') and calls[3].startswith('36.62,'), calls
    cached = page.evaluate("JSON.parse(localStorage.getItem('sunseek-weather-v3')).forecasts.map(f=>f.data[0][0])")
    assert {'dali', 'lhasa', 'changchun'} <= set(cached), cached
    fixture(held.pop())
    assert not errors, errors
    context.close()
    print('PASS one timed-out batch retries once; subsequent batches and cache remain intact')

    mode = 'fail'
    province_calls = []

    def guangxi(route):
        lats = latitudes(route)
        if lats.startswith('24.31462'):
            province_calls.append(lats)
            if mode == 'fail':
                route.fulfill(status=503, body='Temporarily unavailable')
                return
            if mode == 'partial':
                payload = payload_for(route.request.url)
                for index, time in enumerate(payload[0]['hourly']['time']):
                    if time.endswith('T12:00'):
                        payload[0]['hourly']['cloud_cover'][index] = None
                route.fulfill(content_type='application/json', body=json.dumps(payload))
                return
        fixture(route)

    context, page, errors = new_page(browser, guangxi)
    page.goto(BASE, wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('实时预报')
    page.locator('#region-filter').select_option('450000')
    note = page.locator('#map-scope-note')
    retry = page.locator('#retry-scope-weather')
    expect(note).to_contain_text('12 个获取失败')
    expect(note).to_contain_text('2 个所选时段预报完整')
    expect(retry).to_be_enabled()
    assert len(province_calls) == 2
    marker = page.locator('[data-map-city="area-450200"]')
    expect(marker).to_have_attribute('aria-label', '柳州，天气获取失败：接口返回错误（503），点击查看详情')
    page.set_viewport_size({'width': 390, 'height': 1000})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile overflow'
    expect(retry).to_be_visible()
    page.locator('.map-panel').screenshot(path='/tmp/sunseek-weather-retry-mobile.png')
    page.set_viewport_size({'width': 1440, 'height': 1100})
    page.locator('.map-panel').screenshot(path='/tmp/sunseek-weather-retry-desktop.png')

    mode = 'partial'
    retry.click()
    expect(note).to_contain_text('13 个所选时段预报完整')
    expect(note).to_contain_text('1 个日期或小时不全')
    expect(note).not_to_contain_text('获取失败')
    assert len(province_calls) == 3
    expect(page.locator('#all-cards [data-city="area-450200"]')).to_have_count(0)
    marker.click()
    expect(page.locator('.place-fetch-status')).to_contain_text('所选日期或小时数据不全')
    page.keyboard.press('Escape')

    mode = 'ok'
    retry.click()
    expect(note).to_contain_text('14 个所选时段预报完整')
    expect(retry).to_be_hidden()
    assert len(province_calls) == 4 and province_calls[-1] == '24.31462', province_calls
    assert not errors, errors
    context.close()
    print('PASS Guangxi failed/partial/complete states, mobile retry, missing-only recovery and exclusion')

    limited = True
    jilin_calls = []

    def jilin(route):
        lats = latitudes(route)
        if lats.startswith('43.84358'):
            jilin_calls.append(lats)
            if limited:
                route.fulfill(status=429, body='Too many requests')
                return
        fixture(route)

    context, page, errors = new_page(browser, jilin)
    page.goto(BASE, wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('实时预报')
    page.locator('#region-filter').select_option('220000')
    expect(page.locator('#map-scope-note')).to_contain_text('8 个获取失败')
    assert len(jilin_calls) == 1, '429 must not be retried automatically'
    expect(page.locator('[data-map-city="area-220200"]')).to_have_attribute(
        'aria-label', '吉林，天气获取失败：接口请求受限，请稍后重试，点击查看详情')
    limited = False
    page.locator('#retry-scope-weather').click()
    expect(page.locator('#map-scope-note')).to_contain_text('10 个所选时段预报完整')
    expect(page.locator('#retry-scope-weather')).to_be_hidden()
    assert len(jilin_calls) == 2
    assert not errors, errors
    context.close()
    browser.close()
    print('PASS Jilin rate-limit explanation, no automatic 429 retry and manual recovery')
