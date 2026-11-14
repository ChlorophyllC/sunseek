"""Provision/update only the weather cache, without publishing the static website.
No paid-plan changes, new environments, default-context changes or permanent keys.
"""
import argparse,json,subprocess,tempfile
from pathlib import Path
from deploy_tencent import ROOT,run_cli,decode_cli_json
TARGET=json.loads((ROOT/'scripts/tencent-target.json').read_text())
SERVER=ROOT/'server';NAME='sunseek-weather-cache'
def checked(args):
 result=run_cli(args,capture_output=True,text=True,stdin=subprocess.DEVNULL)
 if result.returncode:raise RuntimeError(result.stderr or result.stdout or 'CloudBase command failed')
 return decode_cli_json(result.stdout).get('data',{})
def preflight():
 info=checked(['env','detail','-e',TARGET['envId'],'--json','--yes'])
 if info.get('EnvId')!=TARGET['envId'] or info.get('Region')!='ap-shanghai' or not info.get('PostgreSQL'):raise RuntimeError('Wrong environment or PostgreSQL unavailable')
 print(json.dumps({k:info.get(k) for k in ['EnvId','Region','PackageId','EnvStatus']},ensure_ascii=False),flush=True)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['init-db','deploy','status','function-url','verify-db']);p.add_argument('--coverage',choices=['featured','all'],default='all');args=p.parse_args()
 preflight()
 if args.action=='init-db':
  checked(['db','execute','-e',TARGET['envId'],'--sql',(SERVER/'weather-cache/schema.sql').read_text(),'--json']);print('Private weather cache schema ready')
 elif args.action=='verify-db':
  checked(['db','execute','-e',TARGET['envId'],'--sql',(ROOT/'tests/shared_weather_db.sql').read_text(),'--json']);print('PASS live cache invariants; test transaction rolled back')
 elif args.action=='function-url':
  data=checked(['api','scf','GetFunction','-e',TARGET['envId'],'--body',json.dumps({'Namespace':TARGET['envId'],'FunctionName':NAME}),'--json'])
  trigger=next((t for t in data.get('Triggers',[]) if t.get('Type')=='http'),None)
  if trigger:
   config=json.loads(trigger['TriggerDesc'])
  else:
   origins=[TARGET['url'],'http://localhost:4173','http://127.0.0.1:4173']
   config={'AuthType':'NONE','NetConfig':{'EnableIntranet':False,'EnableExtranet':True},'CorsConfig':{'Enable':True,'Origins':origins,'Methods':['GET','OPTIONS'],'Headers':['content-type'],'Credentials':False,'MaxAge':300}}
   params={'Namespace':TARGET['envId'],'FunctionName':NAME,'Qualifier':'$LATEST','TriggerName':'sunseek-weather-url','Type':'http','Enable':'OPEN','TriggerDesc':json.dumps(config)}
   data=checked(['api','scf','CreateTrigger','-e',TARGET['envId'],'--body',json.dumps(params),'--json']);config=json.loads(data['TriggerInfo']['TriggerDesc'])
  print(json.dumps({'function':NAME,'url':config.get('NetConfig',{}).get('ExtranetUrl'),'origins':config.get('CorsConfig',{}).get('Origins')},ensure_ascii=False))
 elif args.action=='status':
  # Print only counters/metadata, not credentials or complete weather payloads.
  result=checked(['db','execute','-e',TARGET['envId'],'--sql',"SELECT count(*) AS cached_points, count(*) FILTER (WHERE fetched_at>now()-interval '1 hour') AS fresh_points FROM public.sunseek_weather_cache",'--json']);print(json.dumps(result,ensure_ascii=False))
 else:
  config=json.loads((SERVER/'cloudbaserc.json').read_text());config['functions'][0]['dir']=str(SERVER/'weather-cache');config['functions'][0]['envVariables']['SUNSEEK_COVERAGE']=args.coverage
  with tempfile.TemporaryDirectory(prefix='sunseek-cache-deploy-') as d:
   c=Path(d)/'cloudbaserc.json';c.write_text(json.dumps(config))
   result=checked(['fn','deploy',NAME,'--config-file',str(c),'-e',TARGET['envId'],'--force','--json','--install-dependency','false'])
   print(json.dumps({'function':NAME,'coverage':args.coverage,'result':result},ensure_ascii=False))
if __name__=='__main__':
 try:main()
 except (RuntimeError,ValueError,OSError) as error:raise SystemExit(str(error))
