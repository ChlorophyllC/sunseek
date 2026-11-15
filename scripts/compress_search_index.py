"""Build/check the gzip search asset without changing its source data or needing downloads."""
import argparse,gzip,io,json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

def compressed(source):
 output=io.BytesIO()
 with gzip.GzipFile(filename='',mode='wb',fileobj=output,compresslevel=9,mtime=0) as stream:stream.write(source)
 return output.getvalue()

def build(check=False):
 source=ROOT/'assets/search-places.json';target=source.with_suffix('.json.gz')
 raw=source.read_bytes();packed=compressed(raw)
 if check:
  if not target.is_file() or target.read_bytes()!=packed:raise SystemExit('Search gzip is stale; run python3 scripts/compress_search_index.py')
 else:target.write_bytes(packed)
 print(json.dumps({'sourceBytes':len(raw),'gzipBytes':len(packed),'savedPercent':round((1-len(packed)/len(raw))*100,1),'checked':check}))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');build(parser.parse_args().check)
