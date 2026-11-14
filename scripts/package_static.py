"""Package only runtime files for Tencent CloudBase static hosting.

Usage: python3 scripts/package_static.py /tmp/sunseek-tencent-static.zip
No cloud credentials, uploads, provisioning or third-party build tools are involved.
"""
import hashlib,json,sys
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED

ROOT=Path(__file__).resolve().parent.parent
RUNTIME=['index.html','styles.css','app.js','weather.js','destinations.js','attractions.js','backup.js','search.js']

def runtime_files():
 files=[ROOT/name for name in RUNTIME]+sorted(p for p in (ROOT/'assets').rglob('*') if p.is_file() and p.name!='.DS_Store')
 if any(not p.is_file() or p.is_symlink() or not p.resolve().is_relative_to(ROOT) for p in files):raise ValueError('Runtime files must be ordinary project files')
 return files

def main():
 target=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/sunseek-tencent-static.zip').expanduser().resolve()
 files=runtime_files()
 if target==ROOT or target.is_relative_to(ROOT/'assets') or target in files:raise ValueError('Output must not overwrite a runtime file or be inside assets')
 target.parent.mkdir(parents=True,exist_ok=True)
 with ZipFile(target,'w',compression=ZIP_DEFLATED,compresslevel=9) as archive:
  for path in files:archive.write(path,path.relative_to(ROOT).as_posix())
 with ZipFile(target) as archive:
  assert archive.testzip() is None and len(archive.namelist())==len(files)
  assert 'index.html' in archive.namelist()
  assert not any(name.startswith(('.git/','tests/','docs/','scripts/')) for name in archive.namelist())
 print(json.dumps({'path':str(target),'files':len(files),'uncompressedBytes':sum(p.stat().st_size for p in files),'zipBytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()},ensure_ascii=False))

if __name__=='__main__':main()
