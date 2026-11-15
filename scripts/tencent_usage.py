"""Read CloudBase billing only. Does not query PostgreSQL, fill cache or deploy.
Usage: python3 scripts/tencent_usage.py
Prints a whitelist of billing fields; never prints credentials or user records.
"""
import argparse,json,subprocess
from deploy_tencent import ROOT,run_cli,decode_cli_json

def number(value):
 try:return float(value or 0)
 except (TypeError,ValueError):return 0

def summarize(envelope,include_daily=False):
 data=envelope.get('data',envelope);summary=data.get('summary',{})
 resources=[]
 for module in data.get('Usages',[]):
  metrics=[]
  for item in module.get('MetricUsageDetail',[]):
   if not any(number(item.get(k)) for k in ['CreditsValue','DeductValue','Value','ReportValue']):continue
   metric={k:item.get(k) for k in ['ResourceType','MetricName','Value','Unit','CreditsValue','DeductValue'] if k in item}
   if include_daily:metric['daily']=[{k:row.get(k) for k in ['CalcTime','RawValue','CreditsValue','DeductValue'] if k in row} for row in item.get('ValueDetailList',[])]
   metrics.append(metric)
  if metrics or number(module.get('CreditsValue')) or number(module.get('DeductValue')):
   resources.append({'module':module.get('Module'),'credits':module.get('CreditsValue'),'deducted':module.get('DeductValue'),'items':metrics})
 resources.sort(key=lambda r:number(r.get('deducted') or r.get('credits')),reverse=True)
 return {'billingCycle':data.get('billingCycle'),'summary':{k:summary.get(k) for k in ['totalCredits','totalCreditsValue','totalDeductValue']},'resources':resources}

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--daily',action='store_true',help='附带计费 API 返回的按日明细；不增加数据库或天气查询');args=parser.parse_args()
 target=json.loads((ROOT/'scripts/tencent-target.json').read_text())
 result=run_cli(['env','usage','-e',target['envId'],'--json','--yes'],capture_output=True,text=True,stdin=subprocess.DEVNULL)
 if result.returncode:raise SystemExit('用量查询未成功。请检查 CLI 登录状态；需要登录时运行 python3 scripts/deploy_tencent.py login。')
 print(json.dumps(summarize(decode_cli_json(result.stdout),args.daily),ensure_ascii=False,indent=2))
if __name__=='__main__':main()
