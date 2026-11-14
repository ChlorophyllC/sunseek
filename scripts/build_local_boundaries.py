"""Build static detailed outlines from downloaded public map data.
Usage: python3 scripts/build_local_boundaries.py /tmp
Inputs:
- sunseek-outline-810000.json: https://geo.datav.aliyun.com/areas_v3/bound/810000.json
- sunseek-natural-earth.geojson: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson
Natural Earth is public domain. Only the Macao land geometry is extracted;
DataV Macao polygons include waters, unsuitable as a land silhouette.
"""
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
root = Path(__file__).resolve().parent.parent
hongkong = json.loads((source / 'sunseek-outline-810000.json').read_text())['features'][0]
macao = next(f for f in json.loads((source / 'sunseek-natural-earth.geojson').read_text())['features'] if f['properties']['ADM0_A3'] == 'MAC')
features = [
    {'type': 'Feature', 'properties': {'adcode': 810000, 'name': '香港特别行政区'}, 'geometry': hongkong['geometry']},
    {'type': 'Feature', 'properties': {'adcode': 820000, 'name': '澳门特别行政区'}, 'geometry': macao['geometry']},
]
data = {'type': 'FeatureCollection', 'features': features}
(root / 'assets/local-boundaries.js').write_text(
    '// Hong Kong: Alibaba DataV; Macao land: Natural Earth (public domain). Rebuild: scripts/build_local_boundaries.py.\n'
    + 'window.LOCAL_BOUNDARIES=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
)
print('Wrote detailed Hong Kong and Macao outlines')
