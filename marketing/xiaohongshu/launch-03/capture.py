"""Capture the real preference panel, without live services or map content."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent
PROJECT=ROOT.parents[2]
with sync_playwright() as p:
 browser=p.chromium.launch()
 context=browser.new_context(viewport={"width":390,"height":844},device_scale_factor=2,is_mobile=True,has_touch=True,locale="zh-CN",timezone_id="Asia/Shanghai",reduced_motion="reduce")
 context.route("**/*",lambda route:route.continue_() if route.request.url.startswith(PROJECT.as_uri()+"/") else route.abort())
 context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:false};window.SUNSEEK_OBJECT_WEATHER_SERVICE={enabled:false};")
 page=context.new_page();page.goto((PROJECT/"index.html").as_uri(),wait_until="load")
 page.locator("#about-btn").click();page.locator("#demo-weather").click()
 expect(page.locator("#data-status")).to_contain_text("示例")
 page.locator("#about-dialog [data-close-dialog]").first.click()
 page.locator(".filter-panel").screenshot(path=str(ROOT/"screens/preferences.png"))
 context.close();browser.close();print("Preference panel captured; no external requests allowed")
