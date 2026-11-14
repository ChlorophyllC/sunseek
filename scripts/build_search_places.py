"""Build the search-only GeoNames atlas and Taiwan county/city sampling catalog.

Usage: PYTHONPATH=/tmp/sunseek-build-deps python3 scripts/build_search_places.py /tmp
Requires opencc-python-reimplemented (build time only). Inputs are official CN/HK/MO/TW.zip
from https://download.geonames.org/export/dump/. Never adds the search atlas to forecast targets.
"""
import hashlib,json,re,sys
from datetime import date
from pathlib import Path
from zipfile import ZipFile
from opencc import OpenCC
ROOT=Path(__file__).resolve().parent.parent
simplify=OpenCC('t2s').convert
traditional=OpenCC('s2t').convert
han=re.compile(r'^[\u3400-\u9fff·（）()\s-]+$')
short_block=re.search(r'const shortNames=(\{[^;]+\});',(ROOT/'destinations.js').read_text()).group(1)
short={int(k):v for k,v in re.findall(r"(\d{6}):'([^']+)'",short_block)}
assert len(short)==34 and short[710000]=='台湾'
def variants(values):
 return list(dict.fromkeys(v for value in values if value for v in [value,simplify(value),traditional(value)]))
def aliases(row):
 return variants([a for a in [row[1],*row[3].split(',')] if han.fullmatch(a)])
def name(row):
 # Reviewed current Chinese label; both names remain source aliases.
 if row[0]=='1678008':return '金城'
 names=[simplify(a) for a in aliases(row)]
 if row[7].startswith('ADM'):
  return next((n for n in names if n.endswith(('市','县','区','州','旗'))),next(iter(names),row[1]))
 return next(iter(names),row[1])
def core(value):
 return re.sub(r'(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市|县)$','',simplify(value))
features={'ADM2','ADM3','PPLC','PPLA','PPLA2','PPLA3','PPLA4','ISL','ISLS','MT'}
rows=[];sources=[]
for country in ['CN','HK','MO','TW']:
 path=Path(sys.argv[1])/f'sunseek-geonames-{country}.zip'
 sources.append({'country':country,'url':f'https://download.geonames.org/export/dump/{country}.zip','sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 with ZipFile(path) as z,z.open(country+'.txt') as stream:
  for line in stream:
   row=line.decode().rstrip('\r\n').split('\t')
   if row[7] in features or row[7]=='ADM1' or (country in ['HK','MO'] and row[7]=='PPL'):rows.append(row)
admin={tuple([r[8],*r[10:10+int(r[7][-1])]]):r for r in rows if re.fullmatch('ADM[1-4]',r[7])}
province_map={}
for r in rows:
 if r[8]=='CN' and r[7]=='ADM1':
  match=next((code for code,label in short.items() if label in [core(a) for a in aliases(r)]),None)
  if match:province_map[r[10]]=match
assert len(province_map)==31,province_map
atlas=[];contexts=[];context_ids={}
for r in rows:
 if r[7] not in features and not(r[8] in ['HK','MO'] and r[7] in ['ADM1','PPL']):continue
 code={'HK':810000,'MO':820000,'TW':710000}.get(r[8],province_map.get(r[10]))
 if not code:continue
 ns=aliases(r)
 # Keep only primary/ascii Latin spellings, avoiding hundreds of unrelated transliterations.
 ns=list(dict.fromkeys([*ns,r[1],r[2]]))
 parents=[short[code]]
 for level in [2,3]:
  parent=admin.get(tuple([r[8],*r[10:10+level]]))
  if parent and parent[0]!=r[0]:parents.append(name(parent))
 context_key=tuple(parents)
 if context_key not in context_ids:
  context_ids[context_key]=len(contexts);contexts.append([variants(parents),parents,variants([''.join(core(p) for p in parents)])])
 atlas.append([int(r[0]),name(r),ns,round(float(r[4]),5),round(float(r[5]),5),code,context_ids[context_key],r[7],int(r[14] or 0),r[8]])
metadata={'license':'CC BY 4.0','attribution':'GeoNames','downloadedAt':date.today().isoformat(),'sources':sources,'features':sorted(features),'contexts':contexts,'rows':atlas}
(ROOT/'assets/search-places.json').write_text(json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+'\n')
# County/city labels use ADM2 identities, weather uses a sourced administrative seat.
taiwan=[]
for r in rows:
 if r[8]!='TW' or r[7]!='ADM2':continue
 label=next(a for a in dict.fromkeys(map(simplify,aliases(r))) if a.endswith(('市','县')))
 seats=[s for s in rows if s[8]=='TW' and s[10:12]==r[10:12] and s[7] in ['PPLC','PPLA','PPLA2']]
 # Prefer the seat sharing the county's name, then population, then stable source identity.
 seats.sort(key=lambda s:(-int(any(core(a)==core(label) for a in aliases(s))),-int(s[14] or 0),int(s[0])))
 assert seats,label
 seat=seats[0]
 taiwan.append({'geoId':int(r[0]),'name':label,'aliases':variants([label,core(label),*([r[1],r[2]])]),'lat':float(seat[4]),'lon':float(seat[5]),'sampleName':name(seat),'sampleGeoId':int(seat[0])})
assert len(taiwan)==22 and len({r['name'] for r in taiwan})==22
(ROOT/'assets/taiwan-places.js').write_text('// GeoNames CC BY 4.0; county/city identities with sourced administrative-seat sampling points.\nwindow.TAIWAN_PLACES='+json.dumps(taiwan,ensure_ascii=False,separators=(',',':'))+';\n')
print(f'{len(atlas)} search entries; {len(taiwan)} Taiwan counties/cities; { (ROOT/"assets/search-places.json").stat().st_size:,} bytes')
print([(r['name'],r['sampleName']) for r in taiwan])
