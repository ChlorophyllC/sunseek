'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const svgNS = 'http://www.w3.org/2000/svg';
  const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const round = n => Number.isFinite(n) ? Math.round(n) : '—';
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const parseDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(NaN);
  const addDays = (value, amount) => { const d = parseDate(value); d.setDate(d.getDate()+amount); return localDate(d); };
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const lastForecastDate = addDays(today, 15);
  const formatDate = value => `${Number(value.slice(5,7))}月${Number(value.slice(8,10))}日`;
  const shortDate = value => `${Number(value.slice(5,7))}.${Number(value.slice(8,10))}`;
  const dateRange = (start, end) => {
    const dates=[];
    for(let d=start; d<=end && dates.length<17; d=addDays(d,1)) dates.push(d);
    return dates;
  };

  // City coordinates are forecast sample points, not province-wide observations.
  const cityRows = [
    ['dali','大理','云南',530000,'西南',25.61,100.27,21,'mountains','在苍山和洱海之间，留一点时间给风和云。','mountains',true],
    ['lijiang','丽江','云南',530000,'西南',26.87,100.23,18,'mountains','走过古城的小巷，抬头看看远方的雪山。','mountains',false],
    ['sanya','三亚','海南',460000,'华南',18.25,109.51,28,'coast','去海边发一会儿呆，把日子交给浪花。','coast',true],
    ['kunming','昆明','云南',530000,'西南',25.04,102.72,20,'forest','慢慢走在湖畔，感受春城的日常。','forest',true],
    ['xiamen','厦门','福建',350000,'华东',24.48,118.09,24,'coast','在海风和街巷之间，找一家喜欢的小店。','coast',true],
    ['chengdu','成都','四川',510000,'西南',30.57,104.07,18,'forest','喝杯盖碗茶，让这一站的节奏慢下来。','forest',true],
    ['hangzhou','杭州','浙江',330000,'华东',30.27,120.16,18,'landscape','沿着湖边走走，在山水里寻一份闲适。','landscape',true],
    ['beijing','北京','北京',110000,'华北',39.90,116.41,12,'forest','从胡同走到公园，发现古都的季节表情。','forest',true],
    ['shanghai','上海','上海',310000,'华东',31.23,121.47,19,'coast','沿着街角散步，看看城市另一面的风景。','coast',true],
    ['guangzhou','广州','广东',440000,'华南',23.13,113.26,26,'forest','从一顿早茶开始，在树影下漫游。','forest',true],
    ['shenzhen','深圳','广东',440000,'华南',22.54,114.06,26,'coast','从公园到海边，把一天留给户外。','coast',false],
    ['zhuhai','珠海','广东',440000,'华南',22.27,113.58,25,'coast','沿着海岸散步，等一场温柔的日落。','coast',false],
    ['haikou','海口','海南',460000,'华南',20.04,110.32,26,'coast','逛逛骑楼老街，吹一吹南方的海风。','coast',false],
    ['guilin','桂林','广西',450000,'华南',25.27,110.29,22,'landscape','让山水慢慢展开，把忙碌留在远方。','landscape',true],
    ['nanning','南宁','广西',450000,'华南',22.82,108.32,25,'forest','穿行绿意里的街道，发现南方的烟火气。','forest',false],
    ['chongqing','重庆','重庆',500000,'西南',29.56,106.55,19,'mountains','顺着坡道走进山城，等两江灯火亮起。','mountains',true],
    ['guiyang','贵阳','贵州',520000,'西南',26.65,106.63,17,'forest','走进青山与城市交错的风景。','forest',false],
    ['lhasa','拉萨','西藏',540000,'西南',29.65,91.17,13,'mountains','在高原的天空下慢下来，注意海拔适应。','mountains',true],
    ['nanjing','南京','江苏',320000,'华东',32.06,118.80,17,'forest','沿梧桐树下的街道，寻一座城的记忆。','forest',false],
    ['suzhou','苏州','江苏',320000,'华东',31.30,120.59,18,'landscape','在园林和小桥流水之间，慢慢走。','landscape',false],
    ['fuzhou','福州','福建',350000,'华东',26.07,119.30,23,'forest','在榕树荫下，发现巷子里的生活。','forest',false],
    ['qingdao','青岛','山东',370000,'华东',36.07,120.38,14,'coast','沿着海边漫步，听风穿过老街。','coast',true],
    ['jinan','济南','山东',370000,'华东',36.65,117.12,14,'landscape','循着泉水，在老城里寻找一份悠闲。','landscape',false],
    ['hefei','合肥','安徽',340000,'华东',31.82,117.23,18,'forest','到湖畔走走，遇见一座城市的慢时光。','forest',false],
    ['huangshan','黄山','安徽',340000,'华东',29.71,118.34,18,'mountains','从山脚的村落开始，看云雾里的远山。','mountains',false],
    ['nanchang','南昌','江西',360000,'华东',28.68,115.86,20,'landscape','走在江边，等落日把天空染成暖色。','landscape',false],
    ['wuhan','武汉','湖北',420000,'华中',30.59,114.31,18,'landscape','去江边吹风，在街头巷尾找一份热闹。','landscape',true],
    ['changsha','长沙','湖南',430000,'华中',28.23,112.94,19,'forest','在湘江两岸走走，邂逅城市的烟火。','forest',false],
    ['zhangjiajie','张家界','湖南',430000,'华中',29.12,110.48,18,'mountains','到山林间散步，看峰峦在云里若隐若现。','mountains',false],
    ['zhengzhou','郑州','河南',410000,'华中',34.75,113.63,15,'forest','给中原一段时间，去发现历史和日常。','forest',false],
    ['xian','西安','陕西',610000,'西北',34.34,108.94,15,'mountains','沿古城慢慢走，在历史里遇见今天。','mountains',true],
    ['lanzhou','兰州','甘肃',620000,'西北',36.06,103.83,11,'mountains','走到黄河边，让山与河成为这一站的背景。','mountains',false],
    ['xining','西宁','青海',630000,'西北',36.62,101.78,8,'mountains','在高原的风里，给旅途一个舒缓的开始。','mountains',true],
    ['yinchuan','银川','宁夏',640000,'西北',38.49,106.23,10,'mountains','在塞上的开阔天地里，收藏一片天空。','mountains',false],
    ['urumqi','乌鲁木齐','新疆',650000,'西北',43.83,87.62,5,'mountains','向远方的群山出发，留意山路与气候变化。','mountains',true],
    ['altay','阿勒泰','新疆',650000,'西北',47.85,88.14,-2,'mountains','走进北疆的山林，等待季节写下新的风景。','mountains',true],
    ['hohhot','呼和浩特','内蒙古',150000,'华北',40.84,111.75,7,'mountains','在北方开阔的天地间，感受风的方向。','mountains',true],
    ['taiyuan','太原','山西',140000,'华北',37.87,112.55,11,'mountains','走进街巷和古建，慢慢认识这座城。','mountains',false],
    ['shijiazhuang','石家庄','河北',130000,'华北',38.04,114.51,13,'mountains','去太行山脚看看，让风景成为旅程的一部分。','mountains',false],
    ['tianjin','天津','天津',120000,'华北',39.08,117.20,12,'coast','顺着海河走走，发现街角的故事。','coast',false],
    ['harbin','哈尔滨','黑龙江',230000,'东北',45.80,126.53,0,'mountains','在北方的街头，感受季节的分明。','mountains',true],
    ['changchun','长春','吉林',220000,'东北',43.82,125.32,3,'forest','给公园和街道一点时间，发现北国的日常。','forest',false],
    ['changbaishan','长白山','吉林',220000,'东北',42.10,128.13,-3,'mountains','山林与白雪都值得期待，山顶天气请另行核实。','mountains',false],
    ['shenyang','沈阳','辽宁',210000,'东北',41.81,123.43,7,'forest','在历史街巷里漫步，体会北方的热情。','forest',true],
    ['dalian','大连','辽宁',210000,'东北',38.91,121.61,12,'coast','沿着蜿蜒海岸，找到一处看海的角落。','coast',false],
    ['hongkong','香港','香港',810000,'华南',22.32,114.17,26,'coast','从街市走到海边，看看繁忙城市的另一面。','coast',false],
    ['macao','澳门','澳门',820000,'华南',22.20,113.54,26,'coast','漫步在小街里，把旅程放慢一些。','coast',false],
    ['taipei','台北','台湾',710000,'华东',25.03,121.57,24,'forest','在山边、街角与小店之间，寻找日常的温柔。','forest',true]
  ];
  const cities = cityRows.map(([id,name,province,code,region,lat,lon,temp,type,description,image,marker],index)=>({id,name,province,code,region,lat,lon,temp,type,description,image,marker,index}));
  const cityByID = new Map(cities.map(c=>[c.id,c]));
  const preferences = {
    sun:{name:'追着阳光',icon:'sun',dayLabel:'晴好',mapLabel:'晴天分布',legend:'晴好天数占比',tag:'适合晒太阳',color:'#d3ac4c'},
    snow:{name:'赴一场雪',icon:'snow',dayLabel:'降雪',mapLabel:'降雪分布',legend:'降雪天数占比',tag:'等待一场雪',color:'#7d9fbc'},
    rain:{name:'听听下雨',icon:'rain',dayLabel:'细雨',mapLabel:'细雨分布',legend:'细雨天数占比',tag:'适合听听雨',color:'#829db2'},
    cool:{name:'寻一处清凉',icon:'leaf',dayLabel:'舒适',mapLabel:'舒适天气分布',legend:'舒适天数占比',tag:'温度刚刚好',color:'#80a078'}
  };
  const state = {start:addDays(today,1),end:addDays(today,3),preference:'sun',region:'all',sort:'score',hideVisited:true,strict:false,min:null,max:null,mode:'loading',data:new Map(),ranked:[],allRanked:[],visited:{},loading:false,lastUpdated:null,zoom:1,panX:0,panY:0,activeCity:null,toastTimer:null};
  let storageAvailable=true;
  try {
    const saved=JSON.parse(localStorage.getItem('sunseek-footprints-v1') || '{}');
    if(saved && typeof saved==='object' && !Array.isArray(saved)) {
      for(const [id, entry] of Object.entries(saved)) if(cityByID.has(id) && entry && typeof entry==='object') state.visited[id]={savedAt:typeof entry.savedAt==='string'?entry.savedAt:today,note:typeof entry.note==='string'?entry.note.slice(0,300):''};
    }
  } catch { storageAvailable=false; }

  function seeded(number) {const x=Math.sin(number*127.1+311.7)*43758.5453;return x-Math.floor(x);}
  function demoData() {
    // These deterministic examples are deliberately labelled as examples everywhere.
    const seasonal=Math.sin((parseDate(today).getMonth()-1)/12*Math.PI*2)*9;
    const data=new Map();
    cities.forEach(city=>{
      const days=dateRange(today,lastForecastDate).map((date,j)=>{
        const r=seeded(city.index*19+j*7+23);
        let max=round(city.temp+seasonal+(r-.5)*5);
        let code=[0,1,2,3,61,63][Math.floor(r*6)];
        if(city.index<3) code=j%5===4?2:0;
        if(['chengdu','guiyang','hangzhou','zhangjiajie'].includes(city.id)) code=j%4===0?3:61;
        if(city.lat>42 && max<6) code=j%4===0?3:(j%3===0?73:71);
        if(city.id==='changbaishan' && max<8)code=71;
        if(city.id==='zhengzhou' && j===2)code=95;
        const snowy=[71,73].includes(code), rainy=[61,63,95].includes(code);
        return {date,code,max,min:max-(city.type==='coast'?5:10),rainProbability:rainy?75:code<3?8:30,precip:rainy?code===95?32:3+r*6:snowy?2:0,snow:snowy?1.5+r*3:0,wind:Math.round(6+r*12)};
      });
      data.set(city.id,days);
    });
    return data;
  }

  const weatherInfo=code=>{
    if(code===0)return {name:'晴',icon:'sun'};
    if(code===1||code===2)return {name:code===1?'晴间多云':'多云',icon:'partly'};
    if(code===3)return {name:'阴',icon:'cloud'};
    if(code===45||code===48)return {name:'雾',icon:'cloud'};
    if([71,73,75,77,85,86].includes(code))return {name:code===75||code===86?'强降雪':code===73?'中雪':'小雪',icon:'snow'};
    if(code>=95)return {name:'雷暴',icon:'rain'};
    if([65,67,82].includes(code))return {name:'强降雨',icon:'rain'};
    if([56,57,66].includes(code))return {name:'冻雨',icon:'rain'};
    if(code>=51)return {name:code===63||code===81?'中雨':'小雨',icon:'rain'};
    return {name:'未知',icon:'cloud'};
  };
  function isHazard(day) {return [48,56,57,65,66,67,75,82,86,95,96,99].includes(day.code)||day.wind>=50||day.precip>=50||day.snow>=15;}
  function matches(day) {
    if(isHazard(day))return false;
    if(state.preference==='sun')return [0,1,2].includes(day.code)&&day.precip<1;
    if(state.preference==='snow')return [71,73,77,85].includes(day.code)&&day.snow>0;
    if(state.preference==='rain')return [51,53,55,61,63,80,81].includes(day.code)&&day.precip>0&&day.precip<20;
    return day.max>=15&&day.max<=25&&day.precip<5&&day.wind<30;
  }
  function assess(city) {
    const all=state.data.get(city.id)||[];
    const days=all.filter(d=>d.date>=state.start&&d.date<=state.end);
    const expected=dateRange(state.start,state.end).length;
    const complete=days.length===expected;
    const hazardous=days.some(isHazard);
    const matchCount=days.filter(matches).length;
    const mean=days.length?days.reduce((a,d)=>a+d.max,0)/days.length:0;
    const max=days.length?Math.max(...days.map(d=>d.max)):null;
    const min=days.length?Math.min(...days.map(d=>d.min)):null;
    const wind=days.length?days.reduce((a,d)=>a+d.wind,0)/days.length:0;
    const ideal=state.preference==='snow'?-3:state.preference==='cool'?20:22;
    const comfort=clamp(1-Math.abs(mean-ideal)/24,0,1);
    const score=complete?Math.round((matchCount/expected*.7+comfort*.2+clamp(1-wind/50,0,1)*.1)*100):0;
    const tempOK=days.every(d=>(state.min===null||d.max>=state.min)&&(state.max===null||d.max<=state.max));
    return {...city,days,expected,complete,hazardous,matchCount,mean,max,min,score,eligible:complete&&!hazardous&&tempOK&&matchCount>0&&(!state.strict||matchCount===expected)};
  }
  function sortCities(a,b) {
    if(state.sort==='days')return b.matchCount-a.matchCount||b.score-a.score||a.index-b.index;
    if(state.sort==='temp')return a.mean-b.mean||b.score-a.score||a.index-b.index;
    return b.score-a.score||b.matchCount-a.matchCount||a.index-b.index;
  }
  function recompute() {
    state.allRanked=cities.map(assess);
    state.ranked=state.allRanked.filter(c=>c.eligible&&(state.region==='all'||c.region===state.region)&&(!state.hideVisited||!state.visited[c.id])).sort(sortCities);
  }
  function getFilters() {
    const start=$('#start-date').value,end=$('#end-date').value;
    const min=$('#min-temp').value.trim(),max=$('#max-temp').value.trim();
    let error='';
    if(!start||!end||!Number.isFinite(+parseDate(start))||!Number.isFinite(+parseDate(end)))error='请选择完整的出发和返程日期。';
    else if(start<today)error='请选择今天或之后的日期，过去的天气不属于未来出行预报。';
    else if(end<start)error='返程日期不能早于出发日期。';
    else if(start>lastForecastDate||end>lastForecastDate)error=`目前只能查询 ${formatDate(today)}—${formatDate(lastForecastDate)} 的未来 16 天天气。更远的行程，请临近出发时再来看。`;
    else if((min!==''&&(!Number.isFinite(+min)||+min< -40||+min>50))||(max!==''&&(!Number.isFinite(+max)||+max< -40||+max>50)))error='请输入 −40°C 到 50°C 之间的温度，或留空表示不限。';
    else if(min!==''&&max!==''&&+min>+max)error='最低可接受温度不能高于最高温度。';
    $('#filter-error').hidden=!error;
    $('#filter-error').textContent=error;
    if(error)return false;
    Object.assign(state,{start,end,min:min===''?null:+min,max:max===''?null:+max,strict:$('#strict-match').checked,hideVisited:$('#hide-visited').checked,region:$('#region-filter').value,sort:$('#sort-order').value});
    return true;
  }
  function applyFilters(announce=false) {
    if(!getFilters()){if(announce)$('#filter-error').scrollIntoView({block:'nearest',behavior:'smooth'});return false;}
    render();
    if(announce)toast(`已找到 ${state.ranked.length} 个符合偏好的目的地${state.mode==='live'?'':' · 当前为示例数据'}`);
    return true;
  }
  function render() {
    recompute();
    const days=dateRange(state.start,state.end).length;
    $('#trip-length').textContent=`共 ${days} 天`;
    $('#map-date-label').textContent=`${shortDate(state.start)} – ${shortDate(state.end)}`;
    $('#map-mode-label').textContent=preferences[state.preference].mapLabel;
    const available=state.allRanked.filter(c=>c.complete&&(state.region==='all'||c.region===state.region)).length;
    const label=state.mode==='live'?'已查询':'示例覆盖';
    $('#results-summary').innerHTML=`${label} <strong>${available}</strong> 个目的地，找到 <strong>${state.ranked.length}</strong> 个适合${state.preference==='sun'?'追逐阳光':state.preference==='snow'?'遇见白雪':state.preference==='rain'?'听雨漫游':'清凉出行'}的地方`;
    $('#recommend-count').textContent=`${shortDate(state.start)} – ${shortDate(state.end)} · ${days} 天旅行灵感`;
    $('#map-subtitle').textContent=state.mode==='live'?`所选日期内的${preferences[state.preference].dayLabel}天气概览 · 省份着色仅代表采样城市`:'用一张地图，发现下一次心动 · 当前为示例天气';
    $('#map-legend').innerHTML=`<span>${preferences[state.preference].legend}</span><span>少</span><div class="legend-gradient" style="background:linear-gradient(90deg,${provinceColor(0)},${provinceColor(.5)},${provinceColor(1)})"></div><span>多</span>`;
    renderRecommendations();renderMap();renderVisited();renderDataStatus();
  }
  function renderDataStatus() {
    const live=state.mode==='live';
    const time=state.lastUpdated?new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(state.lastUpdated)):'';
    $('#data-status').innerHTML=`<span class="status-dot ${live?'':'amber'} ${state.loading?'loading-pulse':''}"></span>${state.loading?(live?'正在更新 · 保留上次预报':'示例预览 · 连接实时数据中'):live?`实时预报 · ${time} 更新`:'示例数据 · 实时连接不可用'}`;
    $('#about-data-status').textContent=state.loading?(live?'正在更新实时预报，当前保留上次获取的数据。':'当前正在尝试获取实时预报，地图暂时显示示例。'):live?`当前显示 ${state.data.size} 个城市的实时预报，获取时间：${new Date(state.lastUpdated).toLocaleString('zh-CN')}。`:'当前为示例体验模式。地图、温度、天气、匹配度都是示例，不可用于真实行程决策。可以点击下方按钮重新连接。';
    const retry=$('#retry-weather');
    if(retry){retry.disabled=state.loading;retry.textContent=state.loading?'正在连接…':'重新连接实时天气';}
  }
  function cardHTML(city,index) {
    const pref=preferences[state.preference],visited=!!state.visited[city.id];
    return `<article class="destination-card" data-city="${city.id}" tabindex="0" role="button" aria-label="查看${city.name}天气详情"><div class="destination-image"><img src="assets/${city.image}.jpg" alt="${city.type==='coast'?'海岸':city.type==='forest'?'森林':'山水'}意境图，非城市实景" loading="lazy"><div class="image-overlay"></div><span class="destination-rank">${String(index+1).padStart(2,'0')}</span></div><div class="destination-content"><div class="destination-top"><div><h3 class="destination-name">${city.name}</h3><p class="destination-province">${city.province} · ${city.region}</p></div><div class="match-score">${city.score}<small>%</small><span class="match-caption">天气匹配度</span></div></div><div class="destination-weather">${icon(pref.icon)}<span class="weather-temp">${round(city.min)}–${round(city.max)}°C</span><span class="weather-dot">·</span><span>${city.matchCount} 天${pref.dayLabel}</span></div><div class="destination-bottom"><span class="weather-tag">${icon(city.matchCount===city.expected?'check':'leaf')}${city.matchCount===city.expected?'每天都很合拍':pref.tag}</span><button class="visit-button ${visited?'is-visited':''}" data-visit="${city.id}" aria-label="${visited?'取消':'标记'}去过${city.name}">${icon(visited?'check':'footprints')}${visited?'已去过':'去过了'}</button></div></div></article>`;
  }
  function renderRecommendations() {
    const empty=`<div class="empty-results">${icon(preferences[state.preference].icon)}<h3>好天气，有时也需要等等</h3><p>${state.preference==='snow'?'当前日期没有符合条件的降雪目的地。':'当前条件下，暂时没有匹配的目的地。'}<br>试试其他日期、地区或放宽温度范围。</p><button id="empty-reset">查看全国 · 放宽筛选</button></div>`;
    $('#recommendation-list').innerHTML=state.ranked.length?state.ranked.slice(0,3).map(cardHTML).join(''):empty;
    $('#all-count').textContent=`(${state.ranked.length})`;
    $('#show-all-btn').hidden=state.ranked.length===0;
    $('#all-cards').innerHTML=state.ranked.map(cardHTML).join('');
    if(!state.ranked.length)$('#all-destinations').hidden=true;
  }

  function provinceColor(ratio) {
    const start=[234,239,231];
    const end=state.preference==='snow'?[158,192,212]:state.preference==='rain'?[159,183,198]:state.preference==='cool'?[151,190,161]:[177,201,139];
    return `rgb(${start.map((n,i)=>Math.round(n+(end[i]-n)*ratio)).join(',')})`;
  }
  function project(lon,lat) {return [61+(lon-73)*12.15,32+(54-lat)*12.65];}
  function geometryPath(geometry,projection=project) {
    const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:geometry.type==='Polygon'?[geometry.coordinates]:[];
    return polygons.map(p=>p.map(ring=>ring.map(([lon,lat],i)=>{const [x,y]=projection(lon,lat);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join('')+'Z').join('')).join('');
  }
  function initializeMap() {
    const features=window.CHINA_GEO?.features;
    if(!features){$('#map-container').innerHTML='<div class="empty-results">地图资源未加载，请刷新页面。城市推荐仍可使用。</div>';return;}
    $('#province-paths').innerHTML=features.map(f=>`<path class="province" data-province="${f.properties.adcode||0}" d="${geometryPath(f.geometry)}" fill="#e7edde"><title>${escapeHTML(f.properties.name||'中国南海诸岛')}</title></path>`).join('');
    const labels=[['新疆',84.2,40.4],['西藏',86.5,31.3],['青海',95,35.5],['内蒙古',113.8,43.5],['黑龙江',128,48.4],['四川',101.9,28.5],['甘肃',98.4,39.6],['台湾',122.6,23.3]];
    $('#province-labels').innerHTML=labels.map(([text,lon,lat])=>{const [x,y]=project(lon,lat);return `<text class="province-label" x="${x}" y="${y}" text-anchor="middle">${text}</text>`;}).join('');
    const islandProjection=(lon,lat)=>[774+(lon-106)*5.2,377+(24-lat)*5.7];
    $('#island-inset').innerHTML=`<rect class="inset-border" x="771" y="372" width="96" height="132" rx="4"/><g clip-path="url(#inset-clip)">${features.filter(f=>[460000,'100000_JD'].includes(f.properties.adcode)).map(f=>`<path class="inset-province" d="${geometryPath(f.geometry,islandProjection)}"/>`).join('')}</g><rect x="772" y="489" width="94" height="14" fill="#fbfcf9"/><text x="819" y="499" text-anchor="middle" class="inset-title">南海诸岛</text>`;
  }
  function renderMap() {
    if(!$('#city-markers'))return;
    const pref=preferences[state.preference];
    $$('.province').forEach(path=>{
      const code=Number(path.dataset.province);
      const samples=state.allRanked.filter(c=>c.code===code&&c.complete);
      const ratio=samples.length?samples.reduce((sum,c)=>sum+(c.hazardous?0:c.matchCount/c.expected),0)/samples.length:0;
      path.setAttribute('fill',samples.length?provinceColor(ratio):'#eef1ed');
      path.style.opacity=state.region==='all'||samples.some(c=>c.region===state.region)?'1':'.33';
    });
    let visible=state.allRanked.filter(c=>c.marker);
    if(state.region!=='all')visible=state.allRanked.filter(c=>c.region===state.region);
    const top=state.ranked[0];
    if(top&&!visible.some(c=>c.id===top.id))visible.push(top);
    const selectedTop=top?visible.find(c=>c.id===top.id):null;
    const markerScale=$('#map-container').clientWidth<500?1.45:1;
    const occupied=[];
    const layout=[];
    const ordered=selectedTop?[selectedTop,...visible.filter(c=>c!==selectedTop)]:visible;
    // Reserve actual label rectangles before rendering so adjacent city targets never overlap.
    for(const city of ordered){
      const [x,y]=project(city.lon,city.lat),isTop=city.id===top?.id;
      const labelWidth=city.name.length*13+36;
      const preferredSide=city.id==='hohhot'?'left':'right';
      const sides=isTop?['right']:[preferredSide,preferredSide==='left'?'right':'left'];
      for(const side of sides){
        const left=isTop?-18:side==='left'?15-labelWidth:-15;
        const width=isTop?(city.name.length>3?132:110):labelWidth;
        const box={left:x+left*markerScale,right:x+(left+width)*markerScale,top:y-18*markerScale,bottom:y+(isTop?24:20)*markerScale};
        if(occupied.some(b=>box.left<b.right+4&&box.right>b.left-4&&box.top<b.bottom+4&&box.bottom>b.top-4))continue;
        occupied.push(box);layout.push({city,x,y,isTop,side,left,width});break;
      }
    }
    layout.sort((a,b)=>Number(a.isTop)-Number(b.isTop));
    $('#city-markers').innerHTML=layout.map(({city,x,y,isTop,side,left,width})=>{
      const sample=city.days.find(matches)||city.days[0];
      const info=sample?weatherInfo(sample.code):{name:'暂无数据',icon:'cloud'};
      const temp=city.complete?`${round(city.mean)}°`:'—';
      const labelX=side==='left'?-18:18,anchor=side==='left'?'end':'start';
      const ico=`<svg class="map-weather-icon" x="-9" y="-9" width="18" height="18" style="color:${info.icon==='snow'?'#84a8bd':info.icon==='rain'?'#8ca6b4':'#cfaa50'};stroke:currentColor"><use href="#i-${info.icon}"/></svg>`;
      return `<g class="map-city ${isTop?'top-match':''} ${state.visited[city.id]?'visited-marker':''}" data-map-city="${city.id}" tabindex="0" role="button" aria-label="${city.name}，${city.complete?info.name+'，平均最高温'+round(city.mean)+'摄氏度':'暂无完整预报'}，点击查看详情" transform="translate(${x},${y}) scale(${markerScale})">${isTop?`<rect class="marker-highlight" x="-18" y="-18" width="${width}" height="37" rx="7" filter="url(#marker-shadow)"/><path d="M-3 18 3 24 9 18" fill="#24866a"/><circle r="12" fill="#ffffff20"/>${ico}<text class="highlight-label" x="17" y="4">${city.name}</text><text class="highlight-temp" x="${city.name.length>3?80:62}" y="4">${temp}</text>`:`<rect x="${left}" y="-18" width="${width}" height="38" rx="5" fill="transparent" pointer-events="all"/><circle class="marker-dot" r="13"/>${ico}<text x="${labelX}" y="-1" text-anchor="${anchor}">${city.name}</text><text class="city-temp" x="${labelX}" y="14" text-anchor="${anchor}">${temp}</text>`}</g>`;
    }).join('');
    updateMapTransform();
  }
  function updateMapTransform(){const group=$('#map-viewport');if(group)group.setAttribute('transform',`translate(${450*(1-state.zoom)+state.panX},${275*(1-state.zoom)+state.panY}) scale(${state.zoom})`);}

  function persistVisited() {
    try{localStorage.setItem('sunseek-footprints-v1',JSON.stringify(state.visited));return true;}
    catch{storageAvailable=false;toast('浏览器未允许保存，足迹暂时只保留到当前页面关闭。');return false;}
  }
  function toggleVisited(id) {
    if(!cityByID.has(id))return;
    const name=cityByID.get(id).name;
    const existed=!!state.visited[id];
    if(existed)delete state.visited[id];else state.visited[id]={savedAt:localDate(new Date()),note:''};
    const saved=persistVisited();render();
    if(state.activeCity===id&&$('#city-dialog').open)renderCityDialog(id);
    if(saved)toast(existed?`已将${name}移回待探索目的地`:`${name}已收进「我的旅行足迹」，下一站去新的地方。`);
  }
  function renderVisited() {
    const entries=Object.entries(state.visited);
    $('#visited-count').textContent=entries.length;$('#nav-count').textContent=entries.length;
    $('#visited-content').innerHTML=entries.length?entries.map(([id,entry])=>{
      const city=cityByID.get(id);
      return `<article class="visited-card"><div class="visited-card-heading"><button data-open-city="${id}">${city.name}<span> · ${city.province}</span></button><span>${icon('check')}</span></div><textarea data-visit-note="${id}" maxlength="300" rows="2" aria-label="${city.name}旅行笔记" placeholder="留下一点旅行的记忆…">${escapeHTML(entry.note||'')}</textarea><div class="visited-card-footer"><span>${escapeHTML(entry.savedAt)} 记录 · 笔记自动保存</span><button data-visit="${id}">${icon('refresh')}移回推荐</button></div></article>`;
    }).join(''):`<div class="visited-empty">${icon('footprints')}旅途的故事，从第一次出发开始。<br>在目的地卡片上点击「去过了」，就能在这里保存足迹。</div>`;
    if(!storageAvailable)$('.local-note').innerHTML=`${icon('info')}浏览器存储不可用，当前足迹仅保留到此页面关闭。`;
  }

  function renderCityDialog(id) {
    const base=cityByID.get(id);if(!base)return;
    const city=assess(base),pref=preferences[state.preference],isVisited=!!state.visited[id],isLive=state.mode==='live';
    const rowData=new Map(city.days.map(day=>[day.date,day]));
    const rows=dateRange(state.start,state.end).map(date=>{
      const day=rowData.get(date),weekday=['日','一','二','三','四','五','六'][parseDate(date).getDay()];
      if(!day)return `<tr class="unavailable"><td>${shortDate(date)} 周${weekday}</td><td colspan="5">此日期暂无完整预报</td></tr>`;
      const info=weatherInfo(day.code);
      return `<tr class="${isHazard(day)?'hazardous':''}"><td>${shortDate(date)} 周${weekday}</td><td>${icon(info.icon)}${info.name}</td><td>${round(day.min)}–${round(day.max)}°</td><td>${round(day.rainProbability)}%</td><td>${day.snow>0?`${day.snow.toFixed(1)} cm 雪`:`${day.precip.toFixed(1)} mm`}</td><td>${round(day.wind)} km/h</td></tr>`;
    }).join('');
    $('#city-dialog-content').innerHTML=`<button class="dialog-close icon-button" data-close-dialog aria-label="关闭天气详情">${icon('close')}</button><div class="city-dialog-hero"><img src="assets/${city.image}.jpg" alt="旅行意境图"><div class="city-dialog-title"><h2>${city.name}</h2><p>${city.province} · ${city.region} / ${city.lat.toFixed(2)}° N, ${city.lon.toFixed(2)}° E</p></div><span class="dialog-image-note">风景意境图 · 非对应城市实景</span></div><div class="city-dialog-body"><p class="city-detail-intro">${city.description}</p><div class="city-detail-badges"><span class="detail-badge">${icon(pref.icon)}${city.complete?`${city.matchCount} / ${city.expected} 天${pref.dayLabel}`:'预报暂不完整'}</span>${city.complete?`<span class="detail-badge">天气匹配度 ${city.score}%</span>`:''}${city.hazardous?`<span class="detail-badge warning">${icon('shield')}有恶劣天气 · 不纳入推荐</span>`:''}${!isLive?'<span class="detail-badge warning">示例数据 · 非真实预报</span>':''}</div><p class="detail-data-label"><span class="status-dot ${isLive?'':'amber'}"></span>${formatDate(state.start)}—${formatDate(state.end)} · ${isLive?'Open-Meteo 实时预报':'演示天气，仅供功能体验'}</p><div class="forecast-scroll"><table class="forecast-table"><thead><tr><th>日期</th><th>天气</th><th>最低–最高温</th><th>降水概率</th><th>雨 / 雪量</th><th>最大风速</th></tr></thead><tbody>${rows}</tbody></table></div><p class="detail-safety">${city.hazardous?'该城市在所选日期有强风、强雨雪、冻雨或雷暴等不利天气，已从推荐中排除。':state.preference==='snow'?'降雪预报不代表已有积雪，市区预报也不代表高海拔景区天气。请确认道路、景区开放情况和当地预警。':'城市预报不能代表所有景区，山区与海边天气可能变化更快。出发前请核实当地气象预警与景区开放信息。'}${!isLive?' 当前为示例数据，请勿据此安排行程。':''}</p><div class="city-dialog-actions"><span>将这座城，收进自己的旅行故事里</span><button class="primary-button" data-visit="${id}">${icon(isVisited?'refresh':'footprints')}${isVisited?'移回待探索':'去过了，保存足迹'}</button></div></div>`;
  }
  function openCity(id) {if(!cityByID.has(id))return;closeAllDialogs();state.activeCity=id;renderCityDialog(id);showDialog($('#city-dialog'));}
  function showDialog(dialog) {dialog.showModal();document.body.classList.add('modal-open');}
  function closeAllDialogs() {$$('dialog[open]').forEach(d=>d.close());document.body.classList.remove('modal-open');}
  function showAbout(){closeAllDialogs();renderDataStatus();showDialog($('#about-dialog'));}
  function toast(message) {clearTimeout(state.toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;state.toastTimer=setTimeout(()=>{$('#toast').hidden=true;},4200);}
  function renderSearch() {
    const query=$('#city-search').value.trim().toLowerCase();
    const matches=cities.filter(c=>(c.name+c.province+c.region+c.id).toLowerCase().includes(query));
    $('#search-results').innerHTML=matches.length?matches.map(c=>{
      const assessment=assess(c);
      return `<button class="search-result" data-open-city="${c.id}"><span>${icon('pin')}<span>${c.name}<small>${c.province} · ${c.region}</small></span></span><span>${state.visited[c.id]?'已去过 · ':''}${assessment.complete?`${round(assessment.min)}–${round(assessment.max)}°C`:'暂无预报'}</span></button>`;
    }).join(''):'<p class="search-empty">还没有覆盖这个目的地，试试搜索省份或附近城市。</p>';
  }

  function normalizeForecast(response) {
    const d=response?.daily;
    if(!d||!Array.isArray(d.time))return [];
    return d.time.map((date,i)=>({date,code:d.weather_code?.[i],max:d.temperature_2m_max?.[i],min:d.temperature_2m_min?.[i],rainProbability:d.precipitation_probability_max?.[i],precip:d.precipitation_sum?.[i],snow:d.snowfall_sum?.[i],wind:d.wind_speed_10m_max?.[i]})).filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day.date)&&['code','max','min','rainProbability','precip','snow','wind'].every(key=>typeof day[key]==='number'&&Number.isFinite(day[key])));
  }
  function loadCachedWeather() {
    try {
      const cache=JSON.parse(localStorage.getItem('sunseek-weather-v1')||'null');
      if(!cache||cache.day!==today||Date.now()-cache.time>3600000||Date.now()<cache.time||!Array.isArray(cache.data))return false;
      const data=new Map();
      for(const [id,days] of cache.data){if(!cityByID.has(id)||!Array.isArray(days))continue;const validated=days.filter(d=>d&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&['code','max','min','rainProbability','precip','snow','wind'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k])));if(validated.length)data.set(id,validated);}
      if(!data.size)return false;
      state.data=data;state.mode='live';state.lastUpdated=cache.time;return true;
    }catch{return false;}
  }
  async function fetchWeather(force=false) {
    if(state.loading)return;
    if(!force&&loadCachedWeather()){render();return;}
    state.loading=true;renderDataStatus();
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),22000);
    const batchSize=16;
    const batches=[];for(let i=0;i<cities.length;i+=batchSize)batches.push(cities.slice(i,i+batchSize));
    const results=await Promise.allSettled(batches.map(async batch=>{
      const params=new URLSearchParams({latitude:batch.map(c=>c.lat).join(','),longitude:batch.map(c=>c.lon).join(','),daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max',timezone:'Asia/Shanghai',forecast_days:'16'});
      const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`,{signal:controller.signal});
      if(!response.ok)throw new Error(`Weather service: ${response.status}`);
      const payload=await response.json();const list=Array.isArray(payload)?payload:[payload];
      if(list.length!==batch.length)throw new Error('Weather response location count mismatch');
      return batch.map((city,index)=>[city.id,normalizeForecast(list[index])]);
    }));
    clearTimeout(timer);state.loading=false;
    const data=new Map();
    for(const result of results)if(result.status==='fulfilled')for(const [id,days] of result.value)if(days.some(d=>d.date>=today&&d.date<=lastForecastDate))data.set(id,days);
    if(data.size){
      state.data=data;state.mode='live';state.lastUpdated=Date.now();
      try{localStorage.setItem('sunseek-weather-v1',JSON.stringify({day:today,time:state.lastUpdated,data:[...data]}));}catch{/* Weather remains usable without storage. */}
      if(force)toast(`已更新 ${data.size} 个城市的实时预报${data.size<cities.length?'，未取到数据的城市暂不推荐':''}`);
    }else if(state.mode!=='live'){
      state.mode='demo';if(force)toast('暂时无法连接天气服务，继续显示示例数据。请稍后再试。');
    }else if(force)toast('本次更新未成功，保留上次获取的预报；请留意更新时间。');
    render();
    if($('#city-dialog').open&&state.activeCity)renderCityDialog(state.activeCity);
    if($('#search-dialog').open)renderSearch();
  }

  function resetAdvanced() {
    $('#min-temp').value='';$('#max-temp').value='';$('#strict-match').checked=false;
    $('#region-filter').value='all';$('#hide-visited').checked=true;applyFilters();
  }
  function initEvents() {
    $$('.preference').forEach(button=>button.addEventListener('click',()=>{
      state.preference=button.dataset.preference;
      $$('.preference').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
      applyFilters();
    }));
    ['start-date','end-date','min-temp','max-temp','strict-match','hide-visited','region-filter','sort-order'].forEach(id=>$('#'+id).addEventListener('change',()=>{if(id.includes('date'))$$('[data-quick-date]').forEach(b=>b.classList.remove('active'));applyFilters();}));
    $$('#start-date,#end-date').forEach(input=>{input.min=today;input.max=lastForecastDate;});
    $$('[data-quick-date]').forEach(button=>button.addEventListener('click',()=>{
      let start,end;
      if(button.dataset.quickDate==='week'){start=today;end=addDays(today,6);}else{const weekday=parseDate(today).getDay();start=addDays(today,weekday===0?0:(6-weekday+7)%7);end=addDays(start,weekday===0?0:1);}
      $('#start-date').value=start;$('#end-date').value=end;
      $$('[data-quick-date]').forEach(b=>b.classList.toggle('active',b===button));applyFilters();
    }));
    $('#find-btn').addEventListener('click',()=>{if(applyFilters(true))$('.results-topline').scrollIntoView({behavior:'smooth',block:'start'});});
    $('#more-filters').addEventListener('click',()=>{const expanded=$('#advanced-filters').hidden;$('#advanced-filters').hidden=!expanded;$('#more-filters').setAttribute('aria-expanded',String(expanded));});
    $('#reset-filters').addEventListener('click',resetAdvanced);
    $('#show-all-btn').addEventListener('click',()=>{$('#all-destinations').hidden=false;$('#all-destinations').scrollIntoView({behavior:'smooth',block:'start'});});
    $('#collapse-results').addEventListener('click',()=>{$('#all-destinations').hidden=true;$('#show-all-btn').focus();});
    $('#footprints-nav').addEventListener('click',()=>{$('#footprints').open=true;});
    ['about-btn','source-btn','data-status'].forEach(id=>$('#'+id).addEventListener('click',showAbout));
    const retry=document.createElement('button');retry.id='retry-weather';retry.className='text-button';retry.style.cssText='color:var(--green);margin-top:9px;text-decoration:underline;text-underline-offset:3px';retry.textContent='重新连接实时天气';$('#about-data-status').after(retry);retry.addEventListener('click',()=>fetchWeather(true));
    $('#search-btn').addEventListener('click',()=>{closeAllDialogs();$('#city-search').value='';renderSearch();showDialog($('#search-dialog'));$('#city-search').focus();});
    $('#city-search').addEventListener('input',renderSearch);
    document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('#search-btn').click();}});
    document.addEventListener('click',event=>{
      const visit=event.target.closest('[data-visit]');if(visit){event.preventDefault();event.stopPropagation();toggleVisited(visit.dataset.visit);return;}
      const close=event.target.closest('[data-close-dialog]');if(close){closeAllDialogs();return;}
      const open=event.target.closest('[data-open-city]');if(open){openCity(open.dataset.openCity);return;}
      const card=event.target.closest('[data-city]');if(card){openCity(card.dataset.city);return;}
      if(event.target.closest('#empty-reset')){resetAdvanced();}
    });
    document.addEventListener('keydown',event=>{const card=event.target.closest('[data-city]');if(card&&event.target===card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openCity(card.dataset.city);}});
    $('#visited-content').addEventListener('input',event=>{const note=event.target.closest('[data-visit-note]');if(note&&state.visited[note.dataset.visitNote]){state.visited[note.dataset.visitNote].note=note.value.slice(0,300);persistVisited();}});
    $$('dialog').forEach(dialog=>{
      dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeAllDialogs();}});
      dialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))document.body.classList.remove('modal-open');});
    });
    let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderMap,120);});
    const svg=$('#weather-map');
    let pointer=null,dragged=false;
    svg.addEventListener('pointerdown',event=>{if(event.button!==0)return;pointer={x:event.clientX,y:event.clientY,panX:state.panX,panY:state.panY};dragged=false;});
    svg.addEventListener('pointermove',event=>{
      if(pointer&&state.zoom>1){const scale=900/svg.getBoundingClientRect().width;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(Math.abs(dx)+Math.abs(dy)>5){dragged=true;svg.setPointerCapture(event.pointerId);$('#map-tooltip').hidden=true;state.panX=clamp(pointer.panX+dx*scale,-450*(state.zoom-1),450*(state.zoom-1));state.panY=clamp(pointer.panY+dy*scale,-275*(state.zoom-1),275*(state.zoom-1));updateMapTransform();}}
    });
    svg.addEventListener('pointerup',event=>{pointer=null;if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);});
    svg.addEventListener('pointercancel',()=>{pointer=null;dragged=false;});
    svg.addEventListener('click',event=>{if(dragged){dragged=false;return;}const marker=event.target.closest('[data-map-city]');if(marker)openCity(marker.dataset.mapCity);});
    svg.addEventListener('keydown',event=>{const marker=event.target.closest('[data-map-city]');if(marker&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openCity(marker.dataset.mapCity);}});
    svg.addEventListener('pointerover',event=>{const marker=event.target.closest('[data-map-city]');if(!marker||pointer||event.pointerType==='touch')return;const city=state.allRanked.find(c=>c.id===marker.dataset.mapCity);if(!city)return;const box=marker.getBoundingClientRect(),container=$('#map-container').getBoundingClientRect();$('#map-tooltip').innerHTML=`<strong>${city.name} <span>· ${state.mode==='live'?'实时预报':'示例数据'}</span></strong><span>${city.complete?`${city.matchCount} 天${preferences[state.preference].dayLabel} · ${round(city.min)}–${round(city.max)}°C`:'暂无完整预报'}${city.hazardous?' · 有不利天气':''}</span>`;$('#map-tooltip').style.left=`${clamp(box.left-container.left-35,10,container.width-175)}px`;$('#map-tooltip').style.top=`${Math.max(8,box.top-container.top-64)}px`;$('#map-tooltip').hidden=false;});
    svg.addEventListener('pointerout',event=>{if(event.target.closest('[data-map-city]'))$('#map-tooltip').hidden=true;});
    function zoom(delta){state.zoom=clamp(state.zoom+delta,1,2.5);if(state.zoom===1){state.panX=0;state.panY=0;}updateMapTransform();}
    $('#map-zoom-in').addEventListener('click',()=>zoom(.3));$('#map-zoom-out').addEventListener('click',()=>zoom(-.3));
    $('#map-reset').addEventListener('click',()=>{state.zoom=1;state.panX=0;state.panY=0;updateMapTransform();});
    window.addEventListener('storage',event=>{if(event.key==='sunseek-footprints-v1'){try{const saved=JSON.parse(event.newValue||'{}');state.visited={};if(saved&&typeof saved==='object')for(const [id,entry] of Object.entries(saved))if(cityByID.has(id)&&entry&&typeof entry==='object')state.visited[id]={savedAt:typeof entry.savedAt==='string'?entry.savedAt:today,note:typeof entry.note==='string'?entry.note.slice(0,300):''};render();}catch{/* Ignore malformed storage updates. */}}});
  }

  $('#start-date').value=state.start;$('#end-date').value=state.end;
  state.data=demoData();initializeMap();initEvents();render();fetchWeather();
})();
