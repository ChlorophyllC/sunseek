'use strict';

// Nearby travel places from Wikipedia. No popularity, opening-hours or safety claims.
window.SunseekAttractions = (() => {
  const API='https://zh.wikipedia.org/w/api.php',CACHE='sunseek-attractions-v1',SAVED='sunseek-wishlist-v1';
  const TTL=7*86400000,types={all:'全部兴趣',museum:'博物展馆',heritage:'人文古迹',nature:'自然户外'};
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=(value,max=400)=>typeof value==='string'?value.trim().slice(0,max):'';
  const validPoint=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
  const wikiURL=p=>`https://zh.wikipedia.org/?curid=${p.id}`;
  const mapURL=p=>`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=16/${p.lat}/${p.lon}`;
  const keyFor=(city,radius)=>`${city.lat.toFixed(5)},${city.lon.toFixed(5)}:${radius}`;
  const caches=new Map(),views=new Map();
  let host=null,current=null,selection=null,notify=null,controller=null,generation=0;
  let saved=[];
  function validItem(p){return validPoint(p)&&Number.isSafeInteger(p.id)&&p.id>0&&typeof p.name==='string'&&p.name.length>0&&p.name.length<=120&&['museum','heritage','nature'].includes(p.type);}
  function cleanItem(p){return {id:p.id,name:text(p.name,120),lat:p.lat,lon:p.lon,type:p.type,description:text(p.description),cityName:text(p.cityName,60)};}
  try{saved=JSON.parse(localStorage.getItem(SAVED)||'[]').filter(validItem).slice(0,100).map(cleanItem);}catch{}
  try{
    const entries=JSON.parse(localStorage.getItem(CACHE)||'[]');
    if(Array.isArray(entries))for(const entry of entries.slice(0,20))if(entry&&typeof entry.key==='string'&&Number.isFinite(entry.time)&&entry.time<=Date.now()&&Date.now()-entry.time<TTL&&Array.isArray(entry.items)&&entry.items.every(validItem))caches.set(entry.key,{time:entry.time,items:entry.items.slice(0,60).map(cleanItem),limited:!!entry.limited});
  }catch{}
  function category(page){
    const title=text(page.title,120),cats=(page.categories||[]).map(c=>text(c.title,200)).join(' ');
    // A listed school or transport facility isn't automatically a visitor attraction.
    if(/學校|学校|中學|中学|大學|大学|醫院|医院|鐵路車站|铁路车站|地铁车站|地鐵車站|行政区划|行政區劃/.test(cats)&&!/博物[馆館]|美[术術][馆館]|纪念[馆館]|紀念館/.test(title))return null;
    if(/博物[馆館]|美[术術][馆館]|展[览覽][馆館]|[艺藝][术術][馆館]|画廊|畫廊/.test(title+' '+cats))return 'museum';
    if(/公[园園]|植物[园園]|自然保[护護]|國家公園|国家公园|風景|风景|景[区區]|海[滩灘]|瀑布|山峰|湖泊|洞穴/.test(cats)||/公[园園]|植物[园園]|瀑布|海[滩灘]|景[区區]/.test(title))return 'nature';
    if(/文物保[护護]|[历歷]史建[筑築]|古[迹蹟]|[遗遺]址|世界[遗遺][产產]|故居|旧居|舊居|寺庙|寺廟|教堂|城堡|紀念|纪念/.test(cats)||/故居|旧居|舊居|[遗遺]址|寺|庙|廟|教堂|古城|古镇|古鎮|纪念|紀念/.test(title))return 'heritage';
    return null;
  }
  function normalize(nearby,pages,city,radius){
    const byID=new Map(pages.filter(p=>Number.isSafeInteger(p.pageid)).map(p=>[p.pageid,p]));
    const result=[],seen=new Set();
    for(const place of nearby){
      const page=byID.get(place.pageid),type=page&&category(page),name=text(page?.title,120);
      if(!type||!name||!validPoint(place)||!Number.isSafeInteger(place.pageid)||place.pageid<=0)continue;
      if(window.SunseekWeather.distanceKm(city,place)>radius)continue;
      const duplicate=seen.has(place.pageid)||result.some(p=>p.name===name&&window.SunseekWeather.distanceKm(p,place)<.1);
      if(duplicate)continue;
      seen.add(place.pageid);result.push({id:place.pageid,name,lat:place.lat,lon:place.lon,type,description:text(page.extract),cityName:city.name});
    }
    return result.sort((a,b)=>window.SunseekWeather.distanceKm(city,a)-window.SunseekWeather.distanceKm(city,b));
  }
  async function query(params,signal){
    const url=new URL(API);url.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',origin:'*',maxlag:'5',...params});
    const response=await fetch(url,{signal});
    if(!response.ok)throw new Error('unavailable');
    const data=await response.json();if(data.error||!data.query)throw new Error('unavailable');return data;
  }
  function entryFor(view){if(!view?.city)return null;const entry=caches.get(keyFor(view.city,view.radius));return entry&&entry.time<=Date.now()&&Date.now()-entry.time<TTL?entry:null;}
  function cacheWrite(){
    const entries=[...caches].filter(([,e])=>Date.now()-e.time<TTL).sort((a,b)=>b[1].time-a[1].time).slice(0,20);
    caches.clear();entries.forEach(([key,value])=>caches.set(key,value));
    try{localStorage.setItem(CACHE,JSON.stringify(entries.map(([key,value])=>({key,...value}))));}catch{/* Results stay usable in memory. */}
  }
  function close(){generation++;controller?.abort();controller=null;if(current?.status==='loading')current.status='idle';host=null;current=null;}
  async function load(force=false){
    const view=current;if(!view||view.status==='loading')return;
    if(!force&&entryFor(view)){view.status='ready';render();return;}
    controller?.abort();const request=new AbortController();controller=request;const token=++generation;
    view.status='loading';render();const timer=setTimeout(()=>request.abort(),25000);
    try{
      const location=await query({list:'geosearch',gscoord:`${view.city.lat}|${view.city.lon}`,gsradius:String(view.radius*1000),gslimit:'60',gsnamespace:'0'},request.signal);
      if(!Array.isArray(location.query.geosearch))throw new Error('invalid');
      const nearby=location.query.geosearch.filter(p=>validPoint(p)&&Number.isSafeInteger(p.pageid)&&p.pageid>0).slice(0,60),pages=[];
      // Small batches keep extracts complete and avoid expensive continuation chains.
      for(let i=0;i<nearby.length;i+=20){
        const detail=await query({pageids:nearby.slice(i,i+20).map(p=>p.pageid).join('|'),prop:'extracts|categories',exintro:'1',explaintext:'1',exsentences:'2',exlimit:'20',cllimit:'500',clshow:'!hidden'},request.signal);
        if(!Array.isArray(detail.query.pages)||detail.continue)throw new Error('incomplete');
        pages.push(...detail.query.pages);
      }
      if(token!==generation)return;
      caches.set(keyFor(view.city,view.radius),{time:Date.now(),items:normalize(nearby,pages,view.city,view.radius),limited:nearby.length===60});
      cacheWrite();view.status='ready';
    }catch{if(token===generation)view.status='error';}
    finally{clearTimeout(timer);if(token===generation){controller=null;render();}}
  }
  function hint(weather,type){
    if(weather.demo)return '当前是天气演示；景点来自真实资料，请切回实时预报后安排出行。';
    if(weather.hazardous)return '所选日期有恶劣天气信号，先核实当地预警和开放情况；室内场馆也不代表路途安全。';
    if(!weather.complete)return '当前天气预报不完整，先收藏想去的地方，临近出发再查。';
    if(type==='museum')return '博物展馆可作为室内行程候选；部分场馆含露天区域，请另外确认开放时间与预约。';
    if(weather.preference==='rain')return '喜欢听雨也要核实户外环境；临水、山地与古建筑的通行条件请单独确认。';
    if(weather.preference==='snow')return '这里列出的是地点资料，降雪预报不代表景点有积雪、雪场开放或道路可通行。';
    return weather.goodHours>0?'可以参考上方合拍时段安排户外活动；景点可能与城市中心天气不同，可单独查该点天气。':'当前时段不太符合你的天气偏好，可以先加入想去清单。';
  }
  function card(item,city,savedPanel=false){
    const chosen=saved.some(p=>p.id===item.id),distance=city?`${window.SunseekWeather.distanceKm(city,item).toFixed(1)} km · 直线`:escape(item.cityName);
    return `<article class="attraction-card" data-attraction="${item.id}"><div class="attraction-meta"><span>${types[item.type]}</span><small>${distance}</small></div><h4>${escape(item.name)}</h4>${item.description?`<p class="attraction-description">${escape(item.description)}</p>`:'<p class="attraction-description">暂无简介，可查看来源资料了解更多。</p>'}<div class="attraction-links"><a href="${wikiURL(item)}" target="_blank" rel="noopener noreferrer">百科资料 ↗</a><a href="${mapURL(item)}" target="_blank" rel="noopener noreferrer">地图位置 ↗</a></div><div class="attraction-actions"><button data-attraction-weather="${item.id}">查这里的天气</button><button data-attraction-save="${item.id}" aria-pressed="${chosen}">${chosen?savedPanel?'移出清单':'已加入想去':'＋ 想去'}</button></div></article>`;
  }
  function render(){
    if(!host?.isConnected||!current)return;
    const active=host.contains(document.activeElement)?document.activeElement:null;
    const focusID=active?.id;
    const focusSave=active?.dataset.attractionSave;
    const view=current,entry=entryFor(view),all=entry?.items||[],items=all.filter(p=>view.type==='all'||p.type===view.type);
    let message=view.status==='loading'?'正在查找附近景点与人文资料…':view.status==='error'?entry?'本次查询未成功，继续显示此前缓存的资料。':'资料服务暂时不可用，请稍后重试。天气功能仍可使用。':entry?`${all.length} 处已收录地点${entry.limited?' · 仅检索最近 60 个百科地理条目':''}`:'按目的地坐标查找附近的博物馆、古迹与自然景观。';
    if(entry)message+=` · ${new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(entry.time)} 获取`;
    host.innerHTML=`<section class="attractions-section"><div class="attractions-heading"><div><span class="eyebrow">到这里，还可以去哪儿</span><h3>附近景点与人文</h3></div><button class="text-button" data-attractions-load ${view.status==='loading'?'disabled':''}>${entry?'更新资料':view.status==='error'?'重试查询':'查找附近'}</button></div><div class="attraction-filters"><label>范围<select aria-label="景点搜索范围" id="attraction-radius">${[2,5,10].map(r=>`<option value="${r}" ${view.radius===r?'selected':''}>${r} km 内</option>`).join('')}</select></label><label>兴趣<select aria-label="景点兴趣" id="attraction-type">${Object.entries(types).map(([value,label])=>`<option value="${value}" ${view.type===value?'selected':''}>${label}</option>`).join('')}</select></label></div><p class="attraction-weather-note">${escape(hint(view.weather,view.type))}</p><p class="attraction-status" role="status">${escape(message)}</p>${entry&&!items.length?`<p class="attraction-empty">${all.length?'当前兴趣下没有匹配条目，试试其他兴趣。':'当前范围没有找到符合类别的已收录条目。可扩大范围；这不代表当地没有景点。'}</p>`:''}<div class="attraction-grid">${items.slice(0,view.limit).map(p=>card(p,view.city)).join('')}</div>${items.length>view.limit?'<button class="text-button attraction-more" data-attractions-more>再看更多地点</button>':''}<p class="attraction-source">按直线距离排列，不代表热度或推荐人数。资料来自 <a href="https://zh.wikipedia.org/" target="_blank" rel="noopener noreferrer">维基百科</a>，摘要按 <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> 使用。类别来自条目标签，开放时间、门票、近期活动需另行核实。</p></section>`;
    if(['attraction-radius','attraction-type'].includes(focusID))host.querySelector('#'+focusID)?.focus({preventScroll:true});
    else if(focusSave&&/^\d+$/.test(focusSave))host.querySelector(`[data-attraction-save="${focusSave}"]`)?.focus({preventScroll:true});
  }
  function renderSaved(){
    const panel=document.querySelector('#attraction-wishlist');if(!panel)return;
    panel.hidden=!saved.length;document.querySelector('#attraction-wishlist-count').textContent=saved.length;
    document.querySelector('#attraction-wishlist-cards').innerHTML=saved.map(p=>card(p,null,true)).join('');
  }
  function toggleSave(id){
    const item=saved.find(p=>p.id===id)||entryFor(current||{})?.items.find(p=>p.id===id);if(!item)return;
    if(saved.some(p=>p.id===id))saved=saved.filter(p=>p.id!==id);
    else{if(saved.length>=100){notify?.('最多收藏 100 个景点，请先移除一些。');return;}saved.push(cleanItem(item));}
    try{localStorage.setItem(SAVED,JSON.stringify(saved));}catch{notify?.('浏览器无法保存清单，本次修改仅保留到页面关闭。');}
    render();renderSaved();
  }
  function init(onSelection,onNotify){
    selection=onSelection;notify=onNotify;renderSaved();
    document.addEventListener('click',event=>{
      const save=event.target.closest('[data-attraction-save]');if(save){toggleSave(Number(save.dataset.attractionSave));return;}
      const select=event.target.closest('[data-attraction-weather]');if(select){const id=Number(select.dataset.attractionWeather),item=saved.find(p=>p.id===id)||(current&&entryFor(current)?.items.find(p=>p.id===id));if(item)selection?.(item);return;}
      if(event.target.closest('[data-attractions-load]'))load(true);
      if(event.target.closest('[data-explore-attractions]')){host?.scrollIntoView({behavior:'smooth',block:'start'});load();}
      if(event.target.closest('[data-attractions-more]')&&current){current.limit+=6;render();}
    });
    document.addEventListener('change',event=>{
      if(!current)return;
      if(event.target.id==='attraction-type'){current.type=event.target.value;current.limit=6;render();}
      if(event.target.id==='attraction-radius'){
        generation++;controller?.abort();controller=null;current.radius=Number(event.target.value);current.status='idle';current.limit=6;render();load();
      }
    });
  }
  function mount(element,city,weather){
    if(current&&keyFor(current.city,10)!==keyFor(city,10))close();
    const key=keyFor(city,10);let view=views.get(key);
    if(!view){view={city,weather,radius:5,type:'all',status:'idle',limit:6};views.set(key,view);}
    view.city=city;view.weather=weather;current=view;host=element;render();
  }
  return Object.freeze({init,mount,close,normalize,category});
})();
