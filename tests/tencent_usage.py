"""Billing-only summary, preserving per-module costs without secrets or data-plane calls."""
import json,sys
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
import tencent_usage as U
sample={'data':{'billingCycle':{'startDate':'2026-11-14','endDate':'2026-12-14'},'summary':{'totalCredits':3000,'totalCreditsValue':268.66,'totalDeductValue':268.66,'secret':'not-for-output'},'Usages':[
 {'Module':'PostgreSQL','CreditsValue':250,'DeductValue':250,'secret':'not-for-output','MetricUsageDetail':[{'ResourceType':'PostgreSQL','MetricName':'CPU','Value':1.46,'Unit':'核时','CreditsValue':250,'DeductValue':250,'raw':'not-for-output'}]},
 {'Module':'SCF','CreditsValue':0,'DeductValue':0,'MetricUsageDetail':[{'ResourceType':'SCF','MetricName':'Outflow','Value':0,'CreditsValue':0}]},
 {'Module':'HOSTING','CreditsValue':18.66,'DeductValue':18.66,'MetricUsageDetail':[]}]}}
value=U.summarize(sample)
assert value['summary']['totalDeductValue']==268.66
assert [r['module'] for r in value['resources']]==['PostgreSQL','HOSTING']
assert 'not-for-output' not in json.dumps(value) and 'raw' not in value['resources'][0]['items'][0]
sample['data']['Usages'][0]['MetricUsageDetail'][0]['ValueDetailList']=[{'CalcTime':'2026-11-15 00:00:00','RawValue':2620,'CreditsValue':248.97,'DeductValue':248.97,'secret':'not-for-output'}]
daily=U.summarize(sample,True)['resources'][0]['items'][0]['daily']
assert daily==[{'CalcTime':'2026-11-15 00:00:00','RawValue':2620,'CreditsValue':248.97,'DeductValue':248.97}]
calls=[]
def fake(args,**kwargs):
 calls.append(args)
 assert args[:2]==['env','usage'] and '--json' in args and '--yes' in args
 return SimpleNamespace(returncode=0,stdout=json.dumps(sample))
with patch.object(U,'run_cli',fake),patch('builtins.print') as printer:
 U.main();assert len(calls)==1;assert json.loads(printer.call_args.args[0])==value
print('PASS billing-only request, per-module costs, zero suppression and sensitive-field exclusion')
