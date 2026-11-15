"""Deploy/inspect the PostgreSQL-free 48-point cache. Never touches the old PG cache.

No timers, database commands, role changes or package upgrades. Frontend enablement
is a separate, versioned config change after real performance checks.
"""
import argparse,json,shutil,tempfile,uuid
from pathlib import Path
from urllib.parse import urlparse
from deploy_tencent import ROOT,decode_cli_json
from probe_weather_storage import command,check_hosting
from probe_weather_function import result_payload

APP=json.loads((ROOT/'scripts/tencent-target.json').read_text())
TARGET_PATH=ROOT/'scripts/weather-object-target.json'
SOURCE=ROOT/'server/weather-object-cache'

def target_settings():
 target=json.loads(TARGET_PATH.read_text())
 if target['functionName']!='sunseek-weather-objects' or target['origin']!=APP['url']:raise RuntimeError('Unexpected object cache target')
 return target

def existing_bucket():
 data=decode_cli_json(command(['api','tcb','DescribeStaticStore','-e',APP['envId'],'--body',json.dumps({'EnvId':APP['envId']}),'--json']))
 check_hosting(data,APP)
 return next(row['Bucket'] for row in data['data']['Data'] if row['EnvId']==APP['envId'])

def config(name,bucket,directory,extra=None):
 return {'envId':APP['envId'],'functionRoot':str(ROOT/'server'),'functions':[{'name':name,'dir':str(directory),'handler':'index.main','runtime':'Nodejs20.19','type':'Event','timeout':30,'memorySize':256,'installDependency':False,'ignore':['live-check.cjs'],'envVariables':{'SUNSEEK_STATIC_BUCKET':bucket,**(extra or {})}}]}

def api(action,body):return decode_cli_json(command(['api','scf',action,'-e',APP['envId'],'--body',json.dumps({'Namespace':APP['envId'],**body}),'--json']))['data']

def deploy(name,bucket,directory,extra=None,probe=False):
 with tempfile.TemporaryDirectory(prefix='sunseek-object-deploy-') as folder:
  settings=config(name,bucket,directory,extra)
  if probe:settings['functions'][0]['ignore']=[]
  path=Path(folder)/'cloudbaserc.json';path.write_text(json.dumps(settings))
  command(['fn','deploy',name,'--config-file',str(path),'-e',APP['envId'],'--force','--install-dependency','false','--json'])

def live_check(bucket):
 name='sunseek-object-check-'+uuid.uuid4().hex[:8];namespace='probe-'+uuid.uuid4().hex
 try:
  with tempfile.TemporaryDirectory(prefix='sunseek-object-check-') as folder:
   path=Path(folder);shutil.copytree(SOURCE,path,dirs_exist_ok=True)
   (path/'index.js').write_text("exports.main=async event=>{if(event?.check!==true)throw Error('Check required');return require('./live-check.cjs').run();};\n")
   deploy(name,bucket,path,{'SUNSEEK_CACHE_PROBE_NAMESPACE':namespace},probe=True)
  result=api('Invoke',{'FunctionName':name,'InvocationType':'RequestResponse','ClientContext':'{"check":true}'})
  result=result_payload({'data':result});print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
  if not result.get('passed') or not result.get('cleanup'):raise RuntimeError('Live storage invariant check failed')
 finally:
  command(['api','scf','DeleteFunction','-e',APP['envId'],'--body',json.dumps({'Namespace':APP['envId'],'FunctionName':name}),'--json'],allow_missing=True)
  print(json.dumps({'diagnosticFunctionRemoved':name}),flush=True)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['preview','live-check','deploy','function-url','status']);args=p.parse_args();target=target_settings()
 if args.action=='preview':
  print(json.dumps({'function':target['functionName'],'coverage':48,'timers':False,'postgres':False,'frontendEnabled':target['enabled'],'sourceFiles':sorted(p.name for p in SOURCE.iterdir() if p.is_file() and p.name!='live-check.cjs')},ensure_ascii=False));return
 bucket=existing_bucket()
 if args.action=='live-check':live_check(bucket)
 elif args.action=='deploy':
  deploy(target['functionName'],bucket,SOURCE);print(json.dumps({'function':target['functionName'],'coverage':48,'frontendEnabled':target['enabled']}))
 elif args.action=='status':
  info=api('GetFunction',{'FunctionName':target['functionName']});print(json.dumps({k:info.get(k) for k in ['FunctionName','Runtime','Timeout','MemorySize','Status','Role']},ensure_ascii=False))
 else:
  info=api('GetFunction',{'FunctionName':target['functionName']});trigger=next((t for t in info.get('Triggers',[]) if t.get('Type')=='http'),None)
  if trigger:settings=json.loads(trigger['TriggerDesc'])
  else:
   settings={'AuthType':'NONE','NetConfig':{'EnableIntranet':False,'EnableExtranet':True},'CorsConfig':{'Enable':True,'Origins':[APP['url'],'http://localhost:4173','http://127.0.0.1:4173'],'Methods':['GET','OPTIONS'],'Headers':['content-type'],'Credentials':False,'MaxAge':300}}
   result=api('CreateTrigger',{'FunctionName':target['functionName'],'Qualifier':'$LATEST','TriggerName':'sunseek-objects-url','Type':'http','Enable':'OPEN','TriggerDesc':json.dumps(settings)});settings=json.loads(result['TriggerInfo']['TriggerDesc'])
  endpoint=settings.get('NetConfig',{}).get('ExtranetUrl','');parsed=urlparse(endpoint)
  if parsed.scheme!='https' or not parsed.hostname.endswith('.ap-shanghai.tencentscf.com'):raise RuntimeError('Unexpected function URL')
  target['endpoint']=endpoint.rstrip('/')+'/api/weather';TARGET_PATH.write_text(json.dumps(target,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps({'endpoint':target['endpoint'],'origins':settings.get('CorsConfig',{}).get('Origins'),'frontendEnabled':target['enabled']},ensure_ascii=False))

if __name__=='__main__':main()
