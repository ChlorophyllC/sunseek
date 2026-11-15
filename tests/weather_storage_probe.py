"""Target isolation and zero-network default for the static storage feasibility check."""
import contextlib,io,json,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
import probe_weather_storage as P
import probe_weather_function as F

target=json.loads((P.ROOT/'scripts/tencent-target.json').read_text())
prefix,url=P.probe_paths(target,'/sunseek','a'*32)
assert prefix=='/sunseek/_weather-storage-probe/'+'a'*32
assert url==target['url']+'/_weather-storage-probe/'+'a'*32
for mount,identifier in [('/other','a'*32),('/sunseek','../index.html'),('/sunseek','')]:
 try:P.probe_paths(target,mount,identifier)
 except ValueError:pass
 else:raise AssertionError('unsafe probe target accepted')
row={'EnvId':target['envId'],'Status':'online','Bucket':'existing-static-bucket','Regoin':'ap-shanghai','ExternalStorage':{'Enabled':False}}
assert P.check_hosting({'data':{'Data':[row]}},target)['dedicatedStaticBucket']
for bad in [dict(row,EnvId='other'),dict(row,Status='offline'),dict(row,Regoin='other'),dict(row,ExternalStorage={'Enabled':True})]:
 try:P.check_hosting({'data':{'Data':[bad]}},target)
 except RuntimeError:pass
 else:raise AssertionError('unverified storage accepted')
with patch.object(P,'run_cli',side_effect=AssertionError('offline preview must not call cloud services')),contextlib.redirect_stdout(io.StringIO()) as output:P.main()
assert json.loads(output.getvalue())['live'] is False
with patch.object(F,'command',side_effect=AssertionError('offline preview must not call cloud services')),contextlib.redirect_stdout(io.StringIO()) as output:F.main()
assert json.loads(output.getvalue())['live'] is False
assert F.result_payload({'data':{'Result':{'RetMsg':'{"passed":true}'}}})=={'passed':True}
print('PASS existing static target, UUID isolation, rejected shared/unknown buckets and offline-only default')
