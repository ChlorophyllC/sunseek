"""Optional live diagnostic of direct COS using the existing function role.

Creates one short-lived Event function with no URL/timer, invokes it once with
synthetic objects, and removes the diagnostic function. Never updates the app,
weather cache function, PostgreSQL, roles or plans. Default is offline preview.
"""
import argparse,json,re,tempfile,uuid
from pathlib import Path
from deploy_tencent import ROOT,decode_cli_json
from probe_weather_storage import command,check_hosting

def result_payload(envelope):
 data=envelope.get('data',envelope)
 result=data.get('Result',data)
 value=result.get('RetMsg') or result.get('retMsg') or result.get('returnMsg')
 if isinstance(value,str):return json.loads(value)
 raise RuntimeError('Function diagnostic did not return JSON')

def main(live=False):
 target=json.loads((ROOT/'scripts/tencent-target.json').read_text())
 if not live:
  print(json.dumps({'live':False,'operations':['verify existing dedicated static bucket','create isolated Event diagnostic function','invoke once with synthetic objects','remove diagnostic function'],'postgresQueries':0,'weatherCalls':0,'roleChanges':False}));return
 envelope=decode_cli_json(command(['api','tcb','DescribeStaticStore','-e',target['envId'],'--body',json.dumps({'EnvId':target['envId']}),'--json']))
 check_hosting(envelope,target)
 bucket=next(row['Bucket'] for row in envelope['data']['Data'] if row['EnvId']==target['envId'])
 name='sunseek-object-probe-'+uuid.uuid4().hex[:8]
 assert re.fullmatch('sunseek-object-probe-[a-f0-9]{8}',name)
 config={'envId':target['envId'],'functionRoot':str(ROOT/'server'),'functions':[{'name':name,'dir':str(ROOT/'server/weather-object-probe'),'handler':'index.main','runtime':'Nodejs20.19','type':'Event','timeout':25,'memorySize':256,'installDependency':False,'envVariables':{'SUNSEEK_STATIC_BUCKET':bucket}}]}
 attempted=False
 try:
  with tempfile.TemporaryDirectory(prefix='sunseek-function-probe-') as folder:
   path=Path(folder)/'cloudbaserc.json';path.write_text(json.dumps(config));attempted=True
   command(['fn','deploy',name,'--config-file',str(path),'-e',target['envId'],'--install-dependency','false','--json'])
  output=command(['api','scf','Invoke','-e',target['envId'],'--body',json.dumps({'Namespace':target['envId'],'FunctionName':name,'InvocationType':'RequestResponse','ClientContext':json.dumps({'probe':'sunseek-direct-object-storage'})}),'--json'])
  result=result_payload(decode_cli_json(output));result['diagnosticFunction']=name
  print(json.dumps(result,ensure_ascii=False,indent=2))
 finally:
  if attempted:
   command(['api','scf','DeleteFunction','-e',target['envId'],'--body',json.dumps({'Namespace':target['envId'],'FunctionName':name}),'--json'],allow_missing=True)
   print(json.dumps({'diagnosticFunctionRemoved':name}))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--live',action='store_true');main(parser.parse_args().live)
