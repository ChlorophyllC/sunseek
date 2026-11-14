'use strict';

// Portable user records only. Never includes weather caches or temporary previews.
window.SunseekBackup = (() => {
  const MAX_BYTES=2*1024*1024;
  const KEYS=['sunseek-places-v3','sunseek-footprints-v1','sunseek-wishlist-v1','sunseek-preferences-v2'];
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const string=(value,max)=>typeof value==='string'&&value.length<=max;
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  function validateData(data,basePlaces){
    check(object(data),'备份缺少旅行记录。');
    check(Array.isArray(data.places)&&data.places.length<=100,'个人地点最多支持 100 个。');
    const places=[],ids=new Set(basePlaces.map(p=>p.id));
    for(const p of data.places){
      check(object(p)&&typeof p.id==='string'&&window.SunseekPlaces.validCustom(p)
        &&Number.isInteger(p.code)&&Object.hasOwn(window.SunseekPlaces.shortNames,p.code)
        &&['custom','geonames'].includes(p.source)&&(p.geoId===null||Number.isSafeInteger(p.geoId)&&p.geoId>0),'备份中的个人地点名称、坐标或归属格式不正确。');
      check(!ids.has(p.id),'备份中存在重复的地点编号。');ids.add(p.id);
      places.push({id:p.id,name:p.name.trim(),lat:p.lat,lon:p.lon,code:p.code,timezone:'Asia/Shanghai',source:p.source,geoId:p.geoId});
    }
    check(Array.isArray(data.footprints)&&data.footprints.length<=1000,'足迹记录格式或数量不正确。');
    const seen=new Set();
    const footprints=data.footprints.map(f=>{
      check(object(f)&&typeof f.placeId==='string'&&ids.has(f.placeId),'有足迹未关联到备份地点或当前地点库，请使用兼容版本。');
      check(!seen.has(f.placeId)&&string(f.note,300)&&string(f.savedAt,80),'足迹笔记格式不正确或存在重复记录。');seen.add(f.placeId);
      return {placeId:f.placeId,note:f.note,savedAt:f.savedAt};
    });
    check(Array.isArray(data.wishlist)&&data.wishlist.length<=100,'想去清单最多支持 100 项。');
    seen.clear();
    const wishlist=data.wishlist.map(item=>{
      check(object(item)&&window.SunseekAttractions.validItem(item)&&String(item.id).length<=120
        &&string(item.description,400)&&string(item.cityName,60),'想去清单中的地点或简介格式不正确。');
      check(!seen.has(String(item.id)),'备份中存在重复的收藏编号。');seen.add(String(item.id));
      return window.SunseekAttractions.cleanItem(item);
    });
    let preferences=null;
    if(data.preferences!==null){
      const p=data.preferences;
      check(object(p)&&typeof p.origin==='string'&&(p.origin===''||ids.has(p.origin))
        &&Number.isInteger(p.hourStart)&&Number.isInteger(p.hourEnd)&&p.hourStart>=6&&p.hourEnd<=22&&p.hourStart<p.hourEnd
        &&[null,200,500,1000,2000].includes(p.maxDistance)&&(p.origin!==''||p.maxDistance===null),'出发地、距离或活动时段格式不正确。');
      preferences={origin:p.origin,hourStart:p.hourStart,hourEnd:p.hourEnd,maxDistance:p.maxDistance};
    }
    return {places,footprints,wishlist,preferences};
  }
  function parse(text,basePlaces){
    check(new Blob([text]).size<=MAX_BYTES,'备份文件过大，最多支持 2 MB。');
    let file;
    try{file=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('文件无法识别，请选择晴游导出的 JSON 备份。');}
    check(object(file)&&file.format==='sunseek-backup','这不是晴游备份文件。');
    check(file.version===1,'暂不支持这个备份版本，请使用兼容版本的晴游。');
    check(typeof file.exportedAt==='string'&&Number.isFinite(Date.parse(file.exportedAt)),'备份导出时间格式不正确。');
    return {exportedAt:file.exportedAt,data:validateData(file.data,basePlaces)};
  }
  function encode(data,basePlaces){
    return JSON.stringify({format:'sunseek-backup',version:1,exportedAt:new Date().toISOString(),data:validateData(data,basePlaces)},null,2)+'\n';
  }
  function merge(current,incoming,basePlaces,usePreferences=false,idFactory=()=>`user-${crypto.randomUUID()}`){
    const places=current.places.map(p=>({...p})),mapping=new Map(),all=[...basePlaces,...places];
    const used=new Set(all.map(p=>p.id));
    const stats={places:0,footprints:0,wishlist:0,duplicates:0,conflicts:0,remapped:0};
    for(const p of incoming.places){
      const existing=all.find(c=>c.id===p.id&&c.code===p.code&&window.SunseekWeather.distanceKm(c,p)<.01)
        ||all.find(c=>c.code===p.code&&((p.geoId&&c.geoId===p.geoId)||(c.name===p.name&&window.SunseekWeather.distanceKm(c,p)<1)));
      if(existing){mapping.set(p.id,existing.id);stats.duplicates++;if(existing.name!==p.name||existing.lat!==p.lat||existing.lon!==p.lon)stats.conflicts++;continue;}
      let id=p.id;
      if(used.has(id)){
        let attempts=0;
        do{id=idFactory();check(++attempts<=10&&typeof id==='string'&&/^user-[a-zA-Z0-9-]{1,80}$/.test(id),'无法为导入地点分配编号，请重试。');}while(used.has(id));
        stats.remapped++;
      }
      const added={...p,id};places.push(added);all.push(added);used.add(id);mapping.set(p.id,id);stats.places++;
    }
    check(places.length<=100,'合并后个人地点超过 100 个，请先整理本机地点。');
    const footprints=current.footprints.map(f=>({...f})),visits=new Map(footprints.map(f=>[f.placeId,f]));
    for(const f of incoming.footprints){
      const placeId=mapping.get(f.placeId)||f.placeId,existing=visits.get(placeId);
      if(existing){stats.duplicates++;if(existing.note!==f.note||existing.savedAt!==f.savedAt)stats.conflicts++;continue;}
      const added={...f,placeId};footprints.push(added);visits.set(placeId,added);stats.footprints++;
    }
    const wishlist=current.wishlist.map(p=>({...p})),saved=new Map(wishlist.map(p=>[String(p.id),p]));
    for(const p of incoming.wishlist){
      const existing=saved.get(String(p.id));
      if(existing){stats.duplicates++;if(JSON.stringify(existing)!==JSON.stringify(p))stats.conflicts++;continue;}
      const added={...p};wishlist.push(added);saved.set(String(p.id),added);stats.wishlist++;
    }
    check(wishlist.length<=100,'合并后想去清单超过 100 项，请先整理本机收藏。');
    let preferences=current.preferences;
    if(usePreferences&&incoming.preferences){preferences={...incoming.preferences,origin:mapping.get(incoming.preferences.origin)||incoming.preferences.origin};}
    const data={places,footprints,wishlist,preferences};
    return {data,stats,changed:JSON.stringify(current)!==JSON.stringify(data)};
  }
  function storageSnapshot(storage){return Object.fromEntries(KEYS.map(key=>[key,storage.getItem(key)]));}
  function assertCurrentStorage(raw,current,basePlaces){
    // Never silently overwrite records omitted by an older loader or a stale tab.
    let stored;
    try{
      const originalPlaces=JSON.parse(raw[KEYS[0]]||'[]');
      check(Array.isArray(originalPlaces),'');
      const restored=window.SunseekPlaces.restoreCustom(originalPlaces);
      check(restored.length===originalPlaces.length,'');
      const places=restored.map(p=>({id:p.id,name:p.name,lat:p.lat,lon:p.lon,code:p.code,timezone:p.timezone,source:p.source,geoId:p.geoId}));
      const originalVisits=JSON.parse(raw[KEYS[1]]||'{}');check(object(originalVisits),'');
      const footprints=Object.entries(originalVisits).map(([placeId,f])=>{
        check(object(f)&&(f.note===undefined||string(f.note,300))&&(f.savedAt===undefined||string(f.savedAt,80)),'');
        return {placeId,note:f.note??'',savedAt:f.savedAt??current.footprints.find(item=>item.placeId===placeId)?.savedAt??''};
      });
      const originalSaved=JSON.parse(raw[KEYS[2]]||'[]');
      check(Array.isArray(originalSaved)&&originalSaved.every(p=>window.SunseekAttractions.validItem(p)
        &&(p.description===undefined||string(p.description,400))&&(p.cityName===undefined||string(p.cityName,60))),'');
      const wishlist=originalSaved.map(p=>window.SunseekAttractions.cleanItem(p));
      const preferences=raw[KEYS[3]]===null?current.preferences:JSON.parse(raw[KEYS[3]]);
      stored=validateData({places,footprints,wishlist,preferences},basePlaces);
    }catch{throw new Error('本机有无法完整识别的记录，暂不导入以免覆盖。仍可导出当前页面的记录。');}
    check(JSON.stringify(stored)===JSON.stringify(current),'本机存储与当前页面不同，请先导出记录，再刷新页面同步后重新导入。');
  }
  function write(storage,data,expected){
    const previous=storageSnapshot(storage);
    check(KEYS.every(key=>previous[key]===expected[key]),'本机数据已发生变化，请重新选择备份文件以更新预览。');
    const visits=Object.create(null);
    data.footprints.forEach(f=>{visits[f.placeId]={savedAt:f.savedAt,note:f.note};});
    const values=[data.places,visits,data.wishlist,data.preferences].map(value=>JSON.stringify(value));
    const written=[];
    try{
      KEYS.forEach((key,index)=>{if(previous[key]!==values[index]){storage.setItem(key,values[index]);written.push(key);}});
    }catch{
      let restored=true;
      // Free the new allocations first so quota pressure cannot prevent rollback.
      for(const key of written){try{storage.removeItem(key);}catch{restored=false;}}
      for(const key of written.reverse()){
        try{if(previous[key]===null)storage.removeItem(key);else storage.setItem(key,previous[key]);}catch{restored=false;}
      }
      const error=new Error(restored?'浏览器未能保存导入数据，已还原原数据。可导出备份后，检查存储空间再试。':'导入未完成，部分存储未能还原。请先导出当前页面保留的原数据，再关闭页面。');
      error.recoveryNeeded=!restored;throw error;
    }
  }
  return Object.freeze({MAX_BYTES,validateData,parse,encode,merge,storageSnapshot,assertCurrentStorage,write});
})();
