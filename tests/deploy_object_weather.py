"""No-network defaults, exact targets and exclusion of the synthetic test handler."""
import contextlib,io,json,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
import deploy_object_weather as D
settings=D.target_settings();assert settings['enabled'] is False,'candidate must remain disabled until cold/cost gates pass'
assert settings['functionName']!='sunseek-weather-cache'
config=D.config(settings['functionName'],'static-test-123',D.SOURCE)
function=config['functions'][0]
assert function['type']=='Event' and function['memorySize']==256 and function['timeout']==30
assert function['ignore']==['live-check.cjs'] and 'triggers' not in function
assert 'TCB' not in function['envVariables'] and 'SUNSEEK_STATIC_BUCKET' in function['envVariables']
with patch.object(sys,'argv',['deploy_object_weather.py','preview']),patch.object(D,'command',side_effect=AssertionError('preview must not access the cloud')),contextlib.redirect_stdout(io.StringIO()) as output:D.main()
value=json.loads(output.getvalue());assert value['coverage']==48 and not value['postgres'] and not value['timers']
assert 'live-check.cjs' not in value['sourceFiles'] and not any(name.endswith('.sql') for name in value['sourceFiles'])
print('PASS disabled candidate, separate function, no timer/PG path, synthetic handler exclusion and network-free preview')
