'use strict';

// One relevance model for map scopes, saved/catalog places, the local atlas and online results.
window.SunseekSearch=(()=>{
  const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  const suffix=/(特别行政区|特別行政區|维吾尔自治区|維吾爾自治區|壮族自治区|壯族自治區|回族自治区|自治县|自治縣|自治区|自治區|自治州|地区|地區|省|市|县|縣|区|區|乡|鄉|镇|鎮|村|旗|岛|島|山)$/u;
  function fold(value){const n=normalize(value),base=n.replace(suffix,'');return base.length>=2?base:n;}
  const unique=values=>[...new Set(values.filter(Boolean))];
  function prepare(entity){
    const names=unique([entity.name,entity.fullName,...(entity.aliases||[])].map(normalize));
    const roots=unique(names.map(fold));
    const contexts=unique((entity.parents||[]).flatMap(p=>[normalize(p),fold(p)]));
    const signatures=unique(contexts.flatMap(p=>[...names,...roots].map(n=>p+n)));
    // Province + prefecture + name also matches text pasted without spaces.
    if(entity.parents?.length>1){const paths=entity.parentPaths||[entity.parents.map(fold).join('')];for(const path of paths)signatures.push(...[...names,...roots].map(n=>normalize(path)+n));}
    return {...entity,_search:{names,roots,contexts,signatures}};
  }
  function score(entity,query){
    const q=normalize(query);if(!q)return entity.kind==='city'?1:0;
    const f=fold(q),s=entity._search;let value=0;
    if(s.names[0]===q)value=1080;
    else if(s.names.includes(q))value=1000;
    else if(s.signatures.includes(q))value=1050;
    else if(s.roots.includes(f))value=900;
    else if(s.signatures.includes(f))value=920;
    else if(q.length>=2&&s.names.some(n=>n.startsWith(q)))value=650;
    else if(q.length>=2&&s.names.some(n=>n.includes(q)))value=500;
    else if(q.length>=2&&s.signatures.some(n=>n.includes(q)))value=440;
    // Split terms may appear in either the name or its administrative context.
    const terms=query.trim().split(/[\s,，·/]+/u).map(normalize).filter(Boolean);
    if(!value&&terms.length>1&&terms.some(t=>s.names.some(n=>n.includes(t)))&&terms.every(t=>[...s.names,...s.contexts].some(n=>n.includes(t))))value=800;
    if(!value)return 0;
    if(/[岛島]$/.test(query)&&/^ISL/.test(entity.feature||''))value+=70;
    if(entity.kind==='scope')value+=35;
    if(entity.kind==='city')value+=25;
    if(['ADM2','ADM3','PPLA','PPLA2','PPLA3','PPLC'].includes(entity.feature))value+=10;
    return value+Math.min(9,Math.log10((entity.population||0)+1));
  }
  function rank(entities,query,limit=60){
    return entities.map((entity,index)=>({entity,index,score:score(entity,query)})).filter(r=>r.score>0)
      .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(r=>r.entity);
  }
  function queryPlan(query,entities){
    const best=rank(entities,query,1)[0];
    if(best&&best.kind!=='scope'&&score(best,query)>=900){
      return {name:normalize(best.queryName||best.name),...(best.countryCode?{countryCode:best.countryCode}:{})};
    }
    const q=normalize(query);let leaf=query.trim(),country='';
    // Derive qualifiers from the same administrative index instead of per-place rewrite rules.
    const contexts=unique(entities.flatMap(e=>e.parents||[])).flatMap(p=>[normalize(p),fold(p)]).filter(p=>p.length>=2).sort((a,b)=>b.length-a.length);
    const prefix=contexts.find(p=>q.startsWith(p)&&q.length-p.length>=2);
    if(prefix){leaf=q.slice(prefix.length);const parent=entities.find(e=>(e.parents||[]).some(p=>[normalize(p),fold(p)].includes(prefix)));country=parent?.countryCode||'';}
    const name=fold(leaf);
    return {name:name.length>=2?name:leaf,...(country?{countryCode:country}:{})};
  }
  return Object.freeze({normalize,fold,prepare,score,rank,queryPlan});
})();
