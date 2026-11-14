"""Publish target identity and runtime staging checks; no real cloud calls."""
import contextlib,importlib.util,io,json,sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent.parent;sys.path.insert(0,str(ROOT/'scripts'))
import deploy_tencent as D
T=json.loads(D.TARGET_FILE.read_text())
INFO={'ServiceName':T['serviceName'],'Domain':T['url'].removeprefix('https://'),'AppPath':'/','DeployType':'static-hosting','LatestVersionName':'existing'}
assert D.verify_target(INFO,T)['url']==T['url']
for bad in [dict(INFO,ServiceName='another-app'),dict(INFO,Domain='another.example.com'),dict(INFO,AppPath='/another'),dict(INFO,DeployType='http-function'),dict(INFO,url=T['url'].replace('https:','http:'))]:
 try:D.verify_target(bad,T)
 except RuntimeError:pass
 else:raise AssertionError('wrong cloud target accepted')
assert D.decode_cli_json('CloudBase CLI\n'+json.dumps({'data':INFO}))['data']==INFO
calls=[]
def fake_cli(args,**kwargs):
 calls.append(args)
 if args[:2]==['app','info']:return SimpleNamespace(returncode=0,stdout=json.dumps({'data':INFO}))
 assert args[:3]==['app','deploy','sunseek']
 stage=Path(kwargs['cwd']);names={str(p.relative_to(stage)) for p in stage.rglob('*') if p.is_file()}
 expected={str(p.relative_to(ROOT)) for p in D.runtime_files()}
 assert names==expected and 'index.html' in names
 assert not any(n.startswith(('.git/','.tools/','docs/','tests/','scripts/')) for n in names)
 assert args[args.index('--framework')+1]=='static' and args[args.index('--deploy-path')+1]=='/'
 return SimpleNamespace(returncode=0)
with patch.object(D,'run_cli',fake_cli),contextlib.redirect_stdout(io.StringIO()):D.publish(T)
assert len(calls)==2
calls.clear()
with patch.object(D,'run_cli',fake_cli),contextlib.redirect_stdout(io.StringIO()):D.publish(T,dry_run=True)
assert not calls,'dry run must not touch cloud services'
with patch.object(D,'run_cli',lambda *a,**k:SimpleNamespace(returncode=1)),contextlib.redirect_stdout(io.StringIO()):
 try:D.publish(T)
 except RuntimeError:pass
 else:raise AssertionError('failed preflight continued to publish')
print('PASS deploy target identity, missing-target stop, runtime-only staging, static options and network-free dry run')
