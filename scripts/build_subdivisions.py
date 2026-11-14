"""Build decorative child boundaries from the same cached DataV files as places.

Usage: python3 scripts/build_subdivisions.py /tmp
Inputs: sunseek-area-{province}.json, downloaded from
https://geo.datav.aliyun.com/areas_v3/bound/{province}_full.json
No network calls. Invalid/missing files have no invented replacement.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def simplify(points, tolerance=.003):
    """Douglas–Peucker with a small angular tolerance for decorative outlines."""
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = dx * dx + dy * dy
    def distance(p):
        t = max(0, min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)) if length else 0
        return math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy)
    index = max(range(1, len(points)-1), key=lambda i: distance(points[i]))
    if distance(points[index]) <= tolerance:
        return [a, b]
    return simplify(points[:index+1], tolerance)[:-1] + simplify(points[index:], tolerance)


def main():
    source = Path(sys.argv[1])
    output = ROOT / 'assets/subdivisions'
    output.mkdir(exist_ok=True)
    geo = json.loads((ROOT/'assets/china.js').read_text().removeprefix('window.CHINA_GEO=').removesuffix(';'))
    records = []
    for province in geo['features']:
        code = province['properties'].get('adcode')
        if not isinstance(code, int):
            continue
        try:
            features = json.loads((source/f'sunseek-area-{code}.json').read_text())['features']
        except (OSError, ValueError, KeyError):
            features = []
        lines = []
        for feature in features:
            geometry = feature['geometry']
            polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
            for polygon in polygons:
                for ring in polygon:
                    # Preserve enough detail for small Hong Kong/Macao districts.
                    reduced = simplify(ring, .00015 if code in [810000, 820000] else .003)
                    if len(reduced) >= 4:
                        lines.append([[round(x, 4), round(y, 4)] for x, y in reduced])
        payload = {'province': code, 'children': len(features), 'lines': lines}
        path = output/f'{code}.json'
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'))+'\n')
        records.append({'province': code, 'children': len(features), 'bytes': path.stat().st_size,
                        'source': f'https://geo.datav.aliyun.com/areas_v3/bound/{code}_full.json'})
    (output/'sources.json').write_text(json.dumps(records, ensure_ascii=False, indent=2)+'\n')
    print(f'Built {len(records)} province files; {sum(r["bytes"] for r in records):,} bytes')


if __name__ == '__main__':
    main()
