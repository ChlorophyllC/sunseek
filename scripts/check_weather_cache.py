"""Live public-endpoint acceptance. Intentionally fills only requested catalog points.
No timers are installed. Cold full-catalog validation may pause for quota/cooldown.
"""
import argparse,json,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
ENDPOINT='https://1330730699-86nlrqp1le.ap-shanghai.tencentscf.com/api/weather'
def request(ids):
 from urllib.parse import urlencode
 started=time.monotonic()
 response=subprocess.run(['curl','-sS','--max-time','35','-H','Origin: http://localhost:4173',ENDPOINT+'?'+urlencode({'ids':','.join(sorted(ids))})],capture_output=True,text=True)
 if response.returncode:raise RuntimeError('HTTP transport failed')
 body=json.loads(response.stdout)
 if body.get('version')!=1:raise RuntimeError('Invalid cache response: '+json.dumps(body)[:200])
 return body['items'],round((time.monotonic()-started)*1000)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--coverage',choices=['featured','all'],default='featured');p.add_argument('--report',default='/tmp/sunseek-shared-public-live.json');args=p.parse_args()
 catalog=json.loads((ROOT/'server/weather-cache/catalog.json').read_text());ids=[c['id'] for c in catalog if args.coverage=='all' or c['featured']]
 stamps={};attempts={};report={'coverage':args.coverage,'points':len(ids),'requests':[],'startedAt':time.time()}
 remaining=ids[:]
 while remaining:
  batch=remaining[:16];remaining=remaining[16:];items,duration=request(batch)
  assert {i['cityId'] for i in items}==set(batch)
  failed=[];wait=0
  for item in items:
   id=item['cityId']
   if item['status']=='fresh':
    assert item['expiresAt']==item['fetchedAt']+3600000
    assert len(item['forecast']['daily']['time'])==16 and len(item['forecast']['hourly']['time'])==384
    stamps[id]=item['fetchedAt']
   else:
    attempts[id]=attempts.get(id,0)+1
    if attempts[id]>4:raise RuntimeError('Too many attempts: '+id+' '+str(item.get('reason')))
    failed.append(id);wait=max(wait,min(65,item.get('retryAfter',3)))
  row={'fresh':len(stamps),'of':len(ids),'batch':len(batch),'durationMs':duration,'retry':len(failed)};report['requests'].append(row);print(json.dumps(row),flush=True)
  if failed:
   remaining=failed+remaining;print('Cooling down '+str(wait)+' seconds',flush=True)
   # Small sleeps keep this background command responsive to cancellation.
   until=time.monotonic()+wait
   while time.monotonic()<until:time.sleep(min(5,until-time.monotonic()))
 report['firstRoundCompletedAt']=time.time()
 # Read every point again and check the shared origin timestamp was never renewed.
 for start in range(0,len(ids),16):
  items,duration=request(ids[start:start+16]);assert all(i['status']=='fresh' and i['fetchedAt']==stamps[i['cityId']] for i in items)
  print(json.dumps({'round':2,'verified':min(start+16,len(ids)),'durationMs':duration}),flush=True)
 report['passed']=True;report['finishedAt']=time.time();Path(args.report).write_text(json.dumps(report,indent=2))
 print('PASS public endpoint: '+str(len(ids))+' points, second round retains every timestamp',flush=True)
if __name__=='__main__':main()
