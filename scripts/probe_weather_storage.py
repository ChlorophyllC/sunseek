"""Check the existing static COS/CDN path using isolated synthetic files, then remove them.

Default is offline preview. --live uploads only its own UUID probe directory;
never calls PostgreSQL, the weather function or a weather provider, and never
publishes application code. Requires the existing CLI login and Playwright.
"""
import argparse,gzip,hashlib,json,re,subprocess,tempfile,time,uuid
from pathlib import Path
from deploy_tencent import ROOT,run_cli,decode_cli_json,describe_target

def probe_paths(target,mount,identifier):
 if not re.fullmatch(r'[0-9a-f]{32}',identifier):raise ValueError('Invalid probe identifier')
 if mount not in ['/', '/'+target['serviceName']]:raise ValueError('Unknown application mount')
 relative='_weather-storage-probe/'+identifier
 return mount.rstrip('/')+'/'+relative,target['url'].rstrip('/')+'/'+relative

def check_hosting(envelope,target):
 data=envelope.get('data',envelope)
 rows=data.get('Data',[])
 row=next((r for r in rows if r.get('EnvId')==target['envId']),None)
 if not row or row.get('Status')!='online' or row.get('ExternalStorage',{}).get('Enabled'):
  raise RuntimeError('Expected existing dedicated static hosting storage')
 region=row.get('Region') or row.get('Regoin')
 if region!='ap-shanghai' or not row.get('Bucket'):raise RuntimeError('Unexpected static storage target')
 return {'region':region,'dedicatedStaticBucket':True}

def command(arguments,allow_missing=False):
 result=run_cli(arguments,capture_output=True,text=True,stdin=subprocess.DEVNULL)
 if result.returncode:
  try:
   error=decode_cli_json(result.stdout).get('error',{})
   if isinstance(error,dict):detail=str(error.get('code',''))+' '+str(error.get('message',''))
   else:detail=str(error)
  except (RuntimeError,ValueError):detail=(result.stderr or 'CLI returned no JSON')[-500:]
  if allow_missing and ('ResourceNotFound' in detail or 'FunctionNotFound' in detail):return ''
  detail=re.sub(r'(AKID[A-Za-z0-9]+|q-signature=[A-Za-z0-9]+)', '[redacted]',detail)
  raise RuntimeError('Probe CLI operation failed: '+arguments[0]+' '+arguments[1]+' '+detail[:500])
 return result.stdout

def main(live=False):
 target=json.loads((ROOT/'scripts/tencent-target.json').read_text())
 if not live:
  print(json.dumps({'live':False,'target':target['url'],'operations':['verify existing static storage','upload two synthetic files into a UUID directory','read via two independent browsers','delete only this probe directory'],'postgresQueries':0,'weatherCalls':0},ensure_ascii=False));return
 from playwright.sync_api import sync_playwright,expect
 verified=describe_target(target)
 hosting=check_hosting(decode_cli_json(command(['api','tcb','DescribeStaticStore','-e',target['envId'],'--body',json.dumps({'EnvId':target['envId']}),'--json'])),target)
 prefix,url=probe_paths(target,verified['deployPath'],uuid.uuid4().hex)
 payload={'kind':'sunseek-storage-probe','notice':'存储连通性测试，不是天气预报','nonce':uuid.uuid4().hex,'samples':[{'id':i,'value':i%7} for i in range(48)]}
 raw=json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode()
 report={**hosting,'syntheticBytes':len(raw),'readers':[],'weatherCalls':0,'postgresQueries':0,'cleanup':False}
 uploaded=False
 try:
  with tempfile.TemporaryDirectory(prefix='sunseek-object-probe-') as folder:
   directory=Path(folder);(directory/'probe.json').write_bytes(raw);(directory/'probe.json.gz').write_bytes(gzip.compress(raw,mtime=0))
   # Mark before upload: even a partial failure must remove this invocation's own files.
   uploaded=True
   command(['hosting','deploy',folder,prefix,'-e',target['envId'],'--concurrency','1','--retry-count','1','--json'])
  with sync_playwright() as p:
   browser=p.chromium.launch()
   try:
    for reader in range(2):
     context=browser.new_context(locale='zh-CN')
     try:
      # No provider/function network request can escape this storage-only check.
      context.route('https://api.open-meteo.com/**',lambda r:r.abort())
      context.route('https://geocoding-api.open-meteo.com/**',lambda r:r.abort())
      context.route('**/*.tencentscf.com/**',lambda r:r.abort())
      page=context.new_page();page.goto(target['url'],wait_until='domcontentloaded',timeout=45000)
      if not page.locator('#data-status').count():
       button=page.get_by_role('button',name=re.compile('确定访问'));expect(button).to_be_enabled(timeout=30000);button.click()
      expect(page.locator('#data-status')).to_be_visible(timeout=20000)
      started=time.monotonic();response=context.request.get(url+'/probe.json',timeout=20000)
      body=response.body()
      if not response.ok or body!=raw:raise RuntimeError('Public static probe did not match uploaded data')
      report['readers'].append({'independentBrowser':reader+1,'status':response.status,'elapsedMs':round((time.monotonic()-started)*1000),'cacheControl':response.headers.get('cache-control'),'contentEncoding':response.headers.get('content-encoding'),'bytes':len(body)})
      decoded=page.evaluate('''async url=>{const response=await fetch(url);if(!response.ok)throw Error('Probe unavailable');const bytes=new Uint8Array(await response.arrayBuffer());const compressed=bytes[0]===31&&bytes[1]===139;const payload=compressed?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json():JSON.parse(new TextDecoder().decode(bytes));return {compressed,payload};}''',url+'/probe.json.gz')
      if decoded['payload']!=payload:raise RuntimeError('Compressed static data did not decode correctly')
      report['readers'][-1]['gzipArrivedCompressed']=decoded['compressed']
     finally:context.close()
   finally:browser.close()
  report['sha256']=hashlib.sha256(raw).hexdigest();report['passed']=True
 finally:
  if uploaded:
   command(['hosting','delete',prefix,'--dir','--yes','-e',target['envId'],'--json'])
   report['cleanup']=True
  print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--live',action='store_true')
 main(parser.parse_args().live)
