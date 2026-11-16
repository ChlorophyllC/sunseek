"""Retire the PG experiment without SQL, invocation, URL or concurrency mutations."""
import contextlib,io,json,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
import deploy_weather_cache as D

def info(name=D.NAME,enabled=None):
 return {'FunctionName':name,'Status':'Active','Environment':{'Variables':[{'Key':'secret','Value':'must-not-print'},{'Key':'SUNSEEK_COVERAGE','Value':'all'},{'Key':'SUNSEEK_PG_CACHE_ENABLED','Value':enabled}]},'Triggers':[{'Type':'http','TriggerName':'existing-url','Enable':1,'Qualifier':'$LATEST','TriggerDesc':'must-not-print'}]}

for action in ['init-db','deploy','db-status','verify-db','function-url']:
 with patch.object(sys,'argv',['deploy_weather_cache.py',action]),patch.object(D,'checked',side_effect=AssertionError('Must refuse before any network operation')),contextlib.redirect_stderr(io.StringIO()):
  try:D.main();raise AssertionError('Explicit PG opt-in required')
  except SystemExit as e:assert e.code==2

with patch.object(sys,'argv',['deploy_weather_cache.py','status']),patch.object(D,'checked',return_value=info()) as api,contextlib.redirect_stdout(io.StringIO()) as output:
 D.main();assert api.call_count==1 and api.call_args.args[0][:3]==['api','scf','GetFunction']
 assert 'must-not-print' not in output.getvalue() and json.loads(output.getvalue())['postgresQueries']==0

config=D.deploy_config('all');assert len(config['functions'])==1
function=config['functions'][0]
assert function['name']==D.NAME and function['envVariables']['SUNSEEK_PG_CACHE_ENABLED']=='false'
assert 'triggers' not in function and 'provisionedConcurrency' not in function
assert D.deploy_config('featured',enabled=True)['functions'][0]['envVariables']['SUNSEEK_PG_CACHE_ENABLED']=='true'
for coverage in ['unknown','']:
 try:D.deploy_config(coverage);raise AssertionError('Unknown coverage')
 except RuntimeError:pass

with patch.object(D,'function_info',side_effect=[info(),info(enabled='false')]),patch.object(D,'deploy_function') as deploy:
 result=D.pause();assert result['pgCacheEnabled']=='false'
 assert deploy.call_args.args[0]==config
with patch.object(D,'checked',return_value=info(name='other-function')),patch.object(D,'deploy_function',side_effect=AssertionError('Wrong target mutation')):
 try:D.pause();raise AssertionError('Wrong target accepted')
 except RuntimeError:pass
with patch.object(D,'function_info',return_value=info()),patch.object(D,'deploy_function'):
 try:D.pause();raise AssertionError('Unconfirmed pause accepted')
 except RuntimeError:pass
print('PASS read-only status, explicit PG opt-in, exact disabled deployment, redaction and configuration verification')
