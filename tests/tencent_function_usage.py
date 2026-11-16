"""Monitoring must stay read-only and preserve missing data rather than invent zeros."""
import contextlib,io,json,sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
import tencent_function_usage as U
sample={'data':{'MetricName':'FunctionInvocation','Period':300,'Time':[1794758400,1794758700,1794759000],'Values':[0,99,0],'NewValues':[0,1,None],'secret':'must-not-print'}}
value=U.summarize(sample,U.FUNCTIONS[0]);assert value['reportedInvocations']==1 and value['missingValues']==1
assert value['nonzeroWindows']==[{'time':'2026-11-16T00:05:00+08:00','invocations':1}]
assert U.parse_time('2026-11-16T00:00:00')==U.parse_time('2026-11-15T16:00:00Z')
assert U.summarize({'MetricName':'FunctionInvocation','Period':300,'Time':[],'Values':[]},'test')['reportedInvocations'] is None
for invalid in [{'Time':[1],'NewValues':[],'Values':[]},{'Time':[1,601,901]},{'MetricName':'DbRead'},{'NewValues':[0,-1,0]}]:
 try:U.summarize({**sample['data'],**invalid},'test');raise AssertionError('Invalid metrics accepted')
 except RuntimeError:pass
calls=[]
def fake(args,**kwargs):
 calls.append(args);assert args[:3]==['api','tcb','DescribeCurveData']
 body=json.loads(args[args.index('--body')+1])
 assert body['MetricName']=='FunctionInvocation' and body['ResourceID'] in U.FUNCTIONS and body['Period']==300
 return SimpleNamespace(returncode=0,stdout=json.dumps(sample))
with patch.object(sys,'argv',['tencent_function_usage.py','--since','2026-11-15T00:00:00+08:00','--until','2026-11-16T13:00:00+08:00']),patch.object(U,'run_cli',side_effect=fake),contextlib.redirect_stdout(io.StringIO()) as output:
 U.main();assert len(calls)==2 and 'must-not-print' not in output.getvalue()
 assert len(json.loads(output.getvalue())['functions'])==2
with patch.object(sys,'argv',['tencent_function_usage.py','--since','2026-11-01','--until','2026-11-16']),patch.object(U,'run_cli',side_effect=AssertionError('Invalid range must not access cloud')),contextlib.redirect_stderr(io.StringIO()):
 try:U.main();raise AssertionError('Unbounded query')
 except SystemExit as e:assert e.code==2
print('PASS fixed monitoring-only requests, time zones, counts/nulls/gaps, bounded range and secret exclusion')
