'use strict';

// Destination identity, geography and display ranking are separate from weather scores.
window.SunseekPlaces = (() => {
  const regions={华北:[11,12,13,14,15],东北:[21,22,23],华东:[31,32,33,34,35,36,37,71],华中:[41,42,43],华南:[44,45,46,81,82],西南:[50,51,52,53,54],西北:[61,62,63,64,65]};
  const shortNames={110000:'北京',120000:'天津',130000:'河北',140000:'山西',150000:'内蒙古',210000:'辽宁',220000:'吉林',230000:'黑龙江',310000:'上海',320000:'江苏',330000:'浙江',340000:'安徽',350000:'福建',360000:'江西',370000:'山东',410000:'河南',420000:'湖北',430000:'湖南',440000:'广东',450000:'广西',460000:'海南',500000:'重庆',510000:'四川',520000:'贵州',530000:'云南',540000:'西藏',610000:'陕西',620000:'甘肃',630000:'青海',640000:'宁夏',650000:'新疆',710000:'台湾',810000:'香港',820000:'澳门'};
  const capitals=new Set('北京 天津 石家庄 太原 呼和浩特 沈阳 长春 哈尔滨 上海 南京 杭州 合肥 福州 南昌 济南 郑州 武汉 长沙 广州 南宁 海口 重庆 成都 贵阳 昆明 拉萨 西安 兰州 西宁 银川 乌鲁木齐 台北 香港 澳门'.split(' '));
  const regionFor=code=>Object.keys(regions).find(r=>regions[r].includes(Math.floor(code/10000)))||'';
  const provinces=Object.entries(shortNames).map(([code,name])=>({code:Number(code),name,region:regionFor(Number(code))}));
  const plainName=name=>name.replace(/市$/,'');
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  function buildCatalog(curated,rows){
    const result=curated.map(c=>({...c,capital:capitals.has(c.name),tier:'featured',countryCode:({710000:'TW',810000:'HK',820000:'MO'}[c.code]||'CN'),timezone:'Asia/Shanghai',source:'curated'}));
    for(const [adcode,name,code,lat,lon,level] of rows){
      // Do not conflate a city with a prefecture/autonomous region that contains it.
      const duplicate=result.find(c=>c.code===code&&plainName(c.name)===plainName(name));
      if(duplicate){duplicate.adcode=adcode;continue;}
      result.push({id:`area-${adcode}`,name:plainName(name),fullName:name,code,province:shortNames[code],region:regionFor(code),lat,lon,level,adcode,
        tier:'basic',capital:false,marker:false,temp:20,type:'place',description:'',image:null,countryCode:({710000:'TW',810000:'HK',820000:'MO'}[code]||'CN'),timezone:'Asia/Shanghai',source:'datav',index:result.length});
    }
    for(const entry of window.TAIWAN_PLACES||[]){
      const duplicate=result.find(c=>c.code===710000&&plainName(c.name)===plainName(entry.name));
      if(duplicate){Object.assign(duplicate,{geoId:entry.geoId,fullName:entry.name,aliases:entry.aliases});continue;}
      result.push({id:`geo-${entry.geoId}`,name:entry.name,fullName:entry.name,aliases:entry.aliases,code:710000,province:shortNames[710000],region:regionFor(710000),lat:entry.lat,lon:entry.lon,
        tier:'basic',capital:false,marker:false,temp:20,type:'place',description:`县市参考采样点：${entry.sampleName}。天气为该点预报，不能代表全县市。`,image:null,countryCode:'TW',timezone:'Asia/Shanghai',source:'geonames',geoId:entry.geoId,sampleGeoId:entry.sampleGeoId,index:result.length});
    }
    return result;
  }
  function validCustom(c){
    return c&&/^user-[a-zA-Z0-9-]{1,80}$/.test(c.id)&&typeof c.name==='string'&&c.name.trim().length>0&&c.name.length<=40&&finite(c.lat)&&finite(c.lon)
      &&c.lat>=0&&c.lat<=55&&c.lon>=73&&c.lon<=136&&shortNames[c.code]&&c.timezone==='Asia/Shanghai';
  }
  function restoreCustom(value){
    if(!Array.isArray(value))return [];
    return value.slice(0,100).filter(validCustom).map(c=>({id:c.id,name:c.name.trim(),code:c.code,province:shortNames[c.code],region:regionFor(c.code),lat:c.lat,lon:c.lon,
      tier:'custom',capital:false,marker:true,temp:20,type:'place',description:'',image:null,countryCode:({710000:'TW',810000:'HK',820000:'MO'}[c.code]||'CN'),timezone:'Asia/Shanghai',source:c.source==='geonames'?'geonames':'custom',geoId:Number.isInteger(c.geoId)?c.geoId:null}));
  }
  function inRing(lon,lat,ring){
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [xi,yi]=ring[i],[xj,yj]=ring[j];
      if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi))inside=!inside;
    }
    return inside;
  }
  function provinceAt(lon,lat,features){
    for(const feature of features||[]){
      const code=feature.properties.adcode;if(!shortNames[code])continue;
      const polygons=feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[feature.geometry.coordinates];
      if(polygons.some(rings=>inRing(lon,lat,rings[0])&&!rings.slice(1).some(r=>inRing(lon,lat,r))))return Number(code);
    }
    return null;
  }
  function scopeMatches(city,scope){return scope==='all'||city.region===scope||String(city.code)===scope;}
  function diversify(ranked,count=3){
    const seen=new Map();
    // Each round takes one destination per province, retaining weather order within that round.
    return ranked.map((city,index)=>{const round=seen.get(city.code)||0;seen.set(city.code,round+1);return {city,round,index};})
      .sort((a,b)=>a.round-b.round||a.index-b.index).slice(0,count).map(item=>item.city);
  }
  return Object.freeze({provinces,shortNames,regionFor,buildCatalog,validCustom,restoreCustom,provinceAt,scopeMatches,diversify});
})();
