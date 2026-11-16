"""Export the six local HTML posters and overview. Never requests external URLs."""
import json,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent
with sync_playwright() as p:
 browser=p.chromium.launch()
 page=browser.new_page(viewport={'width':1152,'height':1512},device_scale_factor=1)
 page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(ROOT.parent.as_uri()+'/') else r.abort())
 page.goto((ROOT/'slides.html').as_uri(),wait_until='networkidle')
 page.evaluate('document.fonts.ready')
 invalid=page.locator('img').evaluate_all('(images)=>images.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)')
 if invalid:raise RuntimeError('Missing assets: '+str(invalid))
 for slide in page.locator('.slide').all():
  slide.screenshot(path=str(ROOT/'exports'/(slide.get_attribute('data-export')+'.png')))
 # Overview is composed in HTML from untouched final exports.
 cards=''.join(f'<figure><img src="exports/{path.name}"><figcaption>{path.name}</figcaption></figure>' for path in sorted((ROOT/'exports').glob('*.png')))
 overview='<!doctype html><meta charset="utf-8"><title>晴游 · 六图总览</title><style>body{margin:0;padding:28px;background:#e8eae2;font-family:"PingFang SC",sans-serif;color:#244d40}h1{font-size:26px;margin:0 0 22px}main{display:grid;grid-template-columns:repeat(3,360px);gap:24px}figure{margin:0}img{display:block;width:360px;height:480px;border-radius:8px;box-shadow:0 3px 18px #244d4018}figcaption{padding-top:10px;font-size:15px}</style><h1>晴游 · 产品展示版 / 无站外入口</h1><main>'+cards+'</main>'
 (ROOT/'overview.html').write_text(overview)
 page.set_viewport_size({'width':1184,'height':1140})
 page.goto((ROOT/'overview.html').as_uri(),wait_until='networkidle')
 page.screenshot(path=str(ROOT/'overview.png'),full_page=True)
 browser.close()
with zipfile.ZipFile(ROOT/'sunseek-xiaohongshu-no-links.zip','w',zipfile.ZIP_DEFLATED) as package:
 for path in sorted((ROOT/'exports').glob('*.png')):package.write(path,'图片/'+path.name)
 package.write(ROOT/'post.md','发布文案.md')
print(json.dumps({'posters':6,'dimensions':[1080,1440],'archive':'sunseek-xiaohongshu-no-links.zip'},ensure_ascii=False))
