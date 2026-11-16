"""Read historical invocation metrics for the two existing weather functions.

Does not invoke functions, query PostgreSQL, fetch weather or change resources.
Times without an offset are Beijing time. Missing metrics are not treated as zero.
"""
import argparse,json,math,subprocess
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from deploy_tencent import ROOT,run_cli,decode_cli_json

TZ=ZoneInfo('Asia/Shanghai')
FUNCTIONS=('sunseek-weather-cache','sunseek-weather-objects')

def parse_time(value):
 moment=datetime.fromisoformat(value)
 return moment.replace(tzinfo=TZ) if moment.tzinfo is None else moment.astimezone(TZ)

def summarize(envelope,name):
 data=envelope.get('data',envelope)
 if data.get('MetricName')!='FunctionInvocation' or data.get('Period')!=300:raise RuntimeError('Unexpected monitoring metric or period')
 times=data.get('Time',[]);values=data.get('NewValues') or data.get('Values',[])
 if len(times)!=len(values):raise RuntimeError('Monitoring timestamps do not match values')
 if any(not isinstance(t,(int,float)) or not math.isfinite(t) for t in times):raise RuntimeError('Invalid monitoring timestamps')
 if any(b-a!=300 for a,b in zip(times,times[1:])):raise RuntimeError('Monitoring timeline has gaps; do not interpret missing intervals as zero')
 if any(v is not None and (isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v<0) for v in values):raise RuntimeError('Invalid monitoring count')
 stamp=lambda t:datetime.fromtimestamp(t,TZ).isoformat()
 known=[v for v in values if v is not None]
 return {'function':name,'periodSeconds':300,'reportedPoints':len(times),'missingValues':len(values)-len(known),
  'observedFrom':stamp(times[0]) if times else None,'observedThrough':stamp(times[-1]) if times else None,
  'reportedInvocations':sum(known) if known else None,
  'nonzeroWindows':[{'time':stamp(t),'invocations':v} for t,v in zip(times,values) if v is not None and v>0]}

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--since',help='开始时间，默认过去 24 小时；例如 2026-11-15T00:00:00+08:00')
 p.add_argument('--until',help='结束时间，默认现在；最多查询连续三天')
 args=p.parse_args();now=datetime.now(TZ)
 try:
  end=parse_time(args.until) if args.until else now
  start=parse_time(args.since) if args.since else end-timedelta(days=1)
 except ValueError:p.error('时间需为 ISO 日期时间')
 if not timedelta(minutes=5)<=end-start<=timedelta(days=3):p.error('时间范围需为五分钟至三天')
 target=json.loads((ROOT/'scripts/tencent-target.json').read_text());reports=[]
 for name in FUNCTIONS:
  body={'EnvId':target['envId'],'MetricName':'FunctionInvocation','ResourceID':name,'StartTime':start.strftime('%Y-%m-%d %H:%M:%S'),'EndTime':end.strftime('%Y-%m-%d %H:%M:%S'),'Period':300}
  result=run_cli(['api','tcb','DescribeCurveData','-e',target['envId'],'--body',json.dumps(body),'--json'],capture_output=True,text=True,stdin=subprocess.DEVNULL)
  if result.returncode:raise SystemExit('函数监控读取失败；未调用函数、SQL 或天气。请检查 CLI 登录及监控读取权限。')
  reports.append(summarize(decode_cli_json(result.stdout),name))
 print(json.dumps({'capturedAt':now.isoformat(),'requestedFrom':start.isoformat(),'requestedUntil':end.isoformat(),'functions':reports,'note':'监控可能延迟或缺失，调用次数不能证明执行了 SQL，也不能直接换算 PG 费用。'},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
