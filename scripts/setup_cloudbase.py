"""Install project-local Node/CloudBase CLI; does not log in, provision or publish.
Usage: python3 scripts/setup_cloudbase.py
"""
import hashlib,json,os,platform,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
TOOLS=ROOT/'.tools'
VERSIONS=json.loads((ROOT/'scripts/cloudbase-tools.json').read_text())

def fetch(url,target):
 subprocess.run(['curl','-fLsS','--retry','2','--connect-timeout','20','--max-time','180',url,'-o',str(target)],check=True)
def main():
 system={'Darwin':'darwin','Linux':'linux'}.get(platform.system())
 arch={'arm64':'arm64','aarch64':'arm64','x86_64':'x64','AMD64':'x64'}.get(platform.machine())
 if not system or not arch:raise SystemExit('此安装脚本支持 macOS/Linux arm64/x64；其他平台请安装 Node.js 22+ 和 @cloudbase/cli。')
 TOOLS.mkdir(exist_ok=True)
 name=f"node-{VERSIONS['node']}-{system}-{arch}";node_dir=TOOLS/name;archive=TOOLS/(name+'.tar.xz')
 if not (node_dir/'bin/node').is_file():
  base=f"https://nodejs.org/dist/{VERSIONS['node']}"
  checksum=TOOLS/'node-SHASUMS256.txt';fetch(base+'/SHASUMS256.txt',checksum)
  expected=next((line.split()[0] for line in checksum.read_text().splitlines() if line.split()[-1]==archive.name),None)
  if not expected:raise SystemExit('官方校验清单中未找到对应 Node.js 文件。')
  fetch(base+'/'+archive.name,archive)
  if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise SystemExit('Node.js SHA-256 校验失败，停止安装。')
  with tarfile.open(archive) as source:
   if not all(member.name==name or member.name.startswith(name+'/') for member in source.getmembers()):raise SystemExit('Node.js 归档目录异常。')
   source.extractall(TOOLS,filter='data')
 link=TOOLS/'node'
 if link.is_symlink():link.unlink()
 elif link.exists():raise SystemExit('.tools/node 已存在且不是本工具的符号链接，请先检查。')
 link.symlink_to(name,target_is_directory=True)
 env={**os.environ,'PATH':str(node_dir/'bin')+os.pathsep+os.environ.get('PATH','')}
 target=TOOLS/'cloudbase';package=target/'node_modules/@cloudbase/cli/package.json'
 if not package.is_file() or json.loads(package.read_text()).get('version')!=VERSIONS['cli']:
  subprocess.run([str(node_dir/'bin/npm'),'install','--prefix',str(target),'--cache',str(TOOLS/'npm-cache'),'--no-audit','--no-fund','--ignore-scripts',f"@cloudbase/cli@{VERSIONS['cli']}"],env=env,check=True)
 subprocess.run([str(target/'node_modules/.bin/tcb'),'-v'],env=env,check=True)
 print('发布工具已就绪。首次授权：python3 scripts/deploy_tencent.py login')
if __name__=='__main__':main()
