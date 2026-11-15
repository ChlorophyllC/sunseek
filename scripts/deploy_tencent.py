"""Update the existing CloudBase application with runtime files only.

python3 scripts/deploy_tencent.py login
python3 scripts/deploy_tencent.py status
python3 scripts/deploy_tencent.py deploy --dry-run
python3 scripts/deploy_tencent.py deploy

Uses app deploy to preserve the existing application/domain. Never provisions an
application when the existing target cannot be verified. Does not change plans.
"""
import argparse,json,os,shlex,shutil,subprocess,tempfile
from pathlib import Path
from urllib.parse import urlparse
from package_static import ROOT,runtime_files

TARGET_FILE=ROOT/'scripts/tencent-target.json'

def cli_prefix():
 node=ROOT/'.tools/node/bin/node';cli=ROOT/'.tools/cloudbase/node_modules/@cloudbase/cli/bin/tcb'
 if node.is_file() and cli.is_file():return [str(node),str(cli)]
 installed=shutil.which('tcb') or shutil.which('cloudbase')
 if installed:return [installed]
 raise RuntimeError('先运行 python3 scripts/setup_cloudbase.py 安装发布工具。')

def run_cli(arguments,**kwargs):
 env={**os.environ,'PATH':str(ROOT/'.tools/node/bin')+os.pathsep+os.environ.get('PATH','')}
 return subprocess.run([*cli_prefix(),*arguments],env=env,**kwargs)

def decode_cli_json(output):
 # The CLI may put its version banner before the JSON envelope.
 decoder=json.JSONDecoder()
 for position,char in enumerate(output):
  if char!='{':continue
  try:value,_=decoder.raw_decode(output[position:])
  except ValueError:continue
  if isinstance(value,dict):return value
 raise RuntimeError('未取得应用信息 JSON。请先运行 login，再运行 status 检查。')

def verify_target(info,target):
 if isinstance(info.get('data'),dict):info=info['data']
 actual=info.get('url') or info.get('Domain') or ''
 if actual and '://' not in actual:actual='https://'+actual
 expected=urlparse(target['url']);actual_url=urlparse(actual)
 if info.get('ServiceName')!=target['serviceName']:raise RuntimeError('云端应用名称与目标不一致，未执行发布。')
 if info.get('DeployType') not in [None,'static-hosting']:raise RuntimeError('目标不是静态托管应用，未执行发布。')
 if actual_url.scheme!='https' or actual_url.hostname!=expected.hostname:raise RuntimeError('云端访问网址与现有站点不一致，未执行发布。')
 # Independent webapps domains expose / while their static files may live at /<service>.
 # Keep the app's existing mount; never turn a mismatched mount into a root upload.
 public_path=(actual_url.path or '/').rstrip('/') or '/'
 expected_path=target['deployPath'].rstrip('/') or '/'
 mount=(info.get('AppPath') or public_path).rstrip('/') or '/'
 independent=expected.hostname.endswith('.webapps.tcloudbase.com')
 allowed={expected_path}
 if independent and expected_path=='/':allowed.add('/'+target['serviceName'])
 if public_path!=expected_path or mount not in allowed:
  raise RuntimeError(f'云端部署路径与目标不一致，未执行发布（访问路径 {public_path}，挂载路径 {mount}）。')
 return {'serviceName':info['ServiceName'],'url':target['url'],'version':info.get('LatestVersionName'),'deployPath':mount}

def describe_target(target):
 result=run_cli(['app','info',target['serviceName'],'-e',target['envId'],'--json'],capture_output=True,text=True,stdin=subprocess.DEVNULL)
 if result.returncode:raise RuntimeError('无法核对云端应用，未执行发布。请先运行 login；若已登录，请用 tcb app list 核对环境中的应用名称。')
 return verify_target(decode_cli_json(result.stdout),target)

def publish(target,dry_run=False):
 files=runtime_files()
 deploy_path=target['deployPath']
 if not dry_run:
  verified=describe_target(target);deploy_path=verified['deployPath']
  print('目标已核对：'+json.dumps(verified,ensure_ascii=False),flush=True)
 with tempfile.TemporaryDirectory(prefix='sunseek-publish-') as temp:
  stage=Path(temp)
  for source in files:
   destination=stage/source.relative_to(ROOT);destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
  args=['app','deploy',target['serviceName'],'-e',target['envId'],'--framework','static','--install-command','','--build-command','','--output-dir','./','--deploy-path',deploy_path,'--force']
  print(json.dumps({'environment':target['envId'],'application':target['serviceName'],'url':target['url'],'runtimeFiles':len(files),'uncompressedBytes':sum(p.stat().st_size for p in files),'dryRun':dry_run},ensure_ascii=False),flush=True)
  if dry_run:
   print('预览命令（临时目录仅含运行文件）：tcb '+shlex.join(args));return
  result=run_cli(args,cwd=stage)
  if result.returncode:raise RuntimeError('腾讯云发布未完成，请查看上方日志。')
 print('发布命令已完成；请等待平台发布生效后刷新验收：'+target['url'])

def main():
 parser=argparse.ArgumentParser(description='晴游腾讯云应用更新工具')
 parser.add_argument('action',choices=['login','status','deploy'])
 parser.add_argument('--dry-run',action='store_true',help='仅检查发布文件和命令，不联网或上传')
 args=parser.parse_args();target=json.loads(TARGET_FILE.read_text())
 try:
  if args.action=='login':raise SystemExit(run_cli(['login','--flow','device']).returncode)
  if args.action=='status':print(json.dumps(describe_target(target),ensure_ascii=False,indent=2))
  if args.action=='deploy':publish(target,args.dry_run)
 except (RuntimeError,OSError,ValueError) as error:raise SystemExit(str(error))
if __name__=='__main__':main()
