"""Build a compact administrative place index from downloaded DataV province files.
Usage: python3 scripts/build_places.py /tmp
Source: https://geo.datav.aliyun.com/areas_v3/bound/{province}_full.json
Taiwan has no matching full file here; build_search_places.py generates its separate GeoNames sampling catalog.
"""
import json,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
geo=json.loads((root/'assets/china.js').read_text().removeprefix('window.CHINA_GEO=').removesuffix(';'))
rows=[]
for feature in geo['features']:
 code=feature['properties'].get('adcode')
 if not isinstance(code,int):continue
 path=Path(sys.argv[1])/f'sunseek-area-{code}.json'
 try:children=json.loads(path.read_text())['features']
 except (OSError,ValueError,KeyError):continue
 for child in children:
  p=child['properties'];center=p.get('center') or p.get('centroid')
  if center and isinstance(p.get('adcode'),int):rows.append([p['adcode'],p['name'],code,round(center[1],5),round(center[0],5),p.get('level','city')])
(root/'assets/places.js').write_text('// Administrative index: Alibaba DataV; rebuild with scripts/build_places.py.\nwindow.PLACE_ROWS='+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n')
print(f'Wrote {len(rows)} administrative entries')
