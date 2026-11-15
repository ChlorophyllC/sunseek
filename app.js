'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const Weather = window.SunseekWeather;
  const Places = window.SunseekPlaces;
  const Attractions = window.SunseekAttractions;
  const Backup = window.SunseekBackup;
  const CACHE_KEY = 'sunseek-weather-v3';
  const CACHE_MAX_AGE = 6 * 3600000;
  const CACHE_MAX_CHARS = 1600000;
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
  const curated = cityRows.map(([id,name,province,code,region,lat,lon,temp,type,description,image,marker],index)=>({id,name,province,code,region,lat,lon,temp,type,description,image,marker,index}));
  const cities = Places.buildCatalog(curated,window.PLACE_ROWS||[]);
  try { for(const city of Places.restoreCustom(JSON.parse(localStorage.getItem('sunseek-places-v3')||'[]')))if(!cities.some(c=>c.id===city.id))cities.push({...city,index:cities.length}); } catch {}
  const cityByID = new Map(cities.map(c=>[c.id,c]));
  const publicWeatherIDs=new Set(cities.filter(c=>['featured','basic'].includes(c.tier)).map(c=>c.id));
  const featuredIDs=new Set(cities.filter(c=>c.tier==='featured').map(c=>c.id));
  const requestedIDs=new Set(featuredIDs);
  const pendingIDs=new Set();
  const failedIDs=new Set();
  const failureReasons=new Map();
  const updatedAt=new Map();
  const forecastBaseDates=new Map();
  let searchController=null,searchGeneration=0,searchTimer=null,onlineCandidates=[],placeCandidate=null;
  let searchAtlas=[],searchAtlasPromise=null,searchAtlasState='idle',remotePlaces=[];
  let searchEditedAt=0,searchComposing=false,searchLocalLimit=40,searchLocalTotal=0,searchBottomReached=false;
  let onlineSearchState='idle',onlineSearchMessage='',onlineSearchKey='';
  const SEARCH_IDLE_MS=1000,searchOnlineCache=new Map();
  let pageScrollLock=null;
  const Search=window.SunseekSearch;
  let mapBounds=null;
  const subdivisionLoads=new Map();
  let backupGeneration=0,backupPending=null,backupRecovery=false;
  const provinceFeatures=(window.CHINA_GEO?.features||[]).map(f=>(window.LOCAL_BOUNDARIES?.features||[]).find(detail=>detail.properties.adcode===f.properties.adcode)||f);
  const inScope=city=>Places.scopeMatches(city,state.region);
  const isProvince=()=>/^\d{6}$/.test(state.region);
  const escapeName=city=>escapeHTML(city.name);
  const preferences = {
    sun:{name:'追着阳光',icon:'sun',dayLabel:'晴好',mapLabel:'晴天分布',legend:'晴好小时占比',tag:'适合晒太阳',color:'#d3ac4c'},
    snow:{name:'赴一场雪',icon:'snow',dayLabel:'降雪',mapLabel:'降雪分布',legend:'降雪小时占比',tag:'等待一场雪',color:'#7d9fbc'},
    rain:{name:'听听下雨',icon:'rain',dayLabel:'细雨',mapLabel:'细雨分布',legend:'细雨小时占比',tag:'适合听听雨',color:'#829db2'},
    cool:{name:'寻一处清凉',icon:'leaf',dayLabel:'舒适',mapLabel:'舒适天气分布',legend:'舒适小时占比',tag:'温度刚刚好',color:'#80a078'}
  };
  const state = {start:addDays(today,1),end:addDays(today,3),preference:'sun',region:'all',discovery:'featured',sort:'score',hideVisited:true,strict:false,min:null,max:null,origin:'',maxDistance:null,hourStart:9,hourEnd:18,compare:[],mode:'loading',data:new Map(),ranked:[],allRanked:[],candidates:[],visited:{},loading:false,expanding:false,lastUpdated:null,zoom:1,panX:0,panY:0,activeCity:null,toastTimer:null,requestId:0,controller:null,fetchError:false,picking:false,focusCity:null,featured:[],mapDate:null,mapRanked:[],windowDuration:3,departureOpen:false};
  let storageAvailable=true;
  try {
    const saved=JSON.parse(localStorage.getItem('sunseek-footprints-v1') || '{}');
    if(saved && typeof saved==='object' && !Array.isArray(saved)) {
      for(const [id, entry] of Object.entries(saved)) if(cityByID.has(id) && entry && typeof entry==='object') state.visited[id]={savedAt:typeof entry.savedAt==='string'?entry.savedAt:today,note:typeof entry.note==='string'?entry.note.slice(0,300):''};
    }
  } catch { storageAvailable=false; }

  function seeded(number) {const x=Math.sin(number*127.1+311.7)*43758.5453;return x-Math.floor(x);}
  function demoData() {
    const seasonal=Math.sin((parseDate(today).getMonth()-10)/12*Math.PI*2)*6;
    const data=new Map();
    cities.forEach(city=>{
      data.set(city.id,dateRange(today,lastForecastDate).map((date,j)=>{
        const r=seeded(city.index*19+j*7+23),max=Math.round(city.temp+seasonal+(r-.5)*4);
        let code=city.index<3?0:[0,1,2,3,61,63][Math.floor(r*6)];
        if(['chengdu','guiyang','hangzhou','zhangjiajie'].includes(city.id))code=61;
        if((city.lat>42 && max<6)||city.id==='changbaishan')code=71;
        if(city.id==='zhengzhou' && j===2)code=95;
        const snowy=[71,73].includes(code),rainy=[61,63,95].includes(code),wind=Math.round(6+r*12);
        const hours=Array.from({length:24},(_,hour)=>{
          const interrupted=code<3 && j%3===1 && hour===15;
          const hcode=interrupted?3:code;
          const temp=Number((max-5+5*Math.cos((hour-14)*Math.PI/12)).toFixed(1));
          return {hour,code:hcode,temp,feels:temp-1,precip:rainy?.5:0,snow:snowy?.3:0,wind,gust:wind+8,cloud:hcode<3?20:85,isDay:hour>=8&&hour<(city.lat>35?17:18)?1:0};
        });
        return {date,code,max,min:max-(city.type==='coast'?5:10),rainProbability:rainy?75:8,precip:rainy?8:0,snow:snowy?3:0,wind,gust:wind+8,hours};
      }));
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
  const isHazard=Weather.isHazard;
  const matches=day=>day.matchedHours>0;
  function assessmentOptions(dates=dateRange(state.start,state.end)) {
    const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).split(':').map(Number);
    return {
      dates,preference:state.preference,min:state.min,max:state.max,strict:state.strict,
      hourStart:state.hourStart,hourEnd:state.hourEnd,today,currentHour:clock[0]+1,
      origin:cityByID.get(state.origin)||null,maxDistance:state.maxDistance
    };
  }
  function assess(city,dates) {
    return Weather.assess(city,state.data.get(city.id)||[],assessmentOptions(dates));
  }
  function sortCities(a,b) {
    if(state.sort==='distance')return a.distance-b.distance||b.score-a.score||a.index-b.index;
    if(state.sort==='hours')return b.goodHours-a.goodHours||b.score-a.score||a.index-b.index;
    if(state.sort==='days')return b.matchCount-a.matchCount||b.score-a.score||a.index-b.index;
    if(state.sort==='temp')return a.mean-b.mean||b.score-a.score||a.index-b.index;
    return b.score-a.score||b.goodHours-a.goodHours||(state.sort==='score'?(a.tier==='featured'?0:1)-(b.tier==='featured'?0:1):0)||a.index-b.index;
  }
  function isDiscoveryCandidate(city){return city.tier!=='preview'&&inScope(city)&&(isProvince()||state.discovery==='all'||city.tier==='featured'||city.tier==='custom');}
  function discoveryPlaces(){return cities.filter(isDiscoveryCandidate);}
  function currentWeatherTargets(){return [...new Set([...discoveryPlaces().map(c=>c.id),...($('#city-dialog').open&&state.activeCity?[state.activeCity]:[])])];}
  function recompute() {
    state.allRanked=cities.filter(c=>c.tier!=='preview'&&(state.discovery==='all'||state.data.has(c.id)||requestedIDs.has(c.id)||c.tier==='featured'||c.tier==='custom'||(isProvince()&&String(c.code)===state.region))).map(city=>assess(city));
    state.candidates=state.allRanked.filter(isDiscoveryCandidate);
    state.ranked=state.candidates.filter(c=>c.eligible&&(!state.hideVisited||!state.visited[c.id])).sort(sortCities);
    if(state.sort==='score'&&!isProvince())state.ranked=Places.diversify(state.ranked,state.ranked.length);
    state.featured=state.ranked.slice(0,3);
  }
  function renderDiscoveryStatus(){
    const counts={complete:0,pending:0,failed:0,missing:0};
    for(const city of state.candidates){
      if(city.complete)counts.complete++;
      else if(pendingIDs.has(city.id))counts.pending++;
      else if(failedIDs.has(city.id))counts.failed++;
      else counts.missing++;
    }
    const personal=cities.some(c=>c.tier==='custom');
    $('#discovery-scope option[value="featured"]').textContent=personal?'精选与个人地点':'精选目的地';
    $('#discovery-scope').value=state.discovery;$('#discovery-scope').disabled=isProvince();
    const name=isProvince()?'省内全部地点':state.discovery==='all'?'全部收录地点':personal?'精选与个人地点':'精选目的地';
    $('#discovery-progress').textContent=`${name} · ${state.candidates.length} 个候选 · ${counts.complete} 个完整${counts.pending?' · '+counts.pending+' 个查询中':''}${counts.failed?' · '+counts.failed+' 个获取失败':''}${counts.missing?' · '+counts.missing+' 个未查询或不完整':''}${state.mode==='demo'?' · 示例数据':''}`;
    const retry=$('#retry-discovery');
    retry.hidden=isProvince()||!(counts.failed+counts.missing)||state.mode==='demo';retry.disabled=state.loading;
  }
  function stopDiscoveryLoading(){
    if(!state.loading||!state.expanding)return;
    state.requestId++;state.controller?.abort();state.controller=null;state.loading=false;state.expanding=false;pendingIDs.clear();
    state.mode=state.data.size?'cached':'unavailable';saveWeatherCache();
  }
  function setDiscovery(scope){
    stopDiscoveryLoading();state.discovery=scope==='all'?'all':'featured';
    if(state.loading&&state.discovery==='all')state.expanding=true;
    render();
    ensureWeather(discoveryPlaces().map(c=>c.id));
  }
  function distanceText(city) {return city.distance===null?'未设置出发地':city.id===state.origin?'当前出发地':`约 ${Math.round(city.distance).toLocaleString('zh-CN')} km · 直线`;}
  function windowText(best) {return best?`${shortDate(best.date)} ${String(best.start).padStart(2,'0')}:00–${String(best.end).padStart(2,'0')}:00`:'暂无连续合拍时段';}
  function dataLabel(city=null) {if(city&&state.mode!=='demo'&&!state.data.has(city.id))return pendingIDs.has(city.id)?'正在获取预报':'暂无可用预报';if(state.mode!=='demo'&&Number.isFinite(city?updatedAt.get(city.id):state.lastUpdated)&&Date.now()-(city?updatedAt.get(city.id):state.lastUpdated)>=3600000)return '缓存预报';return state.mode==='demo'?'示例数据':state.mode==='cached'?'缓存预报':state.mode==='live'?'实时预报':state.loading&&state.data.size?'部分预报':'暂无可用预报';}
  function forecastStatus(city) {
    if(pendingIDs.has(city.id))return '正在获取预报';
    if(city.complete)return failedIDs.has(city.id)?'有效缓存可用':'所选时段预报完整';
    if(failedIDs.has(city.id))return `天气获取失败：${failureReasons.get(city.id)||'连接未成功'}`;
    return state.data.has(city.id)?'所选日期或小时数据不完整':'尚未获取天气';
  }
  function timeLabel(city=null) {const stamp=city?updatedAt.get(city.id):state.lastUpdated;return stamp?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(stamp)):'';}

  function getFilters() {
    const start=$('#start-date').value,end=$('#end-date').value;
    const min=$('#min-temp').value.trim(),max=$('#max-temp').value.trim();
    const origin=$('#origin-city').value;
    const hourStart=Number($('#hour-start').value),hourEnd=Number($('#hour-end').value);
    let error='';
    if(!start||!end||!Number.isFinite(+parseDate(start))||!Number.isFinite(+parseDate(end)))error='请选择完整的出发和返程日期。';
    else if(start<today)error='请选择今天或之后的日期，过去的天气不属于未来出行预报。';
    else if(end<start)error='返程日期不能早于出发日期。';
    else if(start>lastForecastDate||end>lastForecastDate)error=`目前只能查询 ${formatDate(today)}—${formatDate(lastForecastDate)} 的未来 16 天天气。更远的行程，请临近出发时再来看。`;
    else if((min!==''&&(!Number.isFinite(+min)||+min< -40||+min>50))||(max!==''&&(!Number.isFinite(+max)||+max< -40||+max>50)))error='请输入 −40°C 到 50°C 之间的温度，或留空表示不限。';
    else if(min!==''&&max!==''&&+min>+max)error='最低可接受温度不能高于最高温度。';
    else if(hourStart>=hourEnd)error='户外活动结束时间应晚于开始时间。';
    $('#filter-error').hidden=!error;
    $('#filter-error').textContent=error;
    if(error)return false;
    if(!origin && $('#sort-order').value==='distance')$('#sort-order').value='score';
    Object.assign(state,{origin,maxDistance:origin&&$('#max-distance').value?Number($('#max-distance').value):null,hourStart,hourEnd,start,end,min:min===''?null:+min,max:max===''?null:+max,strict:$('#strict-match').checked,hideVisited:$('#hide-visited').checked,region:$('#region-filter').value,sort:$('#sort-order').value});
    $('#max-distance').disabled=!origin;
    $('#sort-order option[value=distance]').disabled=!origin;
    $('#all-sort-order option[value=distance]').disabled=!origin;
    $('#all-sort-order').value=state.sort;
    $('#distance-note').textContent=origin?`从${cityByID.get(origin).name}出发 · 距离为城市中心之间的近似直线距离，暂不提供交通时间与票价。`:'选择出发地后，可按直线距离筛选；交通时间与票价暂未接入。';
    try{localStorage.setItem('sunseek-preferences-v2',JSON.stringify({origin,hourStart,hourEnd,maxDistance:state.maxDistance}));}catch{}
    return true;
  }
  function applyFilters(announce=false) {
    if(!getFilters()){if(announce)$('#filter-error').scrollIntoView({block:'nearest',behavior:'smooth'});return false;}
    render();
    if(announce)toast(`已找到 ${state.ranked.length} 个符合偏好的目的地${state.mode==='demo'?' · 当前为示例数据':''}`);
    return true;
  }
  function render() {
    recompute();
    const stamps=state.candidates.map(c=>updatedAt.get(c.id)).filter(Number.isFinite);
    state.lastUpdated=stamps.length?Math.min(...stamps):null;
    const hasData=state.candidates.some(c=>state.data.has(c.id));
    state.fetchError=state.candidates.some(c=>failedIDs.has(c.id));
    if(!state.loading&&state.mode!=='demo'){
      if(!hasData)state.mode='unavailable';
      else if(state.mode==='unavailable')state.mode='cached';
    }
    const days=dateRange(state.start,state.end).length;
    $('#trip-length').textContent=`共 ${days} 天`;
    const available=state.candidates.filter(c=>c.complete).length;
    $('#results-summary').innerHTML=state.loading&&!hasData?'正在获取城市的逐小时天气…':!hasData?'当前范围暂无可用天气，连接恢复后再为你推荐':`${state.mode==='demo'?'示例覆盖':'当前范围完整预报'} <strong>${available}</strong> / ${state.candidates.length} 个目的地，找到 <strong>${state.ranked.length}</strong> 个合拍的地方${state.origin?` · 从${escapeHTML(cityByID.get(state.origin).name)}出发`:''}`;
    renderDiscoveryStatus();
    $('#recommend-count').textContent=`${shortDate(state.start)} – ${shortDate(state.end)} · 每天 ${state.hourStart}–${state.hourEnd} 时`;
    $('#map-legend').innerHTML=`<span>${preferences[state.preference].legend}</span><span>少</span><div class="legend-gradient" style="background:linear-gradient(90deg,${provinceColor(0)},${provinceColor(.5)},${provinceColor(1)})"></div><span>多</span>`;
    renderRecommendations();renderMap();renderVisited();renderDataStatus();renderCompareTray();renderSavedPlaces();
    if($('#compare-dialog').open)renderCompareDialog();
  }
  function renderDataStatus() {
    const count=state.candidates.filter(c=>state.data.has(c.id)).length,available=count>0,label=dataLabel();
    $('#data-status').innerHTML=`<span class="status-dot ${state.mode==='live'?'':'amber'} ${state.loading?'loading-pulse':''}"></span>${state.loading?(available?`${label} · 更新中`:'正在连接天气数据'):`${label}${state.lastUpdated?' · '+timeLabel()+' 更新':''}`}`;
    $('#about-data-status').textContent=state.mode==='demo'?'当前为主动开启的演示模式，所有天气和评分均为示例。':available?`当前范围已取得 ${count} / ${state.candidates.length} 个地点的${label}，获取于 ${timeLabel()}。超过 6 小时的缓存不参与推荐。`:'当前范围没有可用天气数据，不会自动使用示例代替真实预报。';
    $('#retry-weather').disabled=state.loading;
    $('#retry-weather').textContent=state.loading?'正在更新…':'重新获取实时天气';
    $('#demo-weather').textContent=state.mode==='demo'?'返回实时天气':'体验演示模式';
    const notice=$('#data-notice');
    notice.dataset.mode=state.mode;
    const retry=`<button class="notice-button" data-retry-weather ${state.loading?'disabled':''}>${icon('refresh')}重新获取</button>`;
    if(state.mode==='demo'){
      notice.hidden=false;notice.innerHTML=`${icon('info')}<div><strong>正在体验演示模式</strong><p>天气、合拍小时和评分均为示例，请勿据此安排行程。</p></div><button class="notice-button" data-return-live>返回实时天气${icon('arrow')}</button>`;
    }else if(state.mode==='unavailable'){
      notice.hidden=false;notice.innerHTML=`${icon('cloud')}<div><strong>天气暂时连接不上，好风景值得等一等</strong><p>没有 6 小时内的有效缓存。你可以重试，或主动体验演示功能。</p></div><div class="notice-actions">${retry}<button class="text-button" data-enter-demo>体验演示</button></div>`;
    }else if(state.mode==='cached'){
      notice.hidden=false;notice.innerHTML=`${icon('info')}<div><strong>使用 ${timeLabel()} 获取的缓存预报</strong><p>${state.loading?'正在尝试更新，保留现有结果。':state.fetchError?'本次连接未成功，缓存仍在 6 小时有效期内。':'缓存 1 小时内复用；超过 6 小时将停止推荐。'}</p></div>${retry}`;
    }else if(state.mode==='live'&&count<state.candidates.length){
      notice.hidden=false;notice.innerHTML=`${icon('info')}<div><strong>当前范围已取得 ${count} / ${state.candidates.length} 个地点的数据</strong><p>其余城市暂不参与推荐，地图以灰色或缺失标识显示。</p></div>${retry}`;
    }else notice.hidden=true;
  }
  function cardHTML(city,index) {
    const pref=preferences[state.preference],visited=!!state.visited[city.id],compared=state.compare.includes(city.id);
    return `<article class="destination-card" data-city="${city.id}" tabindex="0" role="button" aria-label="查看${escapeHTML(city.name)}天气详情"><div class="destination-image">${placeVisual(city)}<div class="image-overlay"></div><span class="destination-rank">${String(index+1).padStart(2,'0')}</span></div><div class="destination-content"><div class="destination-top"><div><h3 class="destination-name">${escapeHTML(city.name)}</h3><p class="destination-province">${escapeHTML(city.province)} · ${state.origin?distanceText(city):city.capital?'省会 / 中心城市':city.tier==='featured'?'精选目的地':'基础地点'}</p></div><div class="match-score">${city.score}<small>分</small><span class="match-caption">天气匹配度</span></div></div><div class="destination-weather">${icon(pref.icon)}<strong>${city.goodHours} / ${city.availableHours}h 合拍</strong><span class="weather-dot">·</span><span>${round(city.min)}–${round(city.max)}°C</span></div><p class="card-best-window">${icon('calendar')}${windowText(city.best)}</p><p class="card-caution">${city.caution}</p><div class="destination-bottom"><button class="compare-button ${compared?'is-selected':''}" data-compare="${city.id}" aria-pressed="${compared}" aria-label="${compared?'移除':'加入'}${escapeHTML(city.name)}对比">${icon(compared?'check':'sliders')}${compared?'已选对比':'加入对比'}</button><button class="visit-button ${visited?'is-visited':''}" data-visit="${city.id}" aria-label="${visited?'取消':'标记'}去过${escapeHTML(city.name)}">${icon(visited?'check':'footprints')}${visited?'已去过':'去过了'}</button></div></div></article>`;
  }
  function renderRecommendations() {
    const hasData=state.candidates.some(c=>state.data.has(c.id)),loading=state.loading;
    const empty=loading?`<div class="empty-results loading-pulse">${icon('sun')}<h3>好天气，正在路上</h3><p>正在查询逐小时预报，稍等片刻。</p></div>`:!hasData?`<div class="empty-results">${icon('cloud')}<h3>先等等真实的天气</h3><p>连接恢复后，推荐会重新出现。<br>你仍然可以查看自己的旅行足迹。</p><button data-retry-weather>重新获取天气</button></div>`:`<div class="empty-results">${icon(preferences[state.preference].icon)}<h3>换个条件，也许就有好风景</h3><p>当前没有满足条件的目的地。<br>试试调整日期、活动时间或距离范围。</p><button id="empty-reset">放宽距离与高级筛选</button></div>`;
    $('#recommendation-list').innerHTML=state.ranked.length?state.featured.map(cardHTML).join(''):empty;
    $('#ranking-note').textContent=state.sort==='score'&&!isProvince()?'先看看不同省份的好天气，同省选择收在下方。':isProvince()?'正在浏览省内地点；灰色标记表示尚无完整天气。':'按所选条件直接排序，不限制同省数量。';
    $('#all-ranking-note').textContent=state.sort==='score'&&!isProvince()?'每轮各省先展示一个地点，轮内按天气匹配度排列。':isProvince()?'当前浏览省内目的地，按所选条件排序。':'按所选条件排序，不限制同省数量。';
    const seen=new Set();
    $('#province-alternatives').innerHTML=state.featured.filter(c=>{if(seen.has(c.code))return false;seen.add(c.code);return true;}).map(c=>{
      const others=state.ranked.filter(item=>item.code===c.code&&!state.featured.some(top=>top.id===item.id));
      if(!others.length||isProvince()||state.sort!=='score')return '';
      return `<details class="province-more"><summary>${escapeHTML(c.province)}还有 ${others.length} 个合拍地点 ${icon('chevron')}</summary><div>${others.map(item=>`<button data-open-city="${item.id}"><span>${escapeName(item)}</span><small>${item.score} 分 · ${item.goodHours}h 合拍</small>${icon('arrow')}</button>`).join('')}<button class="province-open" data-open-province="${c.code}">展开${escapeHTML(c.province)}天气地图 ${icon('pin')}</button></div></details>`;
    }).join('');
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
  function project(lon,lat) {
    if(!mapBounds)return [61+(lon-73)*12.15,32+(54-lat)*12.65];
    return [450+(lon-mapBounds.lon)*mapBounds.scale,280-(lat-mapBounds.lat)*mapBounds.scale];
  }
  function unproject(x,y) {return mapBounds?[mapBounds.lon+(x-450)/mapBounds.scale,mapBounds.lat-(y-280)/mapBounds.scale]:[73+(x-61)/12.15,54-(y-32)/12.65];}
  function configureMapBounds() {
    mapBounds=null;
    if(state.region==='all')return;
    const features=provinceFeatures.filter(f=>isProvince()?String(f.properties.adcode)===state.region:Places.regionFor(f.properties.adcode)===state.region);
    const points=[];
    for(const feature of features){
      const coordinates=feature.geometry.coordinates.flat(Infinity);
      for(let i=0;i<coordinates.length;i+=2)if(feature.properties.adcode!==460000||coordinates[i+1]>=17)points.push([coordinates[i],coordinates[i+1]]);
    }
    // Include sourced offshore county/city sampling points in their province's view.
    for(const city of cities)if(city.code===710000&&city.tier!=='custom'&&city.tier!=='preview'&&inScope(city))points.push([city.lon,city.lat]);
    if(!points.length)return;
    const focus=cityByID.get(state.focusCity);
    if(focus&&String(focus.code)===state.region&&![810000,820000].includes(focus.code)){mapBounds={lon:focus.lon,lat:focus.lat,scale:Math.min(500,400/1.4)};return;}
    const minLon=Math.min(...points.map(p=>p[0])),maxLon=Math.max(...points.map(p=>p[0])),minLat=Math.min(...points.map(p=>p[1])),maxLat=Math.max(...points.map(p=>p[1]));
    mapBounds={lon:(minLon+maxLon)/2,lat:(minLat+maxLat)/2,scale:Math.min(650/Math.max(.08,maxLon-minLon),390/Math.max(.08,maxLat-minLat))};
  }
  function setScope(scope,load=true,focus=null) {
    const restoreFocus=!!document.activeElement.closest?.('.map-breadcrumb,#weather-map');
    if(scope!==state.region||focus!==state.focusCity)stopDiscoveryLoading();
    state.region=scope;state.focusCity=focus;state.zoom=1;state.panX=0;state.panY=0;state.picking=false;
    $('#region-filter').value=scope;configureMapBounds();initializeMap();getFilters();render();
    if(restoreFocus)$('#map-scope-name').focus({preventScroll:true});
    if(load&&(isProvince()||state.discovery==='all'))ensureWeather(discoveryPlaces().map(c=>c.id));
  }
  function focusCity(id) {const city=cityByID.get(id);if(!city)return;closeAllDialogs();setScope(String(city.code),true,id);$('.map-panel').scrollIntoView({behavior:'smooth',block:'start'});}
  function openMapCity(id) {
    const city=cityByID.get(id);if(!city)return;
    // A surrounding city changes the map, but only its own weather is requested.
    if(isProvince()&&!inScope(city))setScope(String(city.code),false,id);
    openCity(id);
  }
  function renderMapBreadcrumb() {
    const focused=$('#map-scope-parents').contains(document.activeElement)?document.activeElement.dataset.mapScope:null;
    const parents=[];
    if(isProvince()){
      const region=Places.regionFor(Number(state.region));
      parents.push([region,region]);
      if(state.focusCity)parents.push([state.region,Places.shortNames[state.region]]);
    }
    $('#map-scope-parents').innerHTML=parents.map(([scope,name])=>`<span class="map-parent"><button type="button" data-map-scope="${escapeHTML(scope)}" aria-label="返回${escapeHTML(name)}地图">${escapeHTML(name)}</button></span>`).join('');
    if(focused)$(`[data-map-scope="${focused}"]`)?.focus({preventScroll:true});
    $('#map-scope-name').textContent=state.focusCity&&cityByID.has(state.focusCity)?`${cityByID.get(state.focusCity).name}附近`:isProvince()?Places.shortNames[state.region]:state.region==='all'?'精选目的地':state.region;
  }
  function toggleMapPick() {state.picking=!state.picking;renderMap();if(state.picking)toast('在地图上点击一个位置，再确认名称和坐标。');}

  function geometryPath(geometry,projection=project) {
    const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:geometry.type==='Polygon'?[geometry.coordinates]:[];
    return polygons.map(p=>p.map(ring=>ring.map(([lon,lat],i)=>{const [x,y]=projection(lon,lat);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join('')+'Z').join('')).join('');
  }
  function renderSubdivisions() {
    const code=state.region,group=$('#subdivision-lines'),note=$('#map-subdivision-note');
    group.replaceChildren();note.hidden=true;
    $('#scope-land-path').setAttribute('d','');
    if(!isProvince())return;
    if(!subdivisionLoads.has(code)){
      subdivisionLoads.set(code,fetch(`assets/subdivisions/${code}.json`).then(response=>{
        if(!response.ok)throw new Error('Boundary unavailable');
        return response.json();
      }).then(data=>data.province===Number(code)&&Array.isArray(data.lines)?data:null).catch(()=>null));
    }
    subdivisionLoads.get(code).then(data=>{
      if(state.region!==code||!data?.lines.length)return;
      const feature=provinceFeatures.find(f=>String(f.properties.adcode)===code);
      $('#scope-land-path').setAttribute('d',geometryPath(feature.geometry));
      const path=data.lines.map(line=>line.map(([lon,lat],index)=>{
        const [x,y]=project(lon,lat);return `${index?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join('')).join('');
      group.innerHTML=`<path class="subdivision-line" d="${path}"/>`;
      note.hidden=false;
    });
  }
  function initializeMap() {
    const features=provinceFeatures;
    if(!features.length){$('#map-container').innerHTML='<div class="empty-results">地图资源未加载，请刷新页面。城市推荐仍可使用。</div>';return;}
    $('#province-hover').replaceChildren();
    $('#province-paths').innerHTML=features.map(f=>`<path class="province" data-province="${f.properties.adcode||0}" d="${geometryPath(f.geometry)}" fill="#e7edde" tabindex="0" role="button" aria-label="查看${escapeHTML(f.properties.name||'中国南海诸岛')}地图"><title>${escapeHTML(f.properties.name||'中国南海诸岛')}</title></path>`).join('');
    const labels=[['新疆',84.2,40.4],['西藏',86.5,31.3],['青海',95,35.5],['内蒙古',113.8,43.5],['黑龙江',128,48.4],['四川',101.9,28.5],['甘肃',98.4,39.6],['台湾',122.6,23.3]];
    $('#province-labels').innerHTML=labels.map(([text,lon,lat])=>{const [x,y]=project(lon,lat);return `<text class="province-label" x="${x}" y="${y}" text-anchor="middle">${text}</text>`;}).join('');
    const islandProjection=(lon,lat)=>[774+(lon-106)*5.2,377+(24-lat)*5.7];
    $('#island-inset').innerHTML=`<rect class="inset-border" x="771" y="372" width="96" height="132" rx="4"/><g clip-path="url(#inset-clip)">${features.filter(f=>[460000,'100000_JD'].includes(f.properties.adcode)).map(f=>`<path class="inset-province" d="${geometryPath(f.geometry,islandProjection)}"/>`).join('')}</g><rect x="772" y="489" width="94" height="14" fill="#fbfcf9"/><text x="819" y="499" text-anchor="middle" class="inset-title">南海诸岛</text>`;
    renderSubdivisions();
  }
  function renderMapTimeline() {
    const dates=dateRange(state.start,state.end);
    if(!dates.includes(state.mapDate))state.mapDate=null;
    const tabs=$('#map-date-tabs'),scroll=tabs.scrollLeft;
    const focused=tabs.contains(document.activeElement)?document.activeElement.dataset.mapDate:undefined;
    tabs.innerHTML=`<button type="button" data-map-date="" aria-pressed="${!state.mapDate}"><strong>整段行程</strong><small>${dates.length} 天概览</small></button>`+dates.map(date=>`<button type="button" data-map-date="${date}" aria-pressed="${state.mapDate===date}"><strong>${shortDate(date)}</strong><small>周${['日','一','二','三','四','五','六'][parseDate(date).getDay()]}</small></button>`).join('');
    tabs.scrollLeft=scroll;
    if(focused!==undefined)(tabs.querySelector(`[data-map-date="${focused}"]`)||tabs.querySelector('[data-map-date=""]')).focus({preventScroll:true});
    $('#map-preview-note').textContent=state.mapDate?`仅预览地图 · 推荐仍按 ${shortDate(state.start)}–${shortDate(state.end)}`:'整段行程概览 · 点击日期看当天';
    $('#map-date-label').textContent=state.mapDate?`${shortDate(state.mapDate)} · 单日`:`${shortDate(state.start)} – ${shortDate(state.end)}`;
    $('#map-mode-label').textContent=`${state.hourStart}–${state.hourEnd} 时 · ${preferences[state.preference].mapLabel}`;
    $('#map-subtitle').textContent=state.mode==='demo'?'演示模式 · 仅供体验，不用于行程决策':`${state.mapDate?formatDate(state.mapDate):dates.length+' 天'}的白昼合拍小时概览 · 省份着色仅代表采样城市`;
  }
  function setMapDate(date) {
    if(date&&!dateRange(state.start,state.end).includes(date))return;
    state.mapDate=date||null;renderMap();
    const button=$(`[data-map-date="${date||''}"]`),tabs=$('#map-date-tabs');
    button.focus({preventScroll:true});
    const box=button.getBoundingClientRect(),strip=tabs.getBoundingClientRect();
    if(box.left<strip.left)tabs.scrollLeft-=strip.left-box.left;
    else if(box.right>strip.right)tabs.scrollLeft+=box.right-strip.right;
  }
  function renderMap() {
    if(!$('#city-markers'))return;
    renderMapTimeline();
    const sources=isProvince()?state.allRanked:state.candidates;
    let mapCities=state.mapDate?sources.map(c=>assess(c,[state.mapDate])):[...sources];
    if(isProvince()){
      const known=new Set(mapCities.map(c=>c.id));
      const surrounding=cities.filter(c=>{
        if(c.tier==='preview'||inScope(c)||known.has(c.id))return false;
        const [x,y]=project(c.lon,c.lat);return x>=25&&x<=830&&y>=55&&y<=500;
      });
      mapCities=[...mapCities,...surrounding.map(c=>assess(c,state.mapDate?[state.mapDate]:undefined))];
    }
    state.mapRanked=mapCities;
    $('#map-tooltip').hidden=true;
    const pref=preferences[state.preference];
    $('#map-pick').setAttribute('aria-pressed',String(state.picking));
    $('#map-container').classList.toggle('picking',state.picking);
    renderMapBreadcrumb();
    $('#map-special-regions').hidden=!['all','华南','440000','810000','820000'].includes(state.region);
    $$('[data-map-shortcut]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mapShortcut===state.region)));
    $('#map-scope-note').textContent=state.picking?'点击地图选取近似位置，再核对坐标。可先选择省份或城市，放大后更容易定位。':isProvince()?`${cities.filter(c=>String(c.code)===state.region).length} 个已收录地点 · ${pendingIDs.size?'正在按需更新天气':'位置为城市/地区采样点，不代表整个区域天气'}`:state.discovery==='all'?`全国收录地点概览 · 正在当前 ${state.candidates.length} 个候选中比较，未取得完整预报的地点不参与推荐。`:`全国按固定精选范围显示，本地索引 ${cities.length} 个地点；展开省份可查当地全部地点。`;
    const scopeCities=isProvince()?mapCities.filter(inScope):[];
    const scopeMissing=scopeCities.filter(c=>!c.complete);
    $('#retry-scope-weather').hidden=!isProvince()||!scopeMissing.length||state.mode==='demo';
    $('#retry-scope-weather').disabled=state.loading;
    if(isProvince()&&!state.picking){
      const loading=scopeCities.filter(c=>pendingIDs.has(c.id)).length,failed=scopeMissing.filter(c=>failedIDs.has(c.id)).length;
      const partial=scopeMissing.filter(c=>!pendingIDs.has(c.id)&&!failedIDs.has(c.id)).length;
      $('#map-scope-note').textContent=`${scopeCities.length} 个已收录地点 · ${scopeCities.length-scopeMissing.length} 个所选时段预报完整${loading?` · ${loading} 个查询中`:''}${failed?` · ${failed} 个获取失败`:''}${partial?` · ${partial} 个日期或小时不全`:''}`;
    }
    if(!state.picking&&state.region!=='all'&&!isProvince())$('#map-scope-note').textContent=`已放大至${state.region} · 可继续点击省份查看当地天气，或搜索具体地点。`;
    if(!state.picking&&isProvince())$('#map-scope-note').textContent+=' · 周边省份和地点可点击切换，未查询地点按需获取天气';
    $('#province-labels').style.display=state.region==='all'?'':'none';
    $('#island-inset').style.display=state.region==='all'?'':'none';
    $$('.province').forEach(path=>{
      const code=Number(path.dataset.province);
      const samples=mapCities.filter(c=>c.code===code&&c.complete);
      const ratio=samples.length?samples.reduce((sum,c)=>sum+(c.hazardous?0:c.goodHours/(c.availableHours||1)),0)/samples.length:0;
      path.setAttribute('fill',samples.length?provinceColor(ratio):'#eef1ed');
      path.style.opacity=isProvince()?(String(code)===state.region?'1':'.4'):(state.region==='all'||Places.regionFor(code)===state.region?'1':'.22');
      path.style.pointerEvents='';
    });
    let visible=mapCities.filter(c=>c.tier==='featured'&&(c.marker||c.capital));
    if(state.region==='all'&&state.discovery==='all')visible=mapCities;
    if(state.region!=='all')visible=isProvince()?[...mapCities.filter(inScope),...mapCities.filter(c=>!inScope(c))]:mapCities.filter(inScope);
    const top=mapCities.find(c=>c.id===state.focusCity)||(state.mapDate?mapCities.filter(c=>c.eligible&&inScope(c)&&(!state.hideVisited||!state.visited[c.id])).sort(sortCities)[0]:state.featured[0]);
    const originBase=cityByID.get(state.origin),origin=originBase?assess(originBase,state.mapDate?[state.mapDate]:undefined):null;
    if(origin&&!mapCities.some(c=>c.id===origin.id)){mapCities.push(origin);state.mapRanked=mapCities;}
    if(origin&&!visible.some(c=>c.id===origin.id))visible.push(origin);
    if(top&&!visible.some(c=>c.id===top.id))visible.push(top);
    const selectedTop=top?visible.find(c=>c.id===top.id):null;
    const markerScale=$('#map-container').clientWidth<500?1.45:1;
    const occupied=[];
    const layout=[];
    const ranked=state.mapDate?mapCities.filter(c=>c.eligible&&inScope(c)&&(!state.hideVisited||!state.visited[c.id])).sort(sortCities):state.ranked;
    const priority=new Map(ranked.map((c,index)=>[c.id,index]));
    const ordered=[...visible].sort((a,b)=>Number(b===selectedTop)-Number(a===selectedTop)
      ||Number(inScope(b))-Number(inScope(a))
      ||(priority.get(a.id)??10000)-(priority.get(b.id)??10000)
      ||Number(b.id===state.origin)-Number(a.id===state.origin)
      ||Number(b.capital)-Number(a.capital)||Number(b.tier==='featured')-Number(a.tier==='featured')||a.index-b.index);
    // Keep full-label placement stable when optional crowded-location points toggle.
    for(const city of ordered){
      const [x,y]=project(city.lon,city.lat),isTop=city.id===top?.id;
      if(x<44||x>830||y<55||y>500)continue;
      const labelWidth=Math.min(city.name.length,9)*13+36;
      const preferredSide=city.id==='hohhot'?'left':'right';
      const sides=isTop?['right']:[preferredSide,preferredSide==='left'?'right':'left'];
      let placed=false;
      for(const dy of isTop?[0]:[0,-30,30,-60,60]){
        for(const side of sides){
        const left=isTop?-18:side==='left'?15-labelWidth:-15;
        const width=isTop?(Math.min(city.name.length,9)*13+80):labelWidth;
        const box={left:x+left*markerScale,right:x+(left+width)*markerScale,top:y+Math.min(-18,dy-18)*markerScale,bottom:y+Math.max(isTop?24:20,dy+20)*markerScale};
        if(box.left<33||box.right>866||box.top<15||box.bottom>531)continue;
        if(occupied.some(b=>box.left<b.right+4&&box.right>b.left-4&&box.top<b.bottom+4&&box.bottom>b.top-4))continue;
        occupied.push(box);layout.push({city,x,y,isTop,side,left,width,dy});placed=true;break;
        }
        if(placed)break;
      }
      // Crowding changes label detail, never removes the location itself.
      if(!placed){layout.push({city,x,y,isTop:false,compact:true});occupied.push({left:x-9*markerScale,right:x+9*markerScale,top:y-9*markerScale,bottom:y+9*markerScale});}
    }
    layout.sort((a,b)=>Number(a.isTop)-Number(b.isTop)||Number(!!a.compact)-Number(!!b.compact));
    const showExtraPoints=$('#map-extra-points').checked;
    $('#map-marker-note').hidden=!showExtraPoints||!layout.some(item=>item.compact);
    $('#city-markers').innerHTML=layout.filter(item=>showExtraPoints||!item.compact).map(({city,x,y,isTop,side,left,width,dy=0,compact=false})=>{
      const sample=city.days.flatMap(d=>d.matching)[0]||city.days.flatMap(d=>d.daylight)[0];
      const info=sample?weatherInfo(sample.code):{name:'暂无数据',icon:'cloud'};
      const temp=city.complete?`${round(city.mean)}°`:'—';
      const labelName=city.name.length>9?city.name.slice(0,8)+'…':city.name;
      const labelX=side==='left'?-18:18,anchor=side==='left'?'end':'start';
      const ico=`<svg class="map-weather-icon" x="-9" y="-9" width="18" height="18" style="color:${info.icon==='snow'?'#84a8bd':info.icon==='rain'?'#8ca6b4':'#cfaa50'};stroke:currentColor"><use href="#i-${info.icon}"/></svg>`;
      const body=compact?`<circle class="compact-hit" r="12"/><circle class="compact-dot ${city.complete?'has-weather':''}" r="5.5"/><title>${escapeHTML(city.name)} · ${city.complete?round(city.mean)+'°C':escapeHTML(forecastStatus(city))}</title>`:isTop?`<rect class="marker-highlight" x="-18" y="-18" width="${width}" height="37" rx="7" filter="url(#marker-shadow)"/><path d="M-3 18 3 24 9 18" fill="#24866a"/><circle r="12" fill="#ffffff20"/>${ico}<text class="highlight-label" x="17" y="4">${escapeHTML(labelName)}</text><text class="highlight-temp" x="${Math.min(city.name.length,9)*13+29}" y="4">${temp}</text>`:`<rect x="${left}" y="${Math.min(-18,dy-18)}" width="${width}" height="${38+Math.abs(dy)}" rx="5" fill="transparent" pointer-events="all"/>${dy?`<path class="marker-leader" d="M0 0 L${labelX} ${dy}"/>`:''}<circle class="marker-dot" r="13"/>${ico}<text x="${labelX}" y="${dy-1}" text-anchor="${anchor}">${escapeHTML(labelName)}</text><text class="city-temp" x="${labelX}" y="${dy+14}" text-anchor="${anchor}">${temp}</text>`;
      return `<g class="map-city ${compact?'compact-marker':''} ${isProvince()&&!inScope(city)?'nearby-marker':''} ${isTop?'top-match':''} ${city.id===state.origin?'origin-marker':''} ${state.visited[city.id]?'visited-marker':''}" data-map-city="${city.id}" tabindex="0" role="button" aria-label="${escapeHTML(city.name)}，${city.complete?info.name+'，平均最高温'+round(city.mean)+'摄氏度':escapeHTML(forecastStatus(city))}，${isProvince()&&!inScope(city)?'切换到'+escapeHTML(city.province)+'并查看详情':'点击查看详情'}" transform="translate(${x},${y}) scale(${markerScale})">${body}</g>`;
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
      return `<article class="visited-card"><div class="visited-card-heading"><button data-open-city="${id}">${escapeHTML(city.name)}<span> · ${escapeHTML(city.province)}</span></button><span>${icon('check')}</span></div><textarea data-visit-note="${id}" maxlength="300" rows="2" aria-label="${escapeHTML(city.name)}旅行笔记" placeholder="留下一点旅行的记忆…">${escapeHTML(entry.note||'')}</textarea><div class="visited-card-footer"><span>${escapeHTML(entry.savedAt)} 记录 · 笔记自动保存</span><button data-visit="${id}">${icon('refresh')}移回推荐</button></div></article>`;
    }).join(''):`<div class="visited-empty">${icon('footprints')}旅途的故事，从第一次出发开始。<br>在目的地卡片上点击「去过了」，就能在这里保存足迹。</div>`;
    if(!storageAvailable)$('.local-note').innerHTML=`${icon('info')}浏览器存储不可用，当前足迹仅保留到此页面关闭。`;
  }

  function hourlyNote(day,h) {
    if(!h || !Weather.validHour(h))return '这一小时的预报不完整，暂不计入推荐。';
    return `${shortDate(day.date)} ${String(h.hour).padStart(2,'0')}:00–${String(h.hour+1).padStart(2,'0')}:00 · ${weatherInfo(h.code).name} · 体感 ${round(h.feels)}°C · 降水 ${h.precip.toFixed(1)} mm · 阵风 ${round(h.gust)} km/h${h.isDay?'':' · 非白昼，不计入合拍小时'}`;
  }
  function dayPlanHTML(day) {
    const first=day.requestedStart??state.hourStart;
    const slots=[];
    for(let hour=first;hour<state.hourEnd;hour++){
      const h=day.hours.find(slot=>slot.hour===hour),valid=Weather.validHour(h),match=valid&&Weather.matchesHour(h,state.preference);
      slots.push(`<button class="hour-slot ${match?'matched':!valid?'missing':!h.isDay?'night':''}" data-hour-note="${escapeHTML(hourlyNote(day,h))}" aria-label="${escapeHTML(hourlyNote(day,h))}" aria-pressed="false"><span>${String(hour).padStart(2,'0')}</span>${icon(valid?weatherInfo(h.code).icon:'info')}</button>`);
    }
    return `<section class="day-plan"><div class="day-plan-heading"><strong>${formatDate(day.date)}<small>周${['日','一','二','三','四','五','六'][parseDate(day.date).getDay()]}</small></strong><span>${day.complete?`${day.matchedHours} / ${day.availableHours}h 合拍`:'小时预报不完整'}</span></div><div class="hour-strip">${slots.join('')||'<p class="hour-detail-line">今天所选的活动时段已结束。</p>'}</div><p class="hour-detail-line" aria-live="polite">${day.best?`最长连续时段 ${String(day.best.start).padStart(2,'0')}:00–${String(day.best.end).padStart(2,'0')}:00 · 点击小时查看详情`:'这一天暂无连续合拍时段 · 点击小时查看详情'}</p></section>`;
  }
  function departureSectionHTML() {
    return `<details id="departure-options" class="departure-options" ${state.departureOpen?'open':''}>
      <summary><span>${icon('calendar')}日期还没定？找一段更合拍的天气</span>${icon('chevron')}</summary>
      <div class="departure-body"><div class="departure-controls"><label for="departure-duration">想玩几天</label><select id="departure-duration">${Array.from({length:16},(_,i)=>`<option value="${i+1}" ${state.windowDuration===i+1?'selected':''}>${i+1} 天</option>`).join('')}</select></div>
      <p class="departure-rules">从明天起，沿用天气偏好、活动时段、温度与每日匹配条件，比较连续日期；这里仅比较此地点的天气，不限制出发地距离。</p>
      <p id="departure-summary" class="departure-summary"></p><div id="departure-results" class="departure-results" aria-live="polite"></div>
      <p class="departure-footnote">按天气分数、合拍小时、较早出发排序，最多展示 3 段互不重叠的候选。采用后会更新整站行程日期；不会自动保存地点或记录足迹。</p></div></details>`;
  }
  function departureAnalysis(id) {
    const base=cityByID.get(id);if(!base)return {windows:[],possible:0,complete:0,eligible:0};
    const fresh=state.mode==='demo'||(updatedAt.has(id)&&Date.now()-updatedAt.get(id)<CACHE_MAX_AGE);
    return Weather.departureWindows(base,fresh?state.data.get(id)||[]:[],{
      ...assessmentOptions(dateRange(addDays(today,1),lastForecastDate)),duration:state.windowDuration,origin:null,maxDistance:null
    });
  }
  function renderDepartureOptions() {
    const output=$('#departure-results'),base=cityByID.get(state.activeCity);if(!output||!base)return;
    const result=departureAnalysis(base.id);
    $('#departure-summary').textContent=`${dataLabel(base)}${updatedAt.has(base.id)?' · '+timeLabel(base)+' 更新':''} · ${result.complete} / ${result.possible} 段预报完整 · ${result.eligible} 段符合偏好`;
    if(!result.windows.length){
      const message=pendingIDs.has(base.id)?'正在获取此地点天气，请稍候。':!result.possible?'从明天起的预报范围不足以容纳这段行程，请缩短天数。':!result.complete?'现有预报不足以比较完整行程。可先重试此地点天气，或缩短天数。':'预报完整的日期中，暂时没有满足当前天气条件的连续行程。可以调整天数或天气偏好；缺失和恶劣天气日期不会被补齐或推荐。';
      output.innerHTML=`<p class="departure-empty">${message}</p>`;return;
    }
    output.innerHTML=result.windows.map((w,index)=>{
      const current=w.start===state.start&&w.end===state.end,far=w.end>addDays(today,7);
      return `<article class="departure-option"><div><span class="departure-label">${index===0?'天气最合拍':'其他可选日期'}${state.mode==='demo'?' · 示例':''}</span><strong>${formatDate(w.start)}${w.end===w.start?'':'—'+formatDate(w.end)}</strong><p>${w.score} 分 · ${w.goodHours} / ${w.availableHours}h 合拍 · ${w.matchCount} / ${w.expected} 天至少半程合拍</p><small>${far?'含 7 天以后的预报，先作候选，出发前再确认。':w.caution}</small></div><button type="button" data-use-departure-start="${w.start}" data-use-departure-end="${w.end}" ${current?'disabled':''}>${current?'当前行程':'用这段日期'}</button></article>`;
    }).join('');
  }
  function useDepartureDates(start,end) {
    const chosen=departureAnalysis(state.activeCity).windows.find(w=>w.start===start&&w.end===end);
    if(!chosen){renderDepartureOptions();toast('预报或条件已变化，请重新选择日期。');return;}
    const previousMapDate=state.mapDate,previousStart=$('#start-date').value,previousEnd=$('#end-date').value;state.mapDate=null;
    $('#start-date').value=start;$('#end-date').value=end;
    if(!applyFilters()){state.mapDate=previousMapDate;$('#start-date').value=previousStart;$('#end-date').value=previousEnd;toast('请先修正主页面的筛选条件。');return;}
    $$('[data-quick-date]').forEach(b=>b.classList.remove('active'));
    renderCityDialog(state.activeCity);
    const current=$(`[data-use-departure-start="${start}"]`);current?.closest('article').scrollIntoView({block:'nearest'});
    $('#departure-duration')?.focus({preventScroll:true});
    toast(`已将行程改为 ${formatDate(start)}—${formatDate(end)}${cityByID.get(state.activeCity)?.tier==='preview'?' · 地点尚未保存':''}`);
  }
  function renderCityDialog(id) {
    const base=cityByID.get(id);if(!base)return;
    const city=assess(base),pref=preferences[state.preference],isVisited=!!state.visited[id],demo=state.mode==='demo',preview=base.tier==='preview';
    const rowData=new Map(city.days.map(day=>[day.date,day]));
    const rows=dateRange(state.start,state.end).map(date=>{
      const day=rowData.get(date),weekday=['日','一','二','三','四','五','六'][parseDate(date).getDay()];
      if(!day)return `<tr class="unavailable"><td>${shortDate(date)} 周${weekday}</td><td colspan="5">此日期暂无完整预报</td></tr>`;
      const info=weatherInfo(day.code);
      return `<tr class="${isHazard(day)?'hazardous':''}"><td>${shortDate(date)} 周${weekday}</td><td>${icon(info.icon)}${info.name}</td><td>${round(day.min)}–${round(day.max)}°</td><td>${round(day.rainProbability)}%</td><td>${day.snow>0?`${day.snow.toFixed(1)} cm 雪`:`${day.precip.toFixed(1)} mm`}</td><td>${round(day.wind)} / ${round(day.gust)}</td></tr>`;
    }).join('');
    const dailyPlans=dateRange(state.start,state.end).map(date=>rowData.has(date)?dayPlanHTML(rowData.get(date)):`<div class="day-plan"><strong>${formatDate(date)}</strong><p class="hour-detail-line">暂无此日完整预报</p></div>`).join('');
    const score=city.score===null?'—':city.score;
    const farDate=(parseDate(state.end)-parseDate(today))/86400000>7;
    $('#city-dialog-content').innerHTML=`<button class="dialog-close icon-button" data-close-dialog aria-label="关闭天气详情">${icon('close')}</button><div class="city-dialog-hero">${placeVisual(city,true)}<div class="city-dialog-title"><h2>${escapeHTML(city.name)}</h2><p>${escapeHTML(city.province)} · ${escapeHTML(city.region)}${state.origin?' / '+distanceText(city):''}</p></div><span class="dialog-image-note">${imageNote(city)}</span></div><div class="city-dialog-body">${photoDetails(city)}<p class="city-detail-intro">${escapeHTML(city.description)||'按这个地点的坐标查询天气，让每一处想去的地方都有自己的出发时机。'}</p><div class="place-detail-tools">${preview?`<span class="preview-badge">临时预览 · 尚未保存</span>`:`<button data-focus-city="${city.id}">${icon('pin')}在地图上查看</button><button data-origin-city="${city.id}">设为出发地</button><button data-explore-attractions>旅行灵感</button>`}<span>${city.lat.toFixed(4)}° N, ${city.lon.toFixed(4)}° E</span></div><div class="place-fetch-status">${pendingIDs.has(city.id)?'正在获取此地点的预报…':failedIDs.has(city.id)?`此地点天气获取失败（${escapeHTML(failureReasons.get(city.id)||'连接未成功')}），可稍后重试。`:!city.complete&&state.data.has(city.id)?'已取得部分预报，所选日期或小时数据不全，暂不参与推荐。':''}${!city.complete&&state.mode!=='demo'?`<button data-fetch-city="${city.id}">重新获取此地点</button>`:''}</div><div class="city-detail-badges">${city.hazardous?`<span class="detail-badge warning">${icon('shield')}有恶劣天气 · 不纳入推荐</span>`:''}${!city.complete?'<span class="detail-badge warning">所选时段预报不完整</span>':''}${demo?'<span class="detail-badge warning">示例数据 · 非真实预报</span>':''}${dataLabel(city)==='缓存预报'?'<span class="detail-badge warning">缓存预报 · 留意更新时间</span>':''}${state.origin&&!city.distanceOK?'<span class="detail-badge warning">当前出发地或超出距离范围</span>':''}</div><div class="detail-metrics"><div><strong>${city.complete?city.goodHours:'—'}<small>h</small></strong><span>合拍 / ${city.complete?city.availableHours:'—'}h 白昼</span></div><div><strong>${city.complete?(city.best?.length||0):'—'}<small>h</small></strong><span>最长连续合拍</span></div><div><strong>${score}<small>分</small></strong><span>天气匹配度</span></div></div>${city.complete?`<div class="best-window"><span>${icon(pref.icon)}这一段，最值得出去走走</span><strong>${windowText(city.best)}</strong><p>${city.caution}</p></div><details class="score-explanation"><summary>为什么是 ${score} 分？<span>查看评分依据 ${icon('chevron')}</span></summary><div class="score-parts">${city.breakdown.map(part=>`<div><span>${part.label}<small>${part.detail}</small></span><strong>${part.points} / ${part.max}</strong><meter min="0" max="${part.max}" value="${part.points}" aria-label="${part.label} ${part.points} 分，满分 ${part.max}"></meter></div>`).join('')}</div><p>满分 100 分，用于比较天气匹配程度，不表示天气发生概率。距离单独筛选，不参与天气分数。</p></details>`:''}<p class="detail-trip-period">当前行程：${formatDate(state.start)}—${formatDate(state.end)}${state.mapDate?' · 地图单日预览不改变此行程':''}</p><div class="hourly-heading"><h3>每天，什么时候适合出门</h3><span><i></i>合拍 <i class="neutral"></i>未匹配</span></div><p class="detail-data-label">${state.hourStart}:00–${state.hourEnd}:00 · 仅统计白昼 · ${dataLabel(city)}${updatedAt.has(city.id)?' · '+timeLabel(city)+' 更新':''}</p><div class="day-plans">${dailyPlans}</div><details class="daily-details"><summary>查看全天预报，含夜间天气 ${icon('chevron')}</summary><div class="forecast-scroll"><table class="forecast-table"><thead><tr><th>日期</th><th>全天概况</th><th>最低–最高温</th><th>降水概率</th><th>雨 / 雪量</th><th>风 / 阵风 km/h</th></tr></thead><tbody>${rows}</tbody></table></div></details>${departureSectionHTML()}<p class="detail-safety">${farDate?'行程包含 7 天以后的日期，建议先列为候选，临近出发时再确认。 ':''}${city.hazardous?'所选日期有强风、强雨雪、冻雨或雷暴等天气，已从推荐中排除。':state.preference==='snow'?'降雪不代表已有积雪或雪场开放，请单独核实山地和道路状况。':'城市预报无法覆盖所有景区，出发前请核实当地预警与开放信息。'} ${demo?'当前为示例数据，请勿据此安排行程。':'小时数是小时级估算，天气发生时间可能变化。'}</p><div class="city-dialog-actions">${preview?`<button class="secondary-button" data-close-dialog>暂不保存</button><button class="primary-button" data-save-preview="${id}">保存这个地点</button>`:`<button class="secondary-button" data-compare="${id}" aria-pressed="${state.compare.includes(id)}">${icon(state.compare.includes(id)?'check':'sliders')}${state.compare.includes(id)?'已选对比':'加入目的地对比'}</button><button class="primary-button" data-visit="${id}">${icon(isVisited?'refresh':'footprints')}${isVisited?'移回待探索':'去过了，保存足迹'}</button>`}</div><div id="attraction-panel"></div></div>`;
    if(state.departureOpen)renderDepartureOptions();
    Attractions.mount($('#attraction-panel'),base,{complete:city.complete,hazardous:city.hazardous,goodHours:city.goodHours,preference:state.preference,demo});
  }
  function toggleCompare(id) {
    if(!cityByID.has(id))return;
    const selected=state.compare.includes(id);
    if(selected)state.compare=state.compare.filter(item=>item!==id);
    else if(state.compare.length>=3){toast('一次最多比较 3 个目的地，先移除一个再加入。');return;}
    else state.compare.push(id);
    renderRecommendations();renderCompareTray();
    if($('#compare-dialog').open)renderCompareDialog();
    if($('#city-dialog').open&&state.activeCity)renderCityDialog(state.activeCity);
    if(!selected)toast(`已加入${escapeHTML(cityByID.get(id).name)}，${state.compare.length<2?'再选一个就能比较':'可以打开对比了'}`);
  }
  function renderCompareTray() {
    const tray=$('#compare-tray');tray.hidden=state.compare.length===0;
    document.body.classList.toggle('has-comparison',state.compare.length>0);
    tray.innerHTML=`<div class="compare-tray-copy"><strong>${icon('sliders')}一起比一比<small>${state.compare.length} / 3</small></strong><div class="compare-chips">${state.compare.map(id=>`<span>${escapeHTML(cityByID.get(id).name)}<button data-compare="${id}" aria-label="移除${escapeHTML(cityByID.get(id).name)}对比">${icon('close')}</button></span>`).join('')}</div></div><div class="compare-tray-actions"><button class="text-button" data-clear-compare>清空</button><button class="primary-button" data-open-compare ${state.compare.length<2?'disabled':''}>${state.compare.length<2?'再选一个目的地':'开始对比'}${icon('arrow')}</button></div>`;
  }
  function renderCompareDialog() {
    const compared=state.compare.map(id=>assess(cityByID.get(id)));
    const rows=[
      ['天气匹配度',c=>c.score===null?'暂无完整预报':`<strong class="comparison-score">${c.score}<small> 分</small></strong>`],
      ['天气更新时间',c=>updatedAt.has(c.id)?timeLabel(c):dataLabel(c)],
      ['日间合拍小时',c=>c.complete?`${c.goodHours} / ${c.availableHours} 小时`:'预报不完整'],
      ['至少半程合拍',c=>c.complete?`${c.matchCount} / ${c.expected} 天`:'—'],
      ['最长连续时段',c=>c.complete&&c.best?`${windowText(c.best)}<small>连续 ${c.best.length} 小时</small>`:'—'],
      ['日间平均体感',c=>c.complete?`${round(c.meanFeels)}°C`:'—'],
      [state.origin?'从'+cityByID.get(state.origin).name+'出发':'出发地距离',c=>distanceText(c)],
      ['需要留意',c=>escapeHTML(c.caution)],
      ['当前筛选',c=>`<span class="comparison-status ${c.eligible?'good':'warning'}">${c.hazardous?'有恶劣天气，已排除':!c.complete?'数据不完整':!c.eligible?'不满足当前筛选':state.hideVisited&&state.visited[c.id]?'已去过，默认收起':!inScope(c)?'不在所选地区':'符合当前偏好'}</span>`],
      ['详细预报',c=>`<button class="text-button" data-open-city="${c.id}">查看逐小时天气 ${icon('arrow')}</button>`]
    ];
    $('#compare-dialog-content').innerHTML=`<button class="dialog-close icon-button" data-close-dialog aria-label="关闭目的地对比">${icon('close')}</button><div class="comparison-heading"><span class="eyebrow">找到更合拍的那一站</span><h2>把心动的地方，放在一起看看。</h2><p>${formatDate(state.start)}—${formatDate(state.end)} · 每天 ${state.hourStart}–${state.hourEnd} 时 · ${dataLabel()}${state.lastUpdated?' · '+timeLabel()+' 更新':''}</p>${state.mode==='demo'?'<p class="comparison-demo">演示模式 · 所有数值均为示例</p>':''}</div>${compared.length?`<div class="comparison-scroll"><table class="comparison-table"><caption class="sr-only">当前选择的目的地天气对比</caption><thead><tr><th scope="col">这次旅行</th>${compared.map(c=>`<th scope="col"><button class="comparison-remove" data-compare="${c.id}" aria-label="移除${escapeHTML(c.name)}对比">${icon('close')}</button>${placeVisual(c)}<strong>${escapeHTML(c.name)}</strong><small>${escapeHTML(c.province)} · ${escapeHTML(c.region)}</small></th>`).join('')}</tr></thead><tbody>${rows.map(([name,value])=>`<tr><th scope="row">${name}</th>${compared.map(c=>`<td>${value(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<div class="empty-results">还没有选择目的地。关闭此窗口，在卡片上加入对比。</div>'}<p class="comparison-footnote">按相同日期与活动时段比较；分数是匹配程度，距离为直线距离。修改筛选后，已选目的地仍保留，并重新计算。窄屏可左右滑动查看完整对比。</p>`;
  }
  function openCity(id) {if(!cityByID.has(id))return;requestedIDs.add(id);closeAllDialogs(id);state.activeCity=id;state.departureOpen=false;state.windowDuration=dateRange(state.start,state.end).length;renderCityDialog(id);showDialog($('#city-dialog'));ensureWeather([id]);}
  function lockPageScroll(){
    if(pageScrollLock)return;
    const body=document.body;
    pageScrollLock={x:window.scrollX,y:window.scrollY,style:body.style.cssText};
    body.style.position='fixed';body.style.top=`-${pageScrollLock.y}px`;body.style.left=`-${pageScrollLock.x}px`;
    body.style.width='100%';body.style.overflow='hidden';
    document.documentElement.classList.add('modal-open');body.classList.add('modal-open');
  }
  function unlockPageScroll(){
    if(document.querySelector('dialog[open]')||!pageScrollLock)return;
    const saved=pageScrollLock;pageScrollLock=null;document.body.style.cssText=saved.style;
    document.documentElement.classList.remove('modal-open');document.body.classList.remove('modal-open');
    const behavior=document.documentElement.style.scrollBehavior;document.documentElement.style.scrollBehavior='auto';
    window.scrollTo(saved.x,saved.y);document.documentElement.style.scrollBehavior=behavior;
  }
  function updateVisualViewport(){
    const viewport=window.visualViewport;
    document.documentElement.style.setProperty('--visual-height',`${viewport?.height||window.innerHeight}px`);
    document.documentElement.style.setProperty('--visual-top',`${viewport?.offsetTop||0}px`);
  }
  function showDialog(dialog) {lockPageScroll();updateVisualViewport();dialog.showModal();}
  function closeAllDialogs(keepPreview=null) {Attractions.close();clearTimeout(searchTimer);searchController?.abort();searchGeneration++;backupGeneration++;backupPending=null;$$('dialog[open]').forEach(d=>d.close());discardPreviews(keepPreview);unlockPageScroll();}
  function discardPreviews(keep=null) {
    for(let i=cities.length-1;i>=0;i--){const city=cities[i];if(city.tier!=='preview'||city.id===keep)continue;
      cities.splice(i,1);cityByID.delete(city.id);state.data.delete(city.id);updatedAt.delete(city.id);forecastBaseDates.delete(city.id);requestedIDs.delete(city.id);pendingIDs.delete(city.id);failedIDs.delete(city.id);failureReasons.delete(city.id);
      if(state.activeCity===city.id)state.activeCity=null;
    }
    state.lastUpdated=updatedAt.size?Math.min(...updatedAt.values()):null;
  }
  function showAbout(){closeAllDialogs();renderDataStatus();showDialog($('#about-dialog'));}
  function toast(message) {clearTimeout(state.toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;state.toastTimer=setTimeout(()=>{$('#toast').hidden=true;},4200);}
  function photoFor(city) {return window.SUNSEEK_CITY_IMAGES?.[city.id];}
  function imageNote(city) {
    const photo=photoFor(city);
    return photo?.kind==='real'?`实景照片 · ${escapeHTML(photo.subject)}`:city.image?'风景意境图 · 非对应城市实景':'地点示意 · 暂无实景配图';
  }
  function photoDetails(city) {
    const photo=photoFor(city);if(!photo)return '';
    return `<p class="city-photo-credit">摄影：${escapeHTML(photo.author)} · <a data-photo-link href="${escapeHTML(photo.source)}" target="_blank" rel="noopener noreferrer">照片来源</a> · <a data-photo-link href="${escapeHTML(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(photo.license)}</a><small>${escapeHTML(photo.changes)}照片为地点展示，不代表实时天气。</small></p>`;
  }
  function placeVisual(city,detail=false) {
    const placeholder=`<div class="place-placeholder" role="img" aria-label="地点示意，无实景图片">${icon('pin')}<span>${escapeHTML(city.province)}</span></div>`;
    const photo=photoFor(city),src=photo?(detail?photo.detail:photo.card):city.image?`assets/${city.image}.jpg`:null;
    if(!src)return placeholder;
    const attribution=photo&&!detail?`<span class="photo-attribution"><a data-photo-link href="${escapeHTML(photo.source)}" target="_blank" rel="noopener noreferrer" title="摄影：${escapeHTML(photo.author)} · 照片来源">${escapeHTML(photo.author)}</a><a data-photo-link href="${escapeHTML(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHTML(photo.license)} · 已裁剪压缩，沿用原许可">${escapeHTML(photo.license)}</a></span>`:'';
    return `<div class="place-visual">${placeholder}<img data-city-photo src="${escapeHTML(src)}" alt="${escapeHTML(photo?.alt||'旅行意境配图，非地点实景')}" loading="${detail?'eager':'lazy'}" decoding="async" style="object-position:${escapeHTML(photo?.position||'50% 50%')}">${attribution}</div>`;
  }
  function backupBasePlaces(){return cities.filter(c=>c.tier!=='custom'&&c.tier!=='preview');}
  function userRecords(){
    const places=cities.filter(c=>c.tier==='custom').map(c=>({id:c.id,name:c.name,lat:c.lat,lon:c.lon,code:c.code,timezone:c.timezone,source:c.source,geoId:c.geoId??null}));
    const footprints=Object.entries(state.visited).map(([placeId,entry])=>({placeId,note:entry.note,savedAt:entry.savedAt}));
    return Backup.validateData({places,footprints,wishlist:Attractions.snapshot(),preferences:{origin:state.origin,hourStart:state.hourStart,hourEnd:state.hourEnd,maxDistance:state.maxDistance}},backupBasePlaces());
  }
  function backupMessage(error){
    return ['SecurityError','QuotaExceededError'].includes(error?.name)?'浏览器当前无法保存数据，请检查存储权限或空间。导出备份仍可使用。':error?.message||'处理备份失败，请重新选择文件。';
  }
  function showBackupError(error){$('#backup-error').textContent=backupMessage(error);$('#backup-error').hidden=false;}
  function openBackup(){
    closeAllDialogs();$('#backup-file').value='';$('#backup-filename').textContent='';$('#backup-preview').hidden=true;$('#backup-confirm').disabled=true;
    $('#backup-use-preferences').checked=false;$('#backup-error').hidden=true;$('#backup-status').textContent='';
    try{
      const data=userRecords();
      $('#backup-current-summary').textContent=`${data.places.length} 个个人地点 · ${data.footprints.length} 条足迹 · ${data.wishlist.length} 项想去收藏`;
    }catch(error){showBackupError(error);}
    if(backupRecovery)showBackupError(new Error('上次导入未完整保存。请先下载当前页面保留的原数据备份，再关闭页面。'));
    showDialog($('#backup-dialog'));
  }
  function exportBackup(){
    try{
      const contents=Backup.encode(userRecords(),backupBasePlaces());
      const url=URL.createObjectURL(new Blob([contents],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`sunseek-backup-${localDate(new Date())}-${Date.now()}.json`;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      $('#backup-status').textContent='已生成备份文件，请在浏览器下载中查看。';
    }catch(error){showBackupError(error);}
  }
  async function readBackupFile(){
    const generation=++backupGeneration,file=$('#backup-file').files[0];backupPending=null;
    $('#backup-preview').hidden=true;$('#backup-confirm').disabled=true;$('#backup-error').hidden=true;$('#backup-status').textContent='';
    $('#backup-filename').textContent=file?.name||'';$('#backup-use-preferences').checked=false;
    if(!file)return;
    try{
      if(backupRecovery)throw new Error('请先导出当前页面保留的原数据备份，再重新打开页面。');
      if(file.size>Backup.MAX_BYTES)throw new Error('备份文件过大，最多支持 2 MB。');
      $('#backup-status').textContent='正在读取备份…';
      const text=await file.text();
      if(generation!==backupGeneration||!$('#backup-dialog').open)return;
      const incoming=Backup.parse(text,backupBasePlaces()),current=userRecords(),expected=Backup.storageSnapshot(localStorage);
      Backup.assertCurrentStorage(expected,current,backupBasePlaces());
      backupPending={incoming,current,expected};renderBackupPreview();
    }catch(error){if(generation===backupGeneration&&$('#backup-dialog').open){$('#backup-file').value='';$('#backup-status').textContent='';showBackupError(error);}}
  }
  function renderBackupPreview(){
    if(!backupPending)return;
    try{
      const {incoming,current}=backupPending;
      const plan=Backup.merge(current,incoming.data,backupBasePlaces(),$('#backup-use-preferences').checked);
      backupPending.plan=plan;
      const s=plan.stats;
      $('#backup-file-date').textContent='备份时间：'+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(new Date(incoming.exportedAt));
      $('#backup-import-summary').textContent=`将新增 ${s.places} 个个人地点、${s.footprints} 条足迹、${s.wishlist} 项收藏。`;
      $('#backup-conflicts').textContent=`${s.duplicates} 条已有记录不重复添加${s.conflicts?`，其中 ${s.conflicts} 条内容不同，保留本机版本`:''}。${s.remapped?`${s.remapped} 个同编号但位置不同的地点将另存，相关足迹与出发地一并关联。`:''}`;
      $('#backup-use-preferences').disabled=!incoming.data.preferences;
      const adopt=$('#backup-use-preferences').checked,p=adopt?plan.data.preferences:incoming.data.preferences;
      const locations=adopt?[...plan.data.places,...backupBasePlaces()]:[...incoming.data.places,...current.places,...backupBasePlaces()];
      $('#backup-preference-summary').textContent=p?`${adopt?'将采用':'备份偏好'}：${p.origin?locations.find(c=>c.id===p.origin)?.name||'已选地点':'未设置出发地'} · ${p.hourStart}:00–${p.hourEnd}:00 · ${p.maxDistance===null?'不限距离':p.maxDistance+' km 内'}`:'备份未包含出发偏好。';
      $('#backup-preview').hidden=false;$('#backup-confirm').disabled=!plan.changed;
      $('#backup-status').textContent=plan.changed?'确认后才会写入本机。':!adopt&&p?'没有可新增的记录；如需恢复出发偏好，可勾选上方选项。':'没有可新增的记录或偏好，无需重复导入。';
      $('#backup-error').hidden=true;
    }catch(error){$('#backup-confirm').disabled=true;$('#backup-status').textContent='';showBackupError(error);}
  }
  function importBackup(){
    if(!backupPending?.plan?.changed)return;
    try{
      if(JSON.stringify(userRecords())!==JSON.stringify(backupPending.current))throw new Error('本机记录已变化，请重新选择文件以更新预览。');
      const {data}=backupPending.plan;
      Backup.write(localStorage,data,backupPending.expected);
      for(const city of Places.restoreCustom(data.places))if(!cityByID.has(city.id)){city.index=cities.length;cities.push(city);cityByID.set(city.id,city);}
      state.visited=Object.fromEntries(data.footprints.map(f=>[f.placeId,{note:f.note,savedAt:f.savedAt}]));
      Attractions.restoreSaved(data.wishlist);
      const p=data.preferences;
      if(p){Object.assign(state,p);refreshOriginOptions();$('#origin-city').value=p.origin;$('#hour-start').value=String(p.hourStart);$('#hour-end').value=String(p.hourEnd);$('#max-distance').value=p.maxDistance===null?'':String(p.maxDistance);}
      render();closeAllDialogs();$('#backup-btn').focus({preventScroll:true});toast('旅行记录已合并到本机，已有记录保持原样。');
    }catch(error){
      if(error.recoveryNeeded){backupRecovery=true;backupPending=null;}
      $('#backup-file').value='';$('#backup-confirm').disabled=true;showBackupError(error);
    }
  }
  function searchEntities(extra=[]){
    const catalog=cities.filter(c=>c.tier!=='preview');
    const byGeo=new Map(catalog.filter(c=>c.geoId).map(c=>[c.geoId,c]));
    const byName=new Map(catalog.map(c=>[`${c.code}:${Search.normalize(c.fullName||c.name).replace(/市$/,'')}`,c]));
    const known=place=>{
      if(byGeo.has(place.geoId))return byGeo.get(place.geoId);
      const city=byName.get(`${place.code}:${Search.normalize(place.name).replace(/市$/,'')}`);
      return city&&(['ADM2','PPLC','PPLA','PPLA2','PPLA3'].includes(place.feature)||(['PPL',''].includes(place.feature)&&Weather.distanceKm(city,place)<5))?city:null;
    };
    const entities=catalog.map(c=>Search.prepare({...c,kind:'city',cityId:c.id,aliases:[...(c.aliases||[]),c.id],parents:[c.province,c.region]}));
    for(const place of [...searchAtlas,...extra]){
      const city=known(place);
      entities.push(city?{...place,kind:'city',cityId:city.id,queryName:city.name}:place);
    }
    for(const option of $('#region-filter').options){
      const province=Places.provinces.find(p=>String(p.code)===option.value);
      const fullName=provinceFeatures.find(f=>String(f.properties.adcode)===option.value)?.properties.name;
      entities.push(Search.prepare({kind:'scope',scope:option.value,name:option.textContent,aliases:fullName?[fullName]:[],parents:province?[province.region]:[],admin:province?`${province.region} · 省级地图`:option.value==='all'?'全国地图':'大区地图'}));
    }
    return entities;
  }
  function searchEntityKey(entity){
    return entity.kind==='city'?`city:${entity.cityId}`:entity.kind==='scope'?`scope:${entity.scope}`:`geo:${entity.geoId}`;
  }
  function uniqueSearchResults(entities,query){
    const ranked=Search.rank(entities,query,entities.length),seen=new Set();
    return ranked.filter(entity=>{const key=searchEntityKey(entity);if(seen.has(key))return false;seen.add(key);return true;});
  }
  function searchResultHTML(entity){
    if(entity.kind==='scope')return `<button class="search-result" ${Places.provinces.some(p=>String(p.code)===entity.scope)?`data-open-province="${entity.scope}"`:`data-select-region="${escapeHTML(entity.scope)}"`}><span>${icon('compass')}<span>${escapeHTML(entity.name)}<small>${escapeHTML(entity.admin)}</small></span></span><span>切换地图 ${icon('arrow')}</span></button>`;
    if(entity.kind==='city'){
      const city=cityByID.get(entity.cityId),assessment=assess(city);
      const admin=entity.admin||`${city.province} · ${city.tier==='featured'?'精选':city.tier==='custom'?'我的地点':'基础地点'}`;
      return `<button class="search-result" data-open-city="${city.id}"><span>${icon('pin')}<span>${escapeName(city)}<small>${escapeHTML(admin)}</small></span></span><span>${assessment.complete?`${round(assessment.min)}–${round(assessment.max)}°C`:'按需查天气'}</span></button>`;
    }
    const index=onlineCandidates.push(entity)-1;
    return `<button class="search-result" data-online-place="${index}"><span>${icon('pin')}<span>${escapeHTML(entity.name)}<small>${escapeHTML(entity.admin)}</small></span></span><span>查看天气 ${icon('arrow')}</span></button>`;
  }
  function renderSearch(){
    const query=$('#city-search').value.trim(),entities=searchEntities(remotePlaces);
    const local=entities.filter(e=>!e.remote),online=entities.filter(e=>e.remote);
    const matches=query?uniqueSearchResults(local,query):local.filter(e=>e.kind==='city'&&e.tier==='featured');
    searchLocalTotal=matches.length;onlineCandidates=[];
    const localKeys=new Set(matches.map(searchEntityKey));
    const remoteMatches=query?uniqueSearchResults(online,query).filter(e=>!localKeys.has(searchEntityKey(e))):[];
    $('#search-local-count').textContent=matches.length?`${matches.length} 个结果`:'';
    $('#search-index-status').textContent=searchAtlasState==='loading'?'正在加载本地地名…':searchAtlasState==='failed'?'扩展地名索引暂不可用，已有地点仍可搜索。':'';
    $('#search-results').innerHTML=matches.slice(0,searchLocalLimit).map(searchResultHTML).join('')+(
      matches.length>searchLocalLimit?'<button class="search-local-more" data-search-more type="button">继续查看本地地点</button>':
      !matches.length?'<p class="search-empty">本地没有匹配地点，可继续在线查找或手动添加坐标。<button class="text-button" data-new-place>添加地点</button></p>':'');
    $('#online-results').hidden=onlineSearchState==='idle';
    $('#online-search-status').textContent=onlineSearchMessage;
    $('#online-search-status').classList.toggle('loading-pulse',onlineSearchState==='loading');
    $('#online-search-results').innerHTML=remoteMatches.map(searchResultHTML).join('');
    if(onlineSearchState==='complete'&&!remoteMatches.length)$('#online-search-status').textContent='在线暂无更多匹配，仍可查看本地结果或手动添加。';
    $('#search-online').disabled=onlineSearchState==='loading';
  }
  function maybeSearchOnline(){
    if(!$('#search-dialog').open||searchComposing||searchAtlasState==='loading'||onlineSearchState!=='idle')return;
    const query=$('#city-search').value.trim(),remaining=SEARCH_IDLE_MS-(Date.now()-searchEditedAt);
    if(query.length<2)return;
    if(remaining>0){clearTimeout(searchTimer);searchTimer=setTimeout(maybeSearchOnline,remaining);return;}
    if(searchLocalTotal===0||(searchBottomReached&&searchLocalLimit>=searchLocalTotal))searchOnline();
  }
  function searchInputChanged(){
    clearTimeout(searchTimer);searchController?.abort();searchController=null;searchGeneration++;
    remotePlaces=[];onlineSearchState='idle';onlineSearchMessage='';onlineSearchKey='';
    searchEditedAt=Date.now();searchLocalLimit=40;searchBottomReached=false;$('#search-scroll').scrollTop=0;
    renderSearch();if($('#city-search').value.trim().length>=2)loadSearchAtlas();if(!searchComposing)searchTimer=setTimeout(maybeSearchOnline,SEARCH_IDLE_MS);
  }
  function moreLocalSearchResults(){
    if(searchLocalLimit<searchLocalTotal){searchLocalLimit+=40;searchBottomReached=false;renderSearch();}
  }

  function placeFromRow(row,contexts){
    const [geoId,name,aliases,lat,lon,code,contextId,feature,population,countryCode]=row;
    const [parents,displayParents,parentPaths]=contexts[contextId];
    const type=/^ISL/.test(feature)?'岛屿':feature==='MT'?'山峰':/^ADM/.test(feature)?'行政区':/^PPLA/.test(feature)||feature==='PPLC'?'城镇':'地点';
    return Search.prepare({kind:'place',geoId,name,aliases,lat,lon,code,parents,parentPaths,feature,population,countryCode,source:'geonames',admin:[...(displayParents||parents),type].join(' · ')});
  }
  function loadSearchAtlas(){
    if(searchAtlasPromise)return searchAtlasPromise;
    searchAtlasState='loading';
    searchAtlasPromise=Search.loadAtlas().then(payload=>{
      searchAtlas=payload.rows.map(row=>placeFromRow(row,payload.contexts));searchAtlasState='ready';
      if($('#search-dialog').open){renderSearch();maybeSearchOnline();}
    }).catch(()=>{
      searchAtlasState='failed';searchAtlasPromise=null;
      if($('#search-dialog').open){renderSearch();maybeSearchOnline();}
    });
    if($('#search-dialog').open)renderSearch();return searchAtlasPromise;
  }
  function openSearch(query=''){
    closeAllDialogs();searchComposing=false;$('#city-search').value=query;
    showDialog($('#search-dialog'));searchInputChanged();$('#city-search').focus();
  }

  function saveWeatherCache() {
    try {
      const priority=id=>featuredIDs.has(id)?0:cityByID.get(id)?.tier==='custom'?1:id===state.activeCity||(isProvince()&&inScope(cityByID.get(id)))?2:3;
      const rows=[...state.data].filter(([id])=>updatedAt.has(id)&&cityByID.has(id)&&cityByID.get(id).tier!=='preview')
        .sort(([a],[b])=>priority(a)-priority(b)||updatedAt.get(b)-updatedAt.get(a)||cityByID.get(a).index-cityByID.get(b).index);
      const entries=[];let size=40;
      for(const [id,days] of rows){
        const packed=Weather.packCache(new Map([[id,days]]),updatedAt.get(id));
        if(forecastBaseDates.has(id))packed.baseDate=forecastBaseDates.get(id);
        const entry=JSON.stringify(packed);
        if(size+entry.length+1>CACHE_MAX_CHARS)continue;
        entries.push(entry);size+=entry.length+1;
      }
      // Keep space for user records; smaller quotas may require a smaller subset.
      const store=count=>localStorage.setItem(CACHE_KEY,`{"version":3,"forecasts":[${entries.slice(0,count).join(',')}]}`);
      try{store(entries.length);}catch(error){
        if(error.name==='SecurityError')throw error;
        let low=1,high=entries.length-1,saved=0;
        while(low<=high){
          const middle=Math.floor((low+high)/2);
          try{store(middle);saved=middle;low=middle+1;}catch{high=middle-1;}
        }
        if(!saved)throw error;
      }
    }catch{/* Session data remains available if storage is full. */}
  }
  function loadCachedWeather() {
    try {
      const stored=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      const sources=stored?.version===3&&Array.isArray(stored.forecasts)?stored.forecasts:[JSON.parse(localStorage.getItem('sunseek-weather-v2')||'null')];
      for(const source of sources){
        const cache=Weather.unpackCache(source,new Set(cityByID.keys()),Date.now(),CACHE_MAX_AGE);
        if(!cache)continue;
        for(const [id,days] of cache.data){state.data.set(id,days);updatedAt.set(id,cache.time);if(source.baseDate===today)forecastBaseDates.set(id,source.baseDate);}
      }
      if(state.data.size){state.mode='cached';state.lastUpdated=Math.min(...updatedAt.values());return true;}
    }catch{}
    return false;
  }
  function enterDemo() {
    state.requestId++;state.controller?.abort();state.loading=false;state.fetchError=false;
    pendingIDs.clear();failedIDs.clear();failureReasons.clear();updatedAt.clear();forecastBaseDates.clear();
    state.expanding=false;state.mode='demo';state.data=demoData();state.lastUpdated=null;render();
    if($('#city-dialog').open&&state.activeCity)renderCityDialog(state.activeCity);
  }
  function ensureWeather(ids) {
    const valid=ids.filter(id=>cityByID.has(id));valid.forEach(id=>requestedIDs.add(id));
    if(state.mode==='demo'){state.data=demoData();render();if($('#city-dialog').open&&state.activeCity)renderCityDialog(state.activeCity);return;}
    const missing=valid.filter(id=>!state.data.has(id)||!updatedAt.has(id)||Date.now()-updatedAt.get(id)>=3600000||!(forecastBaseDates.get(id)===today||state.data.get(id).some(d=>d.date===lastForecastDate)));
    if(missing.length)fetchWeather(false,missing);
    else render();
  }
  async function fetchWeather(force=false,ids=null) {
    if(state.mode==='demo'){state.mode='loading';state.data=new Map();updatedAt.clear();forecastBaseDates.clear();state.lastUpdated=null;loadCachedWeather();}
    if(!state.data.size&&!state.loading)loadCachedWeather();
    const targets=(ids||currentWeatherTargets()).filter(id=>cityByID.has(id));
    targets.forEach(id=>requestedIDs.add(id));
    const needed=targets.filter(id=>force||!state.data.has(id)||!updatedAt.has(id)||Date.now()-updatedAt.get(id)>=3600000||!(forecastBaseDates.get(id)===today||state.data.get(id).some(d=>d.date===lastForecastDate)));
    needed.forEach(id=>pendingIDs.add(id));
    if(state.loading){render();return;}
    if(!pendingIDs.size){render();return;}
    state.loading=true;state.expanding=state.discovery==='all'&&!isProvince();state.fetchError=false;
    const requestId=++state.requestId,controller=new AbortController();state.controller=controller;
    const idsToFetch=[...pendingIDs];idsToFetch.forEach(id=>{failedIDs.delete(id);failureReasons.delete(id);});
    render();if($('#city-dialog').open&&state.activeCity)renderCityDialog(state.activeCity);
    let success=0,rateLimited=false;
    // One batch at a time limits bursts when expanding an entire province.
    for(let i=0;i<idsToFetch.length;i+=16){
      if(requestId!==state.requestId)break;
      const batch=idsToFetch.slice(i,i+16).map(id=>cityByID.get(id)).filter(Boolean);
      if(!batch.length)continue;
      try {
        const records=await requestWeatherPlaces(batch,controller.signal);
        if(requestId!==state.requestId)return;
        for(const record of records){
          const city=cityByID.get(record.cityId);if(!city||!batch.includes(city))continue;
          const days=record.forecast?Weather.normalizeForecast(record.forecast):[];
          if(days.some(d=>d.date>=today&&d.date<=lastForecastDate&&d.hours.some(Weather.validHour))){
            state.data.set(city.id,days);updatedAt.set(city.id,record.fetchedAt);
            if(record.forecast.daily?.time?.[0]===today&&record.forecast.daily.time.includes(lastForecastDate))forecastBaseDates.set(city.id,today);
            if(record.status==='fresh')success++;
            else{failedIDs.add(city.id);failureReasons.set(city.id,'共享预报更新未成功，暂用缓存');}
          }else{failedIDs.add(city.id);failureReasons.set(city.id,record.reason==='rate-limited'?'接口请求受限，请稍后重试':record.reason==='updating'?'天气正在更新，请稍后重试':'返回的预报字段不完整');}
        }
        if(records.some(r=>r.reason==='rate-limited')){
          rateLimited=true;for(const id of pendingIDs)if(!state.data.has(id)||Date.now()-updatedAt.get(id)>=3600000){failedIDs.add(id);failureReasons.set(id,'接口请求受限，请稍后重试');}pendingIDs.clear();
        }
      }catch(error){
        if(requestId===state.requestId){
          batch.filter(c=>cityByID.get(c.id)===c).forEach(c=>{failedIDs.add(c.id);failureReasons.set(c.id,error.message||'连接未成功');});
          if(error.rateLimited||error.sharedUnavailable){rateLimited=true;for(const id of pendingIDs){failedIDs.add(id);failureReasons.set(id,error.message||'接口请求受限，请稍后重试');}pendingIDs.clear();}
        }
      }finally{
        if(requestId===state.requestId){batch.forEach(c=>pendingIDs.delete(c.id));render();}
      }
      if(rateLimited)break;
    }
    if(requestId!==state.requestId)return;
    state.loading=false;state.expanding=false;state.controller=null;state.fetchError=failedIDs.size>0;
    for(const [id,time] of updatedAt)if(Date.now()-time>=CACHE_MAX_AGE){updatedAt.delete(id);forecastBaseDates.delete(id);state.data.delete(id);}
    state.mode=success?'live':state.data.size?'cached':'unavailable';
    state.lastUpdated=updatedAt.size?Math.min(...updatedAt.values()):null;
    saveWeatherCache();render();
    if($('#city-dialog').open&&state.activeCity)renderCityDialog(state.activeCity);
    if($('#search-dialog').open)renderSearch();
    if(force)toast(success?`更新了 ${success} 个地点的预报`:state.data.size?'本次更新未成功，有效缓存继续保留。':'本次更新未成功，请稍后重试。');
    if(pendingIDs.size)fetchWeather(false,[...pendingIDs]);
  }
  async function requestWeatherPlaces(batch,signal){
    const objectConfig=window.SUNSEEK_OBJECT_WEATHER_SERVICE||{enabled:false};
    if(objectConfig.enabled&&(!Array.isArray(objectConfig.ids)||!objectConfig.ids.length||!objectConfig.contract)){
      const error=new Error('共享天气配置未加载完整，请刷新后重试');error.sharedUnavailable=true;throw error;
    }
    const objectPoints=objectConfig.enabled?batch.filter(c=>featuredIDs.has(c.id)&&objectConfig.ids?.includes(c.id)):[];
    let records=[];
    if(objectPoints.length){
      try{
        if(!window.SunseekObjectWeatherClient)throw new Error('共享天气模块加载未成功，请刷新后重试');
        records=await window.SunseekObjectWeatherClient.request(objectPoints.map(c=>c.id),signal);
      }catch(error){error.sharedUnavailable=true;throw error;}
    }
    const remaining=batch.filter(c=>!objectPoints.includes(c));
    const shared=window.SunseekWeatherClient;
    // An older cached client module must not re-enable the experimental cloud route.
    const sharedConfig=window.SUNSEEK_WEATHER_SERVICE||{enabled:false};
    if(sharedConfig.enabled&&!shared&&remaining.some(c=>publicWeatherIDs.has(c.id))){const error=new Error('共享天气模块加载未成功，请刷新后重试');error.sharedUnavailable=true;throw error;}
    const publicPoints=sharedConfig.enabled?remaining.filter(c=>publicWeatherIDs.has(c.id)):[];
    const directPoints=remaining.filter(c=>!publicPoints.includes(c));
    // A shared service failure must never fan out to one upstream request per visitor.
    if(publicPoints.length){try{records.push(...await shared.request(publicPoints.map(c=>c.id),signal));}catch(error){error.sharedUnavailable=true;throw error;}}
    if(directPoints.length){
      const params=new URLSearchParams({latitude:directPoints.map(c=>c.lat).join(','),longitude:directPoints.map(c=>c.lon).join(','),
        daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max',
        hourly:'weather_code,temperature_2m,apparent_temperature,precipitation,snowfall,wind_speed_10m,wind_gusts_10m,cloud_cover,is_day',
        timezone:'Asia/Shanghai',forecast_days:'16',wind_speed_unit:'kmh',precipitation_unit:'mm',temperature_unit:'celsius'});
      const list=await requestForecastBatch(params,directPoints.length,signal);
      directPoints.forEach((c,i)=>records.push({cityId:c.id,status:'fresh',forecast:list[i],fetchedAt:Date.now()}));
    }
    return records;
  }
  async function requestForecastBatch(params,count,signal) {
    // A timeout belongs to one attempt; only explicit cancellation aborts the whole refresh.
    for(let attempt=0;attempt<2;attempt++){
      if(signal.aborted)throw new Error('查询已取消');
      const request=new AbortController();let timedOut=false;
      const cancel=()=>request.abort();signal.addEventListener('abort',cancel,{once:true});
      const timer=setTimeout(()=>{timedOut=true;request.abort();},22000);
      try{
        const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`,{signal:request.signal});
        if(!response.ok){const error=new Error(response.status===429?'接口请求受限，请稍后重试':`接口返回错误（${response.status}）`);error.noRetry=response.status<500;error.rateLimited=response.status===429;throw error;}
        const payload=await response.json(),list=Array.isArray(payload)?payload:[payload];
        if(list.length!==count)throw new Error('返回地点数量不完整');
        return list;
      }catch(error){
        if(signal.aborted)throw new Error('查询已取消');
        if(attempt===1||error.noRetry){const failure=new Error(timedOut?'请求超时':error.message==='Failed to fetch'?'网络连接未成功':error.message);failure.rateLimited=!!error.rateLimited;throw failure;}
      }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
    }
  }
  function expireWeather() {
    if(state.mode==='demo')return;
    let changed=false;
    for(const [id,time] of updatedAt)if(Date.now()-time>=CACHE_MAX_AGE){state.data.delete(id);updatedAt.delete(id);forecastBaseDates.delete(id);changed=true;}
    if(changed){
      state.lastUpdated=updatedAt.size?Math.min(...updatedAt.values()):null;
      if(!state.data.size)state.mode='unavailable';
      render();if($('#city-dialog').open&&state.activeCity)renderCityDialog(state.activeCity);
      if($('#search-dialog').open)renderSearch();
    }
  }

  function persistPlaces() {
    try{localStorage.setItem('sunseek-places-v3',JSON.stringify(cities.filter(c=>c.tier==='custom')));return true;}
    catch{toast('浏览器无法保存地点，当前地点仅保留到页面关闭。');return false;}
  }
  function refreshOriginOptions() {
    const selected=$('#origin-city').value;
    $('#origin-city').replaceChildren(new Option('先看看全国',''));
    for(const region of ['华东','华北','华南','华中','西南','西北','东北']){
      const group=document.createElement('optgroup');group.label=region;
      cities.filter(c=>c.region===region&&(c.tier==='featured'||c.tier==='custom'||c.id===selected||c.id===state.origin)).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).forEach(c=>group.append(new Option(c.name,c.id)));
      $('#origin-city').append(group);
    }
    if(cityByID.has(selected))$('#origin-city').value=selected;
  }
  function setOrigin(id) {
    if(!cityByID.has(id))return;
    state.origin=id;refreshOriginOptions();$('#origin-city').value=id;getFilters();render();closeAllDialogs();
    toast(`已设置从${cityByID.get(id).name}出发`);
  }
  function renderSavedPlaces() {
    const custom=cities.filter(c=>c.tier==='custom');$('#saved-places').hidden=!custom.length;
    $('#saved-place-list').innerHTML=custom.map(c=>`<div class="saved-place-row"><button data-open-city="${c.id}">${icon('pin')}<span><strong>${escapeName(c)}</strong><small>${escapeHTML(c.province)} · ${c.lat.toFixed(4)}° N, ${c.lon.toFixed(4)}° E</small></span></button><div><button data-origin-city="${c.id}">从这里出发</button><button data-edit-place="${c.id}">编辑</button><button data-remove-place="${c.id}" ${state.visited[c.id]?'disabled title="先在足迹中移回推荐，再删除地点"':''}>移除</button></div></div>`).join('');
  }
  function openPlace(candidate={}) {
    placeCandidate=candidate;closeAllDialogs();
    const editing=candidate.id&&cityByID.get(candidate.id)?.tier==='custom';
    $('#place-dialog h2').textContent=editing?'编辑已保存地点':'先看看这个地点的天气';
    $('#place-form button[type=submit]').textContent=editing?'保存修改':'查看天气';
    $('#place-form').reset();$('#place-name').value=candidate.name||'';$('#place-lat').value=Number.isFinite(candidate.lat)?candidate.lat.toFixed(5):'';$('#place-lon').value=Number.isFinite(candidate.lon)?candidate.lon.toFixed(5):'';
    $('#place-province').value=candidate.code?String(candidate.code):isProvince()?state.region:'';
    $('#place-error').hidden=true;updatePlacePreview();showDialog($('#place-dialog'));
  }
  function updatePlacePreview() {
    const latText=$('#place-lat').value,lonText=$('#place-lon').value;
    $('#place-preview').textContent=latText&&lonText?`${Number(latText).toFixed(5)}° N, ${Number(lonText).toFixed(5)}° E · 请确认这是你想去的位置`:'可以输入坐标，也可以关闭窗口后使用地图选点。';
  }
  function savePlace(event) {
    event.preventDefault();
    const name=$('#place-name').value.trim(),lat=Number($('#place-lat').value),lon=Number($('#place-lon').value),code=Number($('#place-province').value);
    let error='';
    const detected=Places.provinceAt(lon,lat,provinceFeatures);
    if(placeCandidate?.id&&pendingIDs.has(placeCandidate.id))error='这个地点的天气还在更新，请稍候再编辑。';
    else if(!name||name.length>40||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<0||lat>55||lon<73||lon>136||!Places.shortNames[code])error='请填写地点名称、有效坐标和所属省份。';
    else if(detected&&detected!==code&&!(placeCandidate?.source==='geonames'&&placeCandidate.countryCode==='TW'&&code===710000&&placeCandidate.code===code&&Math.abs(placeCandidate.lat-lat)<0.00001&&Math.abs(placeCandidate.lon-lon)<0.00001))error=`这个坐标位于${Places.shortNames[detected]}，请核对坐标与所属省份。`;
    else if(!detected&&!(placeCandidate?.source==='geonames'&&Math.abs(placeCandidate.lat-lat)<0.00001&&Math.abs(placeCandidate.lon-lon)<0.00001&&placeCandidate.code===code))error='这个坐标未落在当前中国地图覆盖范围内。请核对位置；边界和小岛暂可通过在线搜索确认后添加。';
    $('#place-error').hidden=!error;$('#place-error').textContent=error;if(error)return;
    const existing=cities.find(c=>c.id!==placeCandidate?.id&&((placeCandidate?.geoId&&c.geoId===placeCandidate.geoId)||(c.name===name&&Weather.distanceKm(c,{lat,lon})<1)));
    if(existing){openCity(existing.id);toast('这个地点已存在，已打开已有记录。');return;}
    const editing=placeCandidate?.id&&cityByID.get(placeCandidate.id)?.tier==='custom';
    const id=placeCandidate?.id||`user-${crypto.randomUUID()}`;
    const city={id,name,lat,lon,code,province:Places.shortNames[code],region:Places.regionFor(code),tier:editing?'custom':'preview',capital:false,marker:true,temp:20,type:'place',description:'',image:null,countryCode:({710000:'TW',810000:'HK',820000:'MO'}[code]||'CN'),timezone:'Asia/Shanghai',source:placeCandidate?.source==='geonames'?'geonames':'custom',geoId:placeCandidate?.geoId||null,index:cityByID.get(id)?.index??cities.length};
    const old=cityByID.get(id);
    if(old){cities[cities.indexOf(old)]=city;if(old.lat!==lat||old.lon!==lon){state.data.delete(id);updatedAt.delete(id);forecastBaseDates.delete(id);saveWeatherCache();}}
    else cities.push(city);
    cityByID.set(id,city);requestedIDs.add(id);state.picking=false;
    if(editing){persistPlaces();refreshOriginOptions();setScope(String(code),false,id);}
    openCity(id);
  }
  function previewPlace(candidate) {openPlace(candidate);$('#place-form').requestSubmit();}
  function savePreview(id) {
    const city=cityByID.get(id);if(!city||city.tier!=='preview')return;
    if(cities.filter(c=>c.tier==='custom').length>=100){toast('最多保存 100 个自定义地点，请先移除不用的地点。');return;}
    city.tier='custom';
    if(!persistPlaces()){city.tier='preview';toast('保存失败，地点仍可临时查看天气。');return;}
    saveWeatherCache();refreshOriginOptions();render();renderCityDialog(id);toast('已保存地点，下次可以直接找到。');
  }
  function removePlace(id) {
    const city=cityByID.get(id);if(!city||city.tier!=='custom'||state.visited[id])return;
    if(pendingIDs.has(id)){toast('天气正在更新，请稍候再移除地点。');return;}
    if(state.origin===id){state.origin='';$('#origin-city').value='';$('#max-distance').value='';getFilters();}
    cities.splice(cities.indexOf(city),1);cityByID.delete(id);state.data.delete(id);updatedAt.delete(id);forecastBaseDates.delete(id);requestedIDs.delete(id);pendingIDs.delete(id);failedIDs.delete(id);failureReasons.delete(id);state.compare=state.compare.filter(item=>item!==id);
    if(state.focusCity===id){state.focusCity=null;state.zoom=1;state.panX=0;state.panY=0;configureMapBounds();initializeMap();}
    persistPlaces();saveWeatherCache();refreshOriginOptions();render();toast('已移除这个自定义地点。');
  }
  async function searchOnline(){
    clearTimeout(searchTimer);
    const query=$('#city-search').value.trim(),key=Search.normalize(query);
    if(query.length<2||searchComposing){if(!searchComposing){onlineSearchState='message';onlineSearchMessage='请输入至少两个字，再在线查找。';renderSearch();}return;}
    if(onlineSearchState==='loading'&&onlineSearchKey===key)return;
    searchController?.abort();searchController=null;const generation=++searchGeneration;
    onlineSearchKey=key;
    const cached=searchOnlineCache.get(key);
    if(cached&&Date.now()<cached.expires){
      remotePlaces=cached.places;onlineSearchState='complete';onlineSearchMessage='在线匹配结果';renderSearch();return;
    }
    searchOnlineCache.delete(key);
    const controller=new AbortController();searchController=controller;const timer=setTimeout(()=>controller.abort(),12000);
    onlineSearchState='loading';onlineSearchMessage='正在在线查找更多地点…';renderSearch();
    try{
      const params=new URLSearchParams({...Search.queryPlan(query,searchEntities()),count:'100',language:'zh',format:'json'});
      const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`,{signal:controller.signal});
      if(!response.ok)throw new Error('Search unavailable');
      const payload=await response.json();if(generation!==searchGeneration)return;
      remotePlaces=(Array.isArray(payload.results)?payload.results:[]).filter(c=>['CN','HK','MO','TW'].includes(c.country_code)&&typeof c.name==='string'&&Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)).map(c=>{
        const code=({HK:810000,MO:820000,TW:710000}[c.country_code])||Places.provinceAt(c.longitude,c.latitude,provinceFeatures)||Places.provinces.find(p=>(c.admin1||'').includes(p.name))?.code;
        if(!code)return null;
        const parents=[Places.shortNames[code],...new Set([c.admin2,c.admin3,c.admin4].filter(Boolean))];
        return Search.prepare({kind:'place',remote:true,name:c.name.slice(0,40),lat:c.latitude,lon:c.longitude,code,source:'geonames',geoId:c.id,parents,countryCode:c.country_code,feature:c.feature_code||'',population:c.population,admin:parents.join(' · ')});
      }).filter(Boolean);
      searchOnlineCache.set(key,{places:remotePlaces,expires:Date.now()+(remotePlaces.length?30*60000:2*60000)});
      if(searchOnlineCache.size>50)searchOnlineCache.delete(searchOnlineCache.keys().next().value);
      onlineSearchState='complete';onlineSearchMessage='在线匹配结果';renderSearch();
    }catch{if(generation===searchGeneration){onlineSearchState='error';onlineSearchMessage='在线搜索暂时不可用。本地地点仍可搜索，也可手动添加。';renderSearch();}}
    finally{clearTimeout(timer);if(generation===searchGeneration)searchController=null;}
  }

  function resetAdvanced() {
    $('#min-temp').value='';$('#max-temp').value='';$('#strict-match').checked=false;
    setScope('all',false);$('#hide-visited').checked=true;$('#max-distance').value='';$('#hour-start').value='9';$('#hour-end').value='18';applyFilters();
  }
  function initEvents() {
    $('#discovery-scope').addEventListener('change',()=>setDiscovery($('#discovery-scope').value));
    $('#retry-discovery').addEventListener('click',()=>fetchWeather(true,state.candidates.filter(c=>!c.complete).map(c=>c.id)));
    $('#backup-btn').addEventListener('click',openBackup);
    $('#backup-export').addEventListener('click',exportBackup);
    $('#backup-file').addEventListener('change',readBackupFile);
    $('#backup-use-preferences').addEventListener('change',renderBackupPreview);
    $('#backup-confirm').addEventListener('click',importBackup);
    $('#backup-dialog').addEventListener('close',()=>{if(!$('#backup-dialog').open){backupGeneration++;backupPending=null;}});
    document.addEventListener('error',event=>{
      const image=event.target;if(!image.matches?.('[data-city-photo]'))return;
      image.closest('.place-visual').classList.add('image-unavailable');
      const hero=image.closest('.city-dialog-hero');
      if(hero)hero.querySelector('.dialog-image-note').textContent='地点示意 · 图片暂不可用';
    },true);
    $('#city-dialog').addEventListener('toggle',event=>{
      if(event.target.id!=='departure-options'||!event.target.isConnected)return;
      state.departureOpen=event.target.open;if(state.departureOpen)renderDepartureOptions();
    },true);
    $('#city-dialog').addEventListener('change',event=>{
      if(event.target.id!=='departure-duration')return;
      state.windowDuration=Number(event.target.value);renderDepartureOptions();
    });
    $('#region-filter').addEventListener('change',()=>setScope($('#region-filter').value));
    $('#region-search-btn').addEventListener('click',()=>openSearch());
    $('#all-sort-order').addEventListener('change',()=>{$('#sort-order').value=$('#all-sort-order').value;applyFilters();});
    $('#map-national').addEventListener('click',()=>setScope('all'));
    $('#map-special-regions').addEventListener('click',event=>{const button=event.target.closest('[data-map-shortcut]');if(button)setScope(button.dataset.mapShortcut);});
    $('#map-extra-points').addEventListener('change',()=>renderMap());
    $('#map-scope-parents').addEventListener('click',event=>{const button=event.target.closest('[data-map-scope]');if(button)setScope(button.dataset.mapScope);});
    $('#retry-scope-weather').addEventListener('click',()=>fetchWeather(true,state.mapRanked.filter(c=>inScope(c)&&!c.complete).map(c=>c.id)));
    $('#map-date-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-map-date]');if(button)setMapDate(button.dataset.mapDate);});
    $('#map-date-tabs').addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const buttons=$$('[data-map-date]'),index=buttons.indexOf(event.target);if(index<0)return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:clamp(index+(event.key==='ArrowRight'?1:-1),0,buttons.length-1);
      setMapDate(buttons[next].dataset.mapDate);
    });
    $('#map-pick').addEventListener('click',toggleMapPick);
    $('#add-place-btn').addEventListener('click',()=>openPlace());
    $('#saved-add-place').addEventListener('click',()=>openPlace());
    $('#place-form').addEventListener('submit',savePlace);
    ['place-lat','place-lon'].forEach(id=>$('#'+id).addEventListener('input',updatePlacePreview));
    $('#search-online').addEventListener('click',searchOnline);
    $('#place-search-btn').addEventListener('click',()=>openSearch($('#place-name').value.trim()));
    $$('.preference').forEach(button=>button.addEventListener('click',()=>{
      state.preference=button.dataset.preference;
      $$('.preference').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
      applyFilters();
    }));
    ['start-date','end-date','min-temp','max-temp','strict-match','hide-visited','sort-order','origin-city','max-distance','hour-start','hour-end'].forEach(id=>$('#'+id).addEventListener('change',()=>{if(id.includes('date'))$$('[data-quick-date]').forEach(b=>b.classList.remove('active'));applyFilters();}));
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
    $('#retry-weather').addEventListener('click',()=>fetchWeather(true));
    $('#demo-weather').addEventListener('click',()=>state.mode==='demo'?fetchWeather(true):enterDemo());
    $('#search-btn').addEventListener('click',()=>openSearch());
    $('#city-search').addEventListener('input',searchInputChanged);
    $('#city-search').addEventListener('compositionstart',()=>{searchComposing=true;clearTimeout(searchTimer);searchController?.abort();searchController=null;searchGeneration++;});
    $('#city-search').addEventListener('compositionend',()=>{searchComposing=false;searchInputChanged();});
    $('#city-search').addEventListener('keydown',event=>{
      if(searchComposing||event.isComposing)return;
      if(event.key==='Enter'){event.preventDefault();const result=$('#search-results .search-result')||$('#online-search-results .search-result');if(result)result.click();else searchOnline();}
      else if(event.key==='ArrowDown'){event.preventDefault();($('#search-results .search-result')||$('#online-search-results .search-result'))?.focus();}
    });
    $('#search-scroll').addEventListener('scroll',()=>{
      const list=$('#search-scroll');
      if(list.scrollHeight<=list.clientHeight+4||list.scrollTop+list.clientHeight<list.scrollHeight-12)return;
      if(searchLocalLimit<searchLocalTotal){moreLocalSearchResults();return;}
      searchBottomReached=true;maybeSearchOnline();
    });
    $('#search-results').addEventListener('click',event=>{if(event.target.closest('[data-search-more]'))moreLocalSearchResults();});
    $('#search-dialog').addEventListener('keydown',event=>{
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      const buttons=$$('#search-results .search-result,#online-search-results .search-result'),index=buttons.indexOf(event.target);if(index<0)return;event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:index+(event.key==='ArrowDown'?1:-1);
      if(next<0)$('#city-search').focus();else buttons[Math.min(next,buttons.length-1)].focus();
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('dialog[open]')){event.preventDefault();closeAllDialogs();return;}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('#search-btn').click();}});
    document.addEventListener('click',event=>{
      if(event.target.closest('[data-photo-link]'))return;
      const departure=event.target.closest('[data-use-departure-start]');if(departure){useDepartureDates(departure.dataset.useDepartureStart,departure.dataset.useDepartureEnd);return;}
      const scope=event.target.closest('[data-select-region]');if(scope){closeAllDialogs();setScope(scope.dataset.selectRegion);return;}
      const province=event.target.closest('[data-open-province]');if(province){closeAllDialogs();setScope(province.dataset.openProvince);$('.map-panel').scrollIntoView({behavior:'smooth',block:'start'});return;}
      const online=event.target.closest('[data-online-place]');if(online){const candidate=onlineCandidates[Number(online.dataset.onlinePlace)];if(candidate)previewPlace(candidate);return;}
      if(event.target.closest('[data-new-place]')){openPlace();return;}
      const savePreviewButton=event.target.closest('[data-save-preview]');if(savePreviewButton){savePreview(savePreviewButton.dataset.savePreview);return;}
      const edit=event.target.closest('[data-edit-place]');if(edit){openPlace(cityByID.get(edit.dataset.editPlace));return;}
      const remove=event.target.closest('[data-remove-place]');if(remove){removePlace(remove.dataset.removePlace);return;}
      const origin=event.target.closest('[data-origin-city]');if(origin){setOrigin(origin.dataset.originCity);return;}
      const focus=event.target.closest('[data-focus-city]');if(focus){focusCity(focus.dataset.focusCity);return;}
      const retry=event.target.closest('[data-fetch-city]');if(retry){fetchWeather(true,[retry.dataset.fetchCity]);return;}
      const compare=event.target.closest('[data-compare]');if(compare){event.preventDefault();event.stopPropagation();toggleCompare(compare.dataset.compare);return;}
      if(event.target.closest('[data-clear-compare]')){state.compare=[];renderRecommendations();renderCompareTray();return;}
      if(event.target.closest('[data-open-compare]')){closeAllDialogs();renderCompareDialog();showDialog($('#compare-dialog'));return;}
      if(event.target.closest('[data-retry-weather],[data-return-live]')){fetchWeather(true);return;}
      if(event.target.closest('[data-enter-demo]')){enterDemo();return;}
      const hour=event.target.closest('[data-hour-note]');if(hour){const plan=hour.closest('.day-plan');plan.querySelector('.hour-detail-line').textContent=hour.dataset.hourNote;$$('.hour-slot',plan).forEach(b=>b.setAttribute('aria-pressed',String(b===hour)));return;}
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
      dialog.addEventListener('close',unlockPageScroll);
    });
    updateVisualViewport();window.visualViewport?.addEventListener('resize',updateVisualViewport);window.visualViewport?.addEventListener('scroll',updateVisualViewport);
    let resizeTimer;window.addEventListener('resize',()=>{updateVisualViewport();clearTimeout(resizeTimer);resizeTimer=setTimeout(renderMap,120);});
    const svg=$('#weather-map');
    const highlightProvince=target=>{
      const path=target?.closest?.('[data-province]');
      const overlay=$('#province-hover');overlay.replaceChildren();
      if(!path)return;
      const outline=document.createElementNS('http://www.w3.org/2000/svg','path');
      outline.setAttribute('d',path.getAttribute('d'));outline.setAttribute('class','province-outline');
      overlay.append(outline);
    };
    svg.addEventListener('pointerover',event=>highlightProvince(event.target));
    svg.addEventListener('pointerleave',()=>highlightProvince(null));
    svg.addEventListener('focusin',event=>highlightProvince(event.target));
    svg.addEventListener('focusout',()=>highlightProvince(null));
    let pointer=null,dragged=false,touchGesture=null,touchStart=null,suppressMapClickUntil=0;
    const svgPoint=(x,y)=>{const point=svg.createSVGPoint();point.x=x;point.y=y;return point.matrixTransform(svg.getScreenCTM().inverse());};
    const clampMapPan=()=>{state.panX=clamp(state.panX,-450*(state.zoom-1),450*(state.zoom-1));state.panY=clamp(state.panY,-275*(state.zoom-1),275*(state.zoom-1));};
    // A single finger belongs to page scrolling. Two fingers manipulate only the map.
    const touchPair=touches=>{
      const a=svgPoint(touches[0].clientX,touches[0].clientY),b=svgPoint(touches[1].clientX,touches[1].clientY);
      return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
    };
    const startPinch=touches=>{
      const pair=touchPair(touches);
      touchGesture={...pair,zoom:state.zoom,anchorX:(pair.x-450-state.panX)/state.zoom,anchorY:(pair.y-275-state.panY)/state.zoom};
      pointer=null;dragged=true;$('#map-tooltip').hidden=true;
    };
    svg.addEventListener('touchstart',event=>{
      if(event.touches.length>=2){if(event.cancelable)event.preventDefault();startPinch(event.touches);suppressMapClickUntil=Date.now()+700;}
      else{touchStart={x:event.touches[0].clientX,y:event.touches[0].clientY};suppressMapClickUntil=0;}
    },{passive:false});
    svg.addEventListener('touchmove',event=>{
      if(event.touches.length>=2){
        if(event.cancelable)event.preventDefault();if(!touchGesture)startPinch(event.touches);
        const pair=touchPair(event.touches);state.zoom=clamp(touchGesture.zoom*pair.distance/touchGesture.distance,1,2.5);
        state.panX=pair.x-450-touchGesture.anchorX*state.zoom;state.panY=pair.y-275-touchGesture.anchorY*state.zoom;
        clampMapPan();updateMapTransform();suppressMapClickUntil=Date.now()+700;
      }else if(touchStart&&event.touches.length===1&&Math.hypot(event.touches[0].clientX-touchStart.x,event.touches[0].clientY-touchStart.y)>8){suppressMapClickUntil=Date.now()+500;}
    },{passive:false});
    const endMapTouch=event=>{
      if(touchGesture){suppressMapClickUntil=Date.now()+700;if(event.touches.length>=2)startPinch(event.touches);else touchGesture=null;}
      if(!event.touches.length){touchStart=null;dragged=false;}
    };
    svg.addEventListener('touchend',endMapTouch);svg.addEventListener('touchcancel',endMapTouch);
    svg.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'||event.button!==0||state.picking)return;const p=svgPoint(event.clientX,event.clientY);pointer={x:p.x,y:p.y,panX:state.panX,panY:state.panY};dragged=false;});
    svg.addEventListener('pointermove',event=>{
      if(pointer&&state.zoom>1){const p=svgPoint(event.clientX,event.clientY),dx=p.x-pointer.x,dy=p.y-pointer.y;if(Math.abs(dx)+Math.abs(dy)>5){dragged=true;svg.setPointerCapture(event.pointerId);$('#map-tooltip').hidden=true;state.panX=pointer.panX+dx;state.panY=pointer.panY+dy;clampMapPan();updateMapTransform();}}
    });
    svg.addEventListener('pointerup',event=>{pointer=null;if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);});
    svg.addEventListener('pointercancel',()=>{pointer=null;if(!touchGesture)dragged=false;});
    svg.addEventListener('click',event=>{
      if(event.detail!==0&&Date.now()<suppressMapClickUntil)return;
      if(dragged){dragged=false;return;}
      if(state.picking){
        let point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
        point=point.matrixTransform($('#map-viewport').getScreenCTM().inverse());
        const [lon,lat]=unproject(point.x,point.y),code=Places.provinceAt(lon,lat,provinceFeatures);
        if(!code){toast('请选择地图覆盖范围内的陆地点位；也可以直接输入坐标。');return;}
        state.picking=false;renderMap();openPlace({lat,lon,code});return;
      }
      const marker=event.target.closest('[data-map-city]');if(marker){openMapCity(marker.dataset.mapCity);return;}
      const province=event.target.closest('[data-province]');if(province&&Places.shortNames[province.dataset.province])setScope(province.dataset.province);
    });
    svg.addEventListener('keydown',event=>{const province=event.target.closest('[data-province]');if(province&&Places.shortNames[province.dataset.province]&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setScope(province.dataset.province);return;}const marker=event.target.closest('[data-map-city]');if(marker&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openMapCity(marker.dataset.mapCity);}});
    svg.addEventListener('pointerover',event=>{const marker=event.target.closest('[data-map-city]');if(!marker||pointer||event.pointerType==='touch')return;const city=state.mapRanked.find(c=>c.id===marker.dataset.mapCity);if(!city)return;const box=marker.getBoundingClientRect(),container=$('#map-container').getBoundingClientRect();$('#map-tooltip').innerHTML=`<strong>${escapeHTML(city.name)} <span>· ${dataLabel(city)}</span></strong><span>${state.mapDate?shortDate(state.mapDate)+' · ':''}${city.complete?`${city.goodHours} / ${city.availableHours}h 合拍 · ${round(city.min)}–${round(city.max)}°C`:escapeHTML(forecastStatus(city))}${city.hazardous?' · 有不利天气':''}</span>`;$('#map-tooltip').style.left=`${clamp(box.left-container.left-35,10,container.width-175)}px`;$('#map-tooltip').style.top=`${Math.max(8,box.top-container.top-64)}px`;$('#map-tooltip').hidden=false;});
    svg.addEventListener('pointerout',event=>{if(event.target.closest('[data-map-city]'))$('#map-tooltip').hidden=true;});
    function zoom(delta){state.zoom=clamp(state.zoom+delta,1,2.5);if(state.zoom===1){state.panX=0;state.panY=0;}updateMapTransform();}
    $('#map-zoom-in').addEventListener('click',()=>zoom(.3));$('#map-zoom-out').addEventListener('click',()=>zoom(-.3));
    $('#map-reset').addEventListener('click',()=>{state.zoom=1;state.panX=0;state.panY=0;updateMapTransform();});
    window.addEventListener('storage',event=>{if(event.key==='sunseek-footprints-v1'){try{const saved=JSON.parse(event.newValue||'{}');state.visited={};if(saved&&typeof saved==='object')for(const [id,entry] of Object.entries(saved))if(cityByID.has(id)&&entry&&typeof entry==='object')state.visited[id]={savedAt:typeof entry.savedAt==='string'?entry.savedAt:today,note:typeof entry.note==='string'?entry.note.slice(0,300):''};render();}catch{/* Ignore malformed storage updates. */}}});
  }

  $('#start-date').value=state.start;$('#end-date').value=state.end;
  const originSelect=$('#origin-city');
  $('#all-sort-order').innerHTML=$('#sort-order').innerHTML;
  refreshOriginOptions();
  const provinceGroup=document.createElement('optgroup');provinceGroup.label='按省份浏览';
  Places.provinces.forEach(p=>provinceGroup.append(new Option(p.name,String(p.code))));$('#region-filter').append(provinceGroup);
  $('#place-province').append(new Option('请选择省份',''));
  Places.provinces.forEach(p=>$('#place-province').append(new Option(p.name,String(p.code))));
  $('#hour-start').innerHTML=Array.from({length:16},(_,i)=>`<option value="${i+6}">${String(i+6).padStart(2,'0')}:00</option>`).join('');
  $('#hour-end').innerHTML=Array.from({length:16},(_,i)=>`<option value="${i+7}">${String(i+7).padStart(2,'0')}:00</option>`).join('');
  $('#hour-start').value='9';$('#hour-end').value='18';
  try{
    const saved=JSON.parse(localStorage.getItem('sunseek-preferences-v2')||'null');
    if(saved){
      if(cityByID.has(saved.origin)){state.origin=saved.origin;refreshOriginOptions();originSelect.value=saved.origin;}
      if([200,500,1000,2000].includes(saved.maxDistance))$('#max-distance').value=String(saved.maxDistance);
      if(Number.isInteger(saved.hourStart)&&Number.isInteger(saved.hourEnd)&&saved.hourStart>=6&&saved.hourEnd<=22&&saved.hourStart<saved.hourEnd){$('#hour-start').value=String(saved.hourStart);$('#hour-end').value=String(saved.hourEnd);}
    }
  }catch{}
  Attractions.init(item=>{const code=Places.provinceAt(item.lon,item.lat,provinceFeatures);previewPlace({name:item.name,lat:item.lat,lon:item.lon,code});},toast);
  initializeMap();initEvents();getFilters();render();fetchWeather();
  setInterval(expireWeather,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)expireWeather();});
})();
