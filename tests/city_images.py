"""Photo provenance, actual asset decoding, UI fallback and subpath hosting checks."""
import hashlib
import json
import mimetypes
import re
from pathlib import Path
from urllib.parse import unquote, urlparse

from PIL import Image
from playwright.sync_api import sync_playwright, expect
from fixtures import fixture

ROOT = Path(__file__).resolve().parent.parent
rows = json.loads((ROOT / 'assets/city-images.json').read_text())['images']
featured = re.findall(r"\['([^']+)','", (ROOT / 'app.js').read_text().split('const cityRows = [')[1].split('];')[0])
assert len(rows) == 48 and {r['id'] for r in rows} == set(featured)
for row in rows:
    assert all(row.get(key) for key in ['author', 'source', 'license', 'licenseUrl', 'alt', 'changes', 'verified'])
    assert row['kind'] == 'real' and row['source'].startswith('https://commons.wikimedia.org/wiki/File:')
    for key, max_width in [('card', 640), ('detail', 1280)]:
        path = ROOT / row[key]
        assert path.stat().st_size <= (50000 if key == 'card' else 150000), path
        with Image.open(path) as image:
            assert image.format == 'WEBP' and 0 < image.width <= max_width
            image.load()
        assert hashlib.sha256(path.read_bytes()).hexdigest() == row['outputs'][key]['sha256']
print('PASS all 48 provenance records, 96 WebP assets, size budgets and hashes', flush=True)


def open_city(page, name):
    page.locator('#search-btn').click()
    page.locator('#city-search').fill(name)
    page.locator('#search-results [data-open-city]').first.click()
    expect(page.locator('#city-dialog')).to_be_visible()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1100}, timezone_id='Asia/Shanghai', reduced_motion='reduce')
    context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:false}");page = context.new_page()
    page.set_default_timeout(8000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://api.open-meteo.com/**', fixture)
    page.route('https://geocoding-api.open-meteo.com/**', lambda route: route.fulfill(json={'results': []}))
    page.goto('http://localhost:4173', wait_until='networkidle')
    expect(page.locator('#data-status')).to_contain_text('实时预报')
    card = page.locator('#recommendation-list [data-city="dali"]')
    expect(card.locator('img')).to_have_attribute('src', 'assets/cities/dali-card.webp')
    expect(card.locator('.photo-attribution')).to_contain_text('Andrew and Annemarie')
    # Source/permission links must not trigger the surrounding card's open action.
    card.locator('[data-photo-link]').first.evaluate("el=>el.addEventListener('click',e=>e.preventDefault())")
    card.locator('[data-photo-link]').first.click()
    expect(page.locator('#city-dialog')).not_to_be_visible()
    card.click(position={'x': 40, 'y': 30})
    expect(page.locator('.city-dialog-hero img')).to_have_attribute('src', 'assets/cities/dali-detail.webp')
    expect(page.locator('.dialog-image-note')).to_contain_text('实景照片')
    expect(page.locator('.city-photo-credit')).to_contain_text('CC BY-SA 2.0')
    assert page.locator('.city-dialog-hero img').evaluate('(im)=>im.complete&&im.naturalWidth>0')
    page.locator('#city-dialog [data-compare]').click()
    page.locator('#city-dialog [data-close-dialog]').click()
    open_city(page, '三亚')
    page.locator('#city-dialog [data-compare]').click()
    page.locator('#city-dialog [data-close-dialog]').click()
    page.locator('[data-open-compare]').click()
    expect(page.locator('.comparison-table img').first).to_have_attribute('src', 'assets/cities/dali-card.webp')
    expect(page.locator('.comparison-table .photo-attribution').first).to_contain_text('CC BY-SA 2.0')
    page.locator('.comparison-remove').first.click()
    expect(page.locator('.comparison-table img')).to_have_count(1)
    page.locator('#compare-dialog [data-close-dialog]').click()
    print('PASS shared card/detail/comparison photos, attribution and source-link interaction', flush=True)

    # Failed card and detail images preserve the location UI, rather than broken-image text.
    page.route('**/assets/cities/dali-*.webp', lambda route: route.fulfill(status=404, body='missing'))
    page.reload(wait_until='networkidle')
    expect(page.locator('#recommendation-list [data-city="dali"] .image-unavailable')).to_be_visible()
    expect(page.locator('#recommendation-list [data-city="dali"] img')).not_to_be_visible()
    open_city(page, '大理')
    expect(page.locator('.dialog-image-note')).to_have_text('地点示意 · 图片暂不可用')
    expect(page.locator('.city-dialog-hero .place-placeholder')).to_be_visible()
    page.locator('#city-dialog [data-close-dialog]').click()
    page.unroute('**/assets/cities/dali-*.webp')
    open_city(page, '百色')
    expect(page.locator('.dialog-image-note')).to_contain_text('暂无实景配图')
    expect(page.locator('.city-dialog-hero img')).to_have_count(0)
    page.locator('#city-dialog [data-close-dialog]').click()
    print('PASS failed image and ordinary-location fallback', flush=True)

    page.evaluate('delete window.SUNSEEK_CITY_IMAGES.dali')
    open_city(page, '大理')
    expect(page.locator('.dialog-image-note')).to_contain_text('非对应城市实景')
    expect(page.locator('.city-dialog-hero img')).to_have_attribute('src', 'assets/mountains.jpg')
    page.locator('#city-dialog [data-close-dialog]').click()
    print('PASS legacy inspiration images keep their original meaning', flush=True)

    page.reload(wait_until='networkidle')
    for width in [360, 390, 768, 1440]:
        page.set_viewport_size({'width': width, 'height': 1000})
        open_city(page, '大理')
        expect(page.locator('.city-dialog-hero img')).to_be_visible()
        assert page.locator('#city-dialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
        page.screenshot(path=f'/tmp/sunseek-city-photo-{width}.png')
        page.locator('#city-dialog [data-close-dialog]').click()
    assert not errors, errors
    print('PASS desktop/mobile photos and attribution layout, no JS errors', flush=True)

    # Serve the same files under a repository-style prefix without changing app paths.
    prefixed = context.new_page()
    def subpath(route):
        relative = unquote(urlparse(route.request.url).path.removeprefix('/sunseek/')) or 'index.html'
        file = (ROOT / relative).resolve()
        assert file.is_relative_to(ROOT)
        route.fulfill(path=file, content_type=mimetypes.guess_type(file)[0] or 'application/octet-stream')
    prefixed.route('http://localhost:4173/sunseek/**', subpath)
    prefixed.route('https://api.open-meteo.com/**', fixture)
    prefixed.goto('http://localhost:4173/sunseek/', wait_until='networkidle')
    image = prefixed.locator('#recommendation-list [data-city="dali"] img')
    assert image.evaluate('(im)=>im.complete&&im.naturalWidth>0&&new URL(im.src).pathname.startsWith("/sunseek/assets/")')
    print('PASS relative assets under /sunseek/ hosting prefix', flush=True)
    browser.close()
