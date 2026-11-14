"""Portable records, conservative merge, validation, storage rollback and migration UI."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from fixtures import fixture

KEYS=['sunseek-places-v3','sunseek-footprints-v1','sunseek-wishlist-v1','sunseek-preferences-v2']
def place(id,name,lat,lon,code):
    return dict(id=id,name=name,lat=lat,lon=lon,code=code,timezone='Asia/Shanghai',source='custom',geoId=None)
EXISTING=place('user-existing','原有营地',25.7,100.18,530000)
COLLISION=place('user-collision','本机山间地点',25.8,100.2,530000)
SAVED=dict(id='editorial-west-lake',name='本机西湖',lat=30.25,lon=120.15,type='nature',description='保留本机简介',cityName='杭州',source='editorial')
LOCAL={'places':[EXISTING,COLLISION], 'footprints':[dict(placeId='user-existing',savedAt='2024-01-01',note='保留本机笔记'),dict(placeId='dali',savedAt='2023-01-01',note='大理记忆')], 'wishlist':[SAVED], 'preferences':dict(origin='',hourStart=9,hourEnd=18,maxDistance=None)}
INCOMING={'places':[place('user-same-place','原有营地',25.7,100.18,530000),place('user-collision','上海新地点',31.2,121.5,310000),place('user-new','宏村备份地点',30.00361,117.98167,340000)],'footprints':[dict(placeId='user-same-place',savedAt='2025-01-01',note='旧备份笔记'),dict(placeId='user-collision',savedAt='2025-02-01',note='上海旅记'),dict(placeId='user-new',savedAt='2025-03-01',note='</textarea><img src=x onerror=alert(1)>'),dict(placeId='beijing',savedAt='2025-04-01',note='北京游记'),dict(placeId='dali',savedAt='2025-05-01',note='备份里的大理')],'wishlist':[{**SAVED,'name':'备份西湖','description':'不覆盖本机'},dict(id=12,name='<img src=x onerror=alert(1)>',lat=30.28,lon=120.16,type='museum',description='<script>alert(1)</script>',cityName='杭州')],'preferences':dict(origin='user-collision',hourStart=10,hourEnd=17,maxDistance=500)}
def envelope(data=INCOMING):return dict(format='sunseek-backup',version=1,exportedAt='2026-11-14T08:00:00Z',data=data)
def file_payload(data):return dict(name='旅行备份.json',mimeType='application/json',buffer=json.dumps(data,ensure_ascii=False).encode())


def setup(browser,seed=True):
    context=browser.new_context(viewport={'width':1440,'height':1100},locale='zh-CN',timezone_id='Asia/Shanghai',reduced_motion='reduce',accept_downloads=True)
    context.add_init_script("window.SUNSEEK_WEATHER_SERVICE={enabled:false}");page=context.new_page();page.set_default_timeout(8000)
    errors=[];calls=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def forecast(route):calls.append(route.request.url);fixture(route)
    page.route('https://api.open-meteo.com/**',forecast)
    page.route('https://geocoding-api.open-meteo.com/**',lambda route:route.fulfill(json={'results':[{'id':1805780,'name':'临时测试地点','latitude':30.00361,'longitude':117.98167,'country_code':'CN','admin1':'安徽'}]}))
    page.goto('http://localhost:4173',wait_until='domcontentloaded')
    expect(page.locator('#data-status')).to_contain_text('实时预报')
    if seed:
        page.evaluate('''data=>{
          localStorage.setItem('sunseek-places-v3',JSON.stringify(data.places));
          localStorage.setItem('sunseek-footprints-v1',JSON.stringify(Object.fromEntries(data.footprints.map(f=>[f.placeId,{savedAt:f.savedAt,note:f.note}]))));
          localStorage.setItem('sunseek-wishlist-v1',JSON.stringify(data.wishlist));
          localStorage.setItem('sunseek-preferences-v2',JSON.stringify(data.preferences));
        }''',LOCAL)
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function("!document.querySelector('#retry-weather').disabled")
        expect(page.locator('#data-status')).to_contain_text('预报')
    return context,page,errors,calls


def storage(page):return page.evaluate('(keys)=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]))',KEYS)
def preview(page,doc):
    page.locator('#backup-file').set_input_files(file_payload(doc))
    expect(page.locator('#backup-preview')).to_be_visible()
def download(page):
    with page.expect_download() as info:page.locator('#backup-export').click()
    file=info.value
    assert file.suggested_filename.startswith('sunseek-backup-') and file.suggested_filename.endswith('.json')
    return json.loads(Path(file.path()).read_text())


with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context,page,errors,calls=setup(browser)
    result=page.evaluate('''({current,incoming})=>{
      const B=SunseekBackup,base=[{id:'dali',name:'大理',lat:25.61,lon:100.27,code:530000},{id:'beijing',name:'北京',lat:39.9,lon:116.41,code:110000}];
      let count=0;const assert=(v,m)=>{count++;if(!v)throw Error(m)};
      const local=B.validateData(current,base),file=B.parse(JSON.stringify(incoming),base);
      assert(JSON.stringify(B.parse(B.encode(local,base),base).data)===JSON.stringify(local),'round trip');
      const plan=B.merge(local,file.data,base,true,()=> 'user-remapped');
      assert(plan.stats.places===2&&plan.stats.footprints===3&&plan.stats.wishlist===1,'added counts');
      assert(plan.data.footprints.find(f=>f.placeId==='user-existing').note==='保留本机笔记','keep local notes');
      assert(plan.data.preferences.origin==='user-remapped'&&plan.data.footprints.some(f=>f.placeId==='user-remapped'),'remap both references');
      assert(plan.data.wishlist[0].name==='本机西湖','keep local wishlist');
      assert(!B.merge(plan.data,file.data,base,true).changed,'idempotent');
      const bad=[{...incoming,version:99},{...incoming,format:'other'}, {...incoming,data:{...incoming.data,places:[...incoming.data.places,...incoming.data.places]}}, {...incoming,data:{...incoming.data,footprints:[{placeId:'__proto__',note:'x',savedAt:''}]}}, {...incoming,data:{...incoming.data,preferences:{origin:'missing',hourStart:18,hourEnd:9,maxDistance:500}}}, {...incoming,data:{...incoming.data,places:[{...incoming.data.places[0],lat:90}]}}, {...incoming,data:{...incoming.data,footprints:[{placeId:'dali',note:'x'.repeat(301),savedAt:''}]}}];
      for(const value of bad){let failed=false;try{B.parse(JSON.stringify(value),base)}catch{failed=true}assert(failed,'invalid schema accepted')}
      let large=false;try{B.parse(' '.repeat(B.MAX_BYTES+1),base)}catch{large=true}assert(large,'large file');
      assert(!Object.prototype.polluted,'prototype unchanged');
      const initial={'sunseek-places-v3':JSON.stringify(local.places),'sunseek-footprints-v1':'{}','sunseek-wishlist-v1':JSON.stringify(local.wishlist),'sunseek-preferences-v2':JSON.stringify(local.preferences),'sunseek-weather-v3':'weather sentinel'};
      const map=new Map(Object.entries(initial));let writes=0,failAt=2;
      const store={getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(++writes===failAt)throw Error('quota');map.set(k,v)},removeItem:k=>map.delete(k)};
      const expected=B.storageSnapshot(store);
      let rolledBack=false;try{B.write(store,plan.data,expected)}catch(e){rolledBack=!e.recoveryNeeded}
      assert(rolledBack&&Object.entries(initial).every(([key,value])=>map.get(key)===value),'partial save rollback');
      writes=0;failAt=-1;map.set('sunseek-preferences-v2','changed elsewhere');
      let stale=false;try{B.write(store,plan.data,expected)}catch{stale=true}assert(stale&&writes===0,'stale preview writes');
      const broken={getItem:k=>expected[k]??null,setItem:()=>{throw Error('blocked')},removeItem:()=>{throw Error('blocked')}};
      let blocked=false;try{B.write(broken,plan.data,expected)}catch{blocked=true}assert(blocked,'blocked storage');
      return count;
    }''',dict(current=LOCAL,incoming=envelope()))
    print(f'PASS {result} pure format/merge/reference/validation/rollback checks',flush=True)

    # Temporary preview is excluded from a real download, alongside every weather cache.
    page.locator('#search-btn').click();page.locator('#city-search').fill('临时测试地点');page.locator('#search-online').click()
    page.locator('[data-online-place]').first.click()
    expect(page.locator('.preview-badge')).to_contain_text('尚未保存')
    page.keyboard.press('Escape')
    page.locator('#backup-btn').click()
    exported=download(page)
    assert exported['data']==LOCAL,exported['data']
    assert set(exported)=={'format','version','exportedAt','data'}
    assert 'weather' not in json.dumps(exported) and '临时测试地点' not in json.dumps(exported,ensure_ascii=False)
    original=storage(page);requests=len(calls);weather=page.evaluate("localStorage.getItem('sunseek-weather-v3')")
    preview(page,envelope())
    expect(page.locator('#backup-import-summary')).to_have_text('将新增 2 个个人地点、3 条足迹、1 项收藏。')
    expect(page.locator('#backup-file-date')).to_contain_text('2026')
    expect(page.locator('#backup-preference-summary')).to_contain_text('上海新地点 · 10:00–17:00 · 500 km 内')
    expect(page.locator('#backup-conflicts')).to_contain_text('保留本机版本')
    expect(page.locator('#backup-use-preferences')).not_to_be_checked()
    assert storage(page)==original, 'preview must not mutate storage'
    page.locator('#backup-confirm').click()
    expect(page.locator('#backup-dialog')).not_to_be_visible()
    assert len(calls)==requests and page.evaluate("localStorage.getItem('sunseek-weather-v3')")==weather
    merged={k:json.loads(v) for k,v in storage(page).items()}
    places=merged[KEYS[0]];remapped=next(row['id'] for row in places if row['name']=='上海新地点')
    assert remapped!='user-collision' and len(places)==4
    assert merged[KEYS[1]]['user-existing']['note']=='保留本机笔记'
    assert merged[KEYS[1]][remapped]['note']=='上海旅记'
    assert merged[KEYS[2]][0]['name']=='本机西湖' and len(merged[KEYS[2]])==2
    assert merged[KEYS[3]]==LOCAL['preferences']
    expect(page.locator('#saved-place-list')).to_contain_text('上海新地点')
    expect(page.locator('#attraction-wishlist img,#attraction-wishlist script')).to_have_count(0)
    page.locator('#footprints').evaluate('el=>el.open=true')
    expect(page.locator('[data-visit-note="user-new"]')).to_have_value(INCOMING['footprints'][2]['note'])
    expect(page.locator('#visited-content img')).to_have_count(0)
    page.locator('#backup-btn').click();preview(page,envelope())
    expect(page.locator('#backup-confirm')).to_be_disabled()
    expect(page.locator('#backup-import-summary')).to_have_text('将新增 0 个个人地点、0 条足迹、0 项收藏。')
    page.locator('#backup-use-preferences').check();expect(page.locator('#backup-confirm')).to_be_enabled();page.locator('#backup-confirm').click()
    expect(page.locator('#origin-city')).to_have_value(remapped)
    expect(page.locator('#hour-start')).to_have_value('10');expect(page.locator('#hour-end')).to_have_value('17')
    expect(page.locator('#max-distance')).to_have_value('500')
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('#origin-city')).to_have_value(remapped)
    page.locator('#backup-btn').click();portable=download(page)
    assert not errors,errors
    print('PASS actual download, preview-only merge, conflicts, ID remapping, escaped text, no weather calls, repeat import and preference restoration',flush=True)

    for width in [360,390,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        preview(page,portable)
        assert page.locator('#backup-dialog').evaluate('el=>el.scrollWidth<=el.clientWidth+1')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=f'/tmp/sunseek-backup-{width}.png')
    context.close()
    context,page,errors,calls=setup(browser,False)
    page.locator('#backup-btn').click();preview(page,portable);page.locator('#backup-use-preferences').check();page.locator('#backup-confirm').click()
    page.reload(wait_until='domcontentloaded')
    expect(page.locator('#origin-city')).to_have_value(remapped)
    page.locator('#backup-btn').click();restored=download(page)
    assert restored['data']==portable['data']
    print('PASS empty-browser migration and four responsive dialog widths',flush=True)
    context.close()

    context,page,errors,calls=setup(browser)
    page.locator('#backup-btn').click();before=storage(page)
    for bad in [b'not JSON',json.dumps({**envelope(), 'version':99}).encode(),b'x'*(2*1024*1024+1)]:
        page.locator('#backup-file').set_input_files(dict(name='broken.json',mimeType='application/json',buffer=bad))
        expect(page.locator('#backup-error')).to_be_visible();expect(page.locator('#backup-confirm')).to_be_disabled()
        assert storage(page)==before
    preview(page,envelope())
    page.evaluate('''()=>{const original=Storage.prototype.setItem;let failed=false;Storage.prototype.setItem=function(k,v){if(k==='sunseek-wishlist-v1'&&!failed){failed=true;throw new DOMException('full','QuotaExceededError')}return original.call(this,k,v)};window.restoreStorage=()=>{Storage.prototype.setItem=original};}''')
    page.locator('#backup-confirm').click()
    expect(page.locator('#backup-error')).to_contain_text('已还原原数据')
    assert storage(page)==before
    expect(page.locator('#saved-place-list')).not_to_contain_text('上海新地点')
    assert download(page)['data']==LOCAL
    page.evaluate('restoreStorage()')
    preview(page,envelope())
    other=context.new_page();other.goto('http://localhost:4173/assets/favicon.svg')
    other.evaluate("localStorage.setItem('sunseek-footprints-v1',JSON.stringify({dali:{savedAt:'2026-01-01',note:'另一页新增'}}))")
    page.wait_for_timeout(80)
    page.locator('#backup-confirm').click()
    expect(page.locator('#backup-error')).to_contain_text('已变化')
    assert json.loads(page.evaluate("localStorage.getItem('sunseek-footprints-v1')"))['dali']['note']=='另一页新增'
    assert len(json.loads(page.evaluate("localStorage.getItem('sunseek-places-v3')")))==2
    assert not errors,errors
    print('PASS malformed/future/oversized rejection, UI partial-save rollback, original export and cross-tab stale preview rejection',flush=True)
    context.close()

    context,page,errors,calls=setup(browser)
    page.locator('#backup-btn').click();preview(page,envelope())
    page.evaluate('''()=>{const original=Storage.prototype.setItem;let failed=false;Storage.prototype.setItem=function(k,v){if(k==='sunseek-footprints-v1'){failed=true;throw Error('blocked')}if(failed&&k==='sunseek-places-v3')throw Error('rollback blocked');return original.call(this,k,v)}}''')
    page.locator('#backup-confirm').click()
    expect(page.locator('#backup-error')).to_contain_text('部分存储未能还原')
    assert download(page)['data']==LOCAL
    page.locator('#backup-file').set_input_files(file_payload(envelope()))
    expect(page.locator('#backup-error')).to_contain_text('请先导出')
    expect(page.locator('#backup-confirm')).to_be_disabled()
    assert not errors,errors
    context.close()
    print('PASS rollback failure preserves original in-memory export and blocks further imports',flush=True)

    context,page,errors,calls=setup(browser)
    page.evaluate("localStorage.setItem('sunseek-footprints-v1',JSON.stringify({unknown_city:{note:'do not erase',savedAt:'2020-01-01'}}))")
    page.locator('#backup-btn').click()
    page.locator('#backup-file').set_input_files(file_payload(envelope()))
    expect(page.locator('#backup-error')).to_contain_text('无法完整识别')
    assert 'unknown_city' in page.evaluate("localStorage.getItem('sunseek-footprints-v1')")
    context.close()
    print('PASS unrecognized existing records are never silently overwritten',flush=True)

    context,page,errors,calls=setup(browser)
    page.locator('#backup-btn').click()
    page.evaluate('''()=>{const read=File.prototype.text;let first=true;File.prototype.text=function(){if(first){first=false;return new Promise(resolve=>window.resolveOldBackup=resolve)}return read.call(this)}}''')
    page.locator('#backup-file').set_input_files(file_payload({'bad':'old file'}))
    preview(page,envelope())
    page.evaluate("resolveOldBackup('not JSON')")
    page.wait_for_timeout(50)
    expect(page.locator('#backup-error')).not_to_be_visible()
    before=storage(page);page.keyboard.press('Escape')
    expect(page.locator('#backup-dialog')).not_to_be_visible()
    assert storage(page)==before and not errors
    print('PASS outdated file reads cannot override newer previews; closing imports nothing',flush=True)
    browser.close()
