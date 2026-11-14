'use strict';

// Small editorial city highlights. API/source selection is documented in docs/travel-data.md.
window.SunseekAttractions = (() => {
  const SAVED='sunseek-wishlist-v1';
  const types={museum:'博物展馆',heritage:'人文古迹',nature:'自然户外'};
  const catalog=window.TRAVEL_HIGHLIGHTS||[];
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=(value,max=400)=>typeof value==='string'?value.trim().slice(0,max):'';
  const validID=id=>typeof id==='string'&&/^editorial-[a-z0-9-]+$/.test(id)||Number.isSafeInteger(id)&&id>0;
  const validItem=p=>p&&validID(p.id)&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=120&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180&&Object.hasOwn(types,p.type);
  function clean(p){return {id:p.id,name:text(p.name,120),lat:p.lat,lon:p.lon,type:p.type,description:text(p.description),cityName:text(p.cityName,60),source:typeof p.id==='number'?'wikipedia':'editorial'};}
  let host=null,current=null,selection=null,notify=null,saved=[];
  try{const value=JSON.parse(localStorage.getItem(SAVED)||'[]');if(Array.isArray(value)){const ids=new Set();saved=value.filter(p=>validItem(p)&&!ids.has(String(p.id))&&ids.add(String(p.id))).slice(0,100).map(clean);}}catch{}
  const itemsFor=city=>catalog.filter(p=>p.cityID===city.id||(p.code===city.code&&p.cityName===city.name.replace(/市$/,''))).slice(0,3);
  const find=id=>saved.find(p=>String(p.id)===id)||catalog.find(p=>String(p.id)===id);
  function mapURL(item){const params=new URLSearchParams({keyword:item.name,city:item.cityName,view:'map',src:'SUNSEEK'});return `https://uri.amap.com/search?${params}`;}
  function hint(weather){
    if(weather.demo)return '当前天气为演示数据，请切回真实预报后再安排行程。';
    if(weather.hazardous)return '所选日期有恶劣天气信号，先核实当地预警与开放情况。';
    if(!weather.complete)return '预报尚不完整，可以先收藏灵感，临近出发再确认。';
    return '先参考上方天气安排出行；山地、海岛等地点可单独查看采样点预报。';
  }
  function card(item,savedPanel=false){
    const chosen=saved.some(p=>String(p.id)===String(item.id)),legacy=typeof item.id==='number';
    return `<article class="attraction-card" data-attraction="${item.id}"><div class="attraction-meta"><span>${types[item.type]}</span><small>${escape(item.cityName)}</small></div><h4>${escape(item.name)}</h4><p class="attraction-description">${escape(item.description)||'已收藏的旅行地点。'}</p><div class="attraction-links">${legacy?`<a href="https://zh.wikipedia.org/?curid=${item.id}" target="_blank" rel="noopener noreferrer">原收藏资料 ↗</a>`:''}<a href="${escape(mapURL(item))}" target="_blank" rel="noopener noreferrer">在高德查看 ↗</a></div><div class="attraction-actions"><button data-attraction-weather="${item.id}">先看天气</button><button data-attraction-save="${item.id}" aria-pressed="${chosen}">${chosen?savedPanel?'移出清单':'已加入想去':'＋ 想去'}</button></div>${legacy?'<small class="attraction-source">原收藏摘要：维基百科 · CC BY-SA 4.0</small>':''}</article>`;
  }
  function render(){
    if(!host?.isConnected||!current)return;
    const open=host.querySelector('details')?.open||false;
    const focused=document.activeElement?.dataset.attractionSave;
    const items=itemsFor(current.city);
    host.innerHTML=`<details class="attractions-section travel-inspiration" ${open?'open':''}><summary><span>旅行灵感<small>天气合适后，再选想去的地方</small></span><span class="inspiration-toggle">展开</span></summary><p class="attraction-weather-note">${escape(hint(current.weather))}</p>${items.length?`<div class="attraction-grid">${items.map(p=>card(p)).join('')}</div><p class="attraction-source">编辑精选 · 城市级旅行灵感。名称与简介为人工整理，顺序不表示实时热度。坐标是近似天气采样点；开放与预约请另行核实。</p>`:'<p class="attraction-empty">这里的旅行灵感还在整理，先参考上方天气决定是否出发。</p>'}</details>`;
    if(focused&&validID(/^\d+$/.test(focused)?Number(focused):focused))host.querySelector(`[data-attraction-save="${focused}"]`)?.focus({preventScroll:true});
  }
  function renderSaved(){
    const panel=document.querySelector('#attraction-wishlist');if(!panel)return;
    panel.hidden=!saved.length;document.querySelector('#attraction-wishlist-count').textContent=saved.length;
    document.querySelector('#attraction-wishlist-cards').innerHTML=saved.map(p=>card(p,true)).join('');
  }
  function toggle(id){
    const item=find(id);if(!item)return;
    if(saved.some(p=>String(p.id)===id))saved=saved.filter(p=>String(p.id)!==id);
    else{if(saved.length>=100){notify?.('最多收藏 100 个景点，请先移除一些。');return;}saved.push(clean(item));}
    try{localStorage.setItem(SAVED,JSON.stringify(saved));}catch{notify?.('浏览器无法保存清单，本次修改仅保留到页面关闭。');}
    render();renderSaved();
  }
  function init(onSelection,onNotify){
    selection=onSelection;notify=onNotify;renderSaved();
    document.addEventListener('click',event=>{
      const save=event.target.closest('[data-attraction-save]');if(save){toggle(save.dataset.attractionSave);return;}
      const choose=event.target.closest('[data-attraction-weather]');if(choose){const item=find(choose.dataset.attractionWeather);if(item)selection?.(item);return;}
      if(event.target.closest('[data-explore-attractions]')){const detail=host?.querySelector('details');if(detail){detail.open=true;detail.scrollIntoView({behavior:'smooth',block:'start'});}}
    });
  }
  function mount(element,city,weather){host=element;current={city,weather};render();}
  function close(){host=null;current=null;}
  return Object.freeze({init,mount,close});
})();
