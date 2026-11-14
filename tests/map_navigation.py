"""Hierarchical map return, surrounding targets and on-demand weather isolation."""
import re
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect
from fixtures import fixture


def click_province(page, code):
    svg = page.locator('#weather-map')
    svg.scroll_into_view_if_needed()
    target = page.locator(f'[data-province="{code}"]')
    point = target.evaluate('''path=>{
      const map=document.querySelector('#weather-map').getBoundingClientRect();
      const box=path.getBoundingClientRect();
      const left=Math.max(map.left+12,box.left),right=Math.min(map.right-12,box.right);
      const top=Math.max(map.top+12,box.top,0),bottom=Math.min(map.bottom-12,box.bottom,innerHeight);
      for(let y=top+3;y<bottom;y+=5)for(let x=left+3;x<right;x+=5){
        if(document.elementFromPoint(x,y)===path)return {x,y};
      }
      return null;
    }''')
    assert point, f'No exposed clickable province {code}'
    page.mouse.click(point['x'], point['y'])


def open_city(page, name):
    page.locator('#search-btn').click()
    page.locator('#city-search').fill(name)
    page.locator('#search-results [data-open-city]').first.click()


def setup(browser):
    context = browser.new_context(viewport={'width':1440,'height':1100},locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce')
    context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:false}");page = context.new_page(); page.set_default_timeout(8000)
    calls=[]; errors=[]
    def forecast(route):
        query=parse_qs(urlparse(route.request.url).query)
        calls.append(list(zip(query['latitude'][0].split(','),query['longitude'][0].split(','))))
        fixture(route)
    page.route('https://api.open-meteo.com/**', forecast)
    page.route('https://geocoding-api.open-meteo.com/**', lambda route:route.fulfill(json={'results':[]}))
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://localhost:4173',wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('实时预报')
    return context,page,calls,errors


with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context,page,calls,errors=setup(browser)
    page.locator('#region-filter').select_option('华北')
    date=page.locator('[data-map-date]').nth(1).get_attribute('data-map-date')
    page.locator(f'[data-map-date="{date}"]').click()
    regional=page.locator('[data-province="150000"]').get_attribute('d')
    click_province(page,'150000')
    expect(page.locator('#map-scope-name')).to_have_text('内蒙古')
    expect(page.locator('[data-map-scope="华北"]')).to_be_visible()
    page.locator('[data-map-scope="华北"]').focus()
    page.evaluate("document.querySelector('#sort-order').dispatchEvent(new Event('change'))")
    expect(page.locator('[data-map-scope="华北"]')).to_be_focused()
    page.locator('.map-panel').screenshot(path='/tmp/sunseek-map-navigation-province.png')
    assert page.locator('[data-province="150000"]').get_attribute('d')!=regional
    count=len(calls)
    page.locator('[data-map-scope="华北"]').click()
    expect(page.locator('#region-filter')).to_have_value('华北')
    expect(page.locator('#map-scope-name')).to_be_focused()
    assert page.locator('[data-province="150000"]').get_attribute('d')==regional
    assert len(calls)==count
    expect(page.locator(f'[data-map-date="{date}"]')).to_have_attribute('aria-pressed','true')
    print('PASS 华北 → 内蒙古 → 华北, exact regional extent, focus and preview date preserved',flush=True)

    click_province(page,'150000')
    before=len(calls)
    page.wait_for_timeout(100)
    assert len(calls)==before, 'showing surrounding cities must not fetch their weather'
    path=page.locator('[data-province="130000"]')
    assert path.evaluate('el=>getComputedStyle(el).pointerEvents')!='none'
    click_province(page,'130000')
    expect(page.locator('#region-filter')).to_have_value('130000')
    expect(page.locator('#map-scope-name')).to_have_text('河北')
    expect(page.locator('[data-map-scope="华北"]')).to_be_visible()
    # Keyboard activation works in a province view, including cross-region jumps.
    path=page.locator('[data-province="370000"]')
    path.focus()
    assert page.locator('#province-hover path').get_attribute('d')==path.get_attribute('d')
    page.keyboard.press('Enter')
    expect(page.locator('#region-filter')).to_have_value('370000')
    expect(page.locator('[data-map-scope="华东"]')).to_be_visible()
    expect(page.locator('[data-map-scope="华北"]')).to_have_count(0)
    page.locator('#map-national').click()
    expect(page.locator('#region-filter')).to_have_value('all')
    assert not errors,errors
    context.close()
    print('PASS exposed surrounding province clicks, hover and keyboard switching, correct parent region',flush=True)

    context,page,calls,errors=setup(browser)
    open_city(page,'北京')
    page.locator('[data-focus-city="beijing"]').click()
    expect(page.locator('#map-scope-name')).to_have_text('北京附近')
    expect(page.locator('[data-map-scope="110000"]')).to_have_text('北京')
    neighbor=page.locator('[data-map-city="area-131000"]')
    expect(neighbor).to_be_visible()
    expect(neighbor).to_have_class(re.compile('nearby-marker'))
    page.locator('.map-panel').screenshot(path='/tmp/sunseek-map-navigation-neighbors.png')
    initial=len(calls)
    neighbor.click()
    expect(page.locator('#region-filter')).to_have_value('130000')
    expect(page.locator('#map-scope-name')).to_have_text('廊坊附近')
    expect(page.locator('.city-dialog-title h2')).to_have_text('廊坊')
    page.wait_for_function("!document.querySelector('#retry-weather').disabled")
    assert len(calls)==initial+1 and len(calls[-1])==1,calls[initial:]
    page.keyboard.press('Escape')
    page.locator('[data-map-scope="130000"]').click()
    expect(page.locator('#map-scope-name')).to_have_text('河北')
    expect(page.locator('[data-map-scope="130000"]')).to_have_count(0)
    print('PASS neighboring city switches map and opens weather; only that city fetched; return to province',flush=True)

    for width in [360,390,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        open_city(page,'呼和浩特')
        page.locator('[data-focus-city="hohhot"]').click()
        expect(page.locator('[data-map-scope="华北"]')).to_be_visible()
        expect(page.locator('[data-map-scope="150000"]')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.locator('.map-panel').screenshot(path=f'/tmp/sunseek-map-navigation-{width}.png')
        page.locator('[data-map-scope="150000"]').click()
        expect(page.locator('#map-scope-name')).to_have_text('内蒙古')
        page.locator('[data-map-scope="华北"]').click()
        expect(page.locator('#map-scope-name')).to_have_text('华北')
    assert not errors,errors
    print('PASS city → province → region breadcrumbs at 360/390/768/1440px, no page overflow or JS errors',flush=True)
    browser.close()
