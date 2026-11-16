"""Maintain the retired PG weather experiment; status never queries PostgreSQL.
Database/deployment actions require --allow-pg. Prefer status or pause.
No paid-plan changes, new environments, default-context changes or permanent keys.
"""
import argparse,json,subprocess,tempfile
from pathlib import Path
from deploy_tencent import ROOT,run_cli,decode_cli_json
TARGET=json.loads((ROOT/'scripts/tencent-target.json').read_text())
SERVER=ROOT/'server';NAME='sunseek-weather-cache'
def checked(args):
 result=run_cli(args,capture_output=True,text=True,stdin=subprocess.DEVNULL)
 if result.returncode:
  try:
   error=decode_cli_json(result.stdout).get('error',{})
   detail=' '.join(str(error.get(k,'')) for k in ['code','message'])
  except (RuntimeError,ValueError):detail='CloudBase command failed'
  raise RuntimeError(detail)
 return decode_cli_json(result.stdout).get('data',{})
def preflight():
 info=checked(['env','detail','-e',TARGET['envId'],'--json','--yes'])
 if info.get('EnvId')!=TARGET['envId'] or info.get('Region')!='ap-shanghai' or not info.get('PostgreSQL'):raise RuntimeError('Wrong environment or PostgreSQL unavailable')
 print(json.dumps({k:info.get(k) for k in ['EnvId','Region','PackageId','EnvStatus']},ensure_ascii=False),flush=True)
def function_info():
 data=checked(['api','scf','GetFunction','-e',TARGET['envId'],'--body',json.dumps({'Namespace':TARGET['envId'],'FunctionName':NAME}),'--json'])
 if data.get('FunctionName')!=NAME:raise RuntimeError('Unexpected function; no changes made')
 return data
def function_status(data):
 variables={v['Key']:v.get('Value') for v in data.get('Environment',{}).get('Variables',[])}
 return {**{k:data.get(k) for k in ['FunctionName','Status','Runtime','Timeout','MemorySize']},'pgCacheEnabled':variables.get('SUNSEEK_PG_CACHE_ENABLED'),'httpTriggers':[{k:t.get(k) for k in ['TriggerName','Enable','Qualifier']} for t in data.get('Triggers',[]) if t.get('Type')=='http'],'postgresQueries':0}
def status():
 return function_status(function_info())
def deploy_config(coverage,enabled=False):
 if coverage not in ['featured','all']:raise RuntimeError('Unknown coverage')
 config=json.loads((SERVER/'cloudbaserc.json').read_text())
 if config['envId']!=TARGET['envId'] or len(config['functions'])!=1 or config['functions'][0]['name']!=NAME:raise RuntimeError('Unexpected deployment target')
 config['functions'][0]['dir']=str(SERVER/'weather-cache')
 config['functions'][0]['envVariables'].update(SUNSEEK_COVERAGE=coverage,SUNSEEK_PG_CACHE_ENABLED='true' if enabled else 'false')
 return config
def deploy_function(config):
 with tempfile.TemporaryDirectory(prefix='sunseek-cache-deploy-') as d:
  c=Path(d)/'cloudbaserc.json';c.write_text(json.dumps(config))
  checked(['fn','deploy',NAME,'--config-file',str(c),'-e',TARGET['envId'],'--force','--json','--install-dependency','false'])
def pause():
 data=function_info()
 variables={v['Key']:v.get('Value') for v in data.get('Environment',{}).get('Variables',[])}
 # CloudBase's HTTP/quota pause APIs rejected this shared-environment function.
 # Deploy a fail-closed handler instead; no SQL/schema or URL operations.
 deploy_function(deploy_config(variables.get('SUNSEEK_COVERAGE','all')))
 result=status()
 if result['pgCacheEnabled']!='false':raise RuntimeError('Disabled backend configuration not confirmed')
 return result
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['init-db','deploy','status','pause','db-status','function-url','verify-db']);p.add_argument('--coverage',choices=['featured','all'],default='all');p.add_argument('--allow-pg',action='store_true',help='显式允许旧 PG 实验操作；可能产生数据库计算费用');args=p.parse_args()
 if args.action=='status':print(json.dumps(status(),ensure_ascii=False));return
 if args.action=='pause':print(json.dumps(pause(),ensure_ascii=False));return
 if not args.allow_pg:p.error('旧 PG 实验已停用；如确需操作，显式传 --allow-pg。只读状态使用 status，计费使用 tencent_usage.py。')
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
 elif args.action=='db-status':
  # Print only counters/metadata, not credentials or complete weather payloads.
  result=checked(['db','execute','-e',TARGET['envId'],'--sql',"SELECT count(*) AS cached_points, count(*) FILTER (WHERE fetched_at>now()-interval '1 hour') AS fresh_points FROM public.sunseek_weather_cache",'--json']);print(json.dumps(result,ensure_ascii=False))
 else:
  deploy_function(deploy_config(args.coverage,enabled=True))
  print(json.dumps({'function':NAME,'coverage':args.coverage,'pgCacheEnabled':True},ensure_ascii=False))
if __name__=='__main__':
 try:main()
 except (RuntimeError,ValueError,OSError) as error:raise SystemExit(str(error))
