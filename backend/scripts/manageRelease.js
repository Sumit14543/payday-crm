const fs = require('fs'), path = require('path'), crypto = require('crypto'), http = require('http'), cp = require('child_process');
const home = process.env.PAYDAY_RELEASE_HOME || '/home/waqtmoney';
const base = path.join(home, 'payday-releases'), api = path.join(home, 'public_html/payday-api'), web = path.join(home, 'public_html/payday');
const stateFile = path.join(base, 'active.json'), lockFile = path.join(base, 'operation.lock');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function atomic(file, text, mode = 0o600) { const tmp=file+'.new-'+process.pid;fs.writeFileSync(tmp,text,{mode});fs.renameSync(tmp,file); }
function read(file) { return JSON.parse(fs.readFileSync(file,'utf8')); }
function location(id) { if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid release ID');const result=path.join(base,id);if(!result.startsWith(base+path.sep))throw Error('Invalid release path');return result; }
function httpRequest(port, pathname, options={}) {
  return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:pathname,method:options.method||'GET',headers:options.key?{'x-release-control':options.key}:{},timeout:5000},res=>{let text='';res.on('data',part=>text+=part);res.on('end',()=>{let data;try{data=JSON.parse(text)}catch{data={}}resolve({status:res.statusCode,data,headers:res.headers})})});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Health request timed out')));req.end();});
}
function key(release) { return fs.readFileSync(path.join(location(release.id),'runtime/control.key'),'utf8').trim(); }
async function control(release, action, method='GET') { const response=await httpRequest(release.port,'/__release/'+action,{key:key(release),method});if(response.status!==200)throw Error('Release control unavailable');return response.data; }
function linkRuntime(directory) {
  for(const name of ['.env','.env.production','gcp-key.json']) {
    const source=path.join(api,name),target=path.join(directory,name);
    if(fs.existsSync(source)&&!fs.existsSync(target))fs.symlinkSync(source,target);
  }
}
async function start(release) {
  const directory=location(release.id),runtime=path.join(directory,'runtime');fs.mkdirSync(runtime,{recursive:true,mode:0o700});
  if(!fs.existsSync(path.join(runtime,'control.key')))fs.writeFileSync(path.join(runtime,'control.key'),crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
  atomic(path.join(directory,'release.json'),JSON.stringify({...release,sharedRoot:api},null,2));linkRuntime(path.join(directory,'backend'));
  try { const state=await control(release,'status');if(state.id===release.id&&state.ready&&!state.draining)return;if(state.draining){if(state.active||state.syncRunning)throw Error('Release still draining');stop(release);for(let i=0;i<40;i++){await pause(250);try{await control(release,'status')}catch{break;}}} } catch(error) {if(error.message==='Release still draining')throw error;}
  const log=fs.openSync(path.join(runtime,'app.log'),'a',0o600),env={...process.env};delete env.NODE_PATH;delete env.CL_APP_ROOT;delete env.CL_VIRTUAL_ENV;
  const child=cp.spawn(process.execPath,[path.join(base,'releaseLauncher.js'),directory],{cwd:api,env,detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);atomic(path.join(runtime,'pid'),String(child.pid));
  for(let count=0;count<90;count++){await pause(500);try{const state=await control(release,'status');const health=await httpRequest(release.port,'/api/health');if(state.ready&&health.status===200&&health.headers['x-crm-release']===release.id)return;}catch{}}
  throw Error('Candidate did not become healthy; live routing was not changed');
}
function copyFrontend(release) {
  const source=path.join(location(release.id),'frontend');
  if(!fs.existsSync(path.join(source,'index.html')))throw Error('Release frontend index is missing');
  // Keep old hashed assets so already-open tabs can finish loading old chunks.
  for(const name of fs.readdirSync(source)){if(['index.html','.htaccess'].includes(name))continue;fs.cpSync(path.join(source,name),path.join(web,name),{recursive:true,force:true});}
  const index=fs.readFileSync(path.join(source,'index.html'),'utf8').replace('</head>',`<meta name="crm-release" content="${release.id}"></head>`);
  atomic(path.join(web,'index.html'),index,0o644);
}
function proxyFiles(){return ['payday-api','payday','testing'].map(name=>path.join(home,'public_html',name,'.htaccess')).filter(file=>fs.existsSync(file));}
function switchProxy(port){for(const file of proxyFiles()){const before=fs.readFileSync(file,'utf8');if(!/127\.0\.0\.1:808[145]/.test(before))throw Error('Unexpected proxy configuration');atomic(file,before.replace(/127\.0\.0\.1:808[145]/g,'127.0.0.1:'+port),0o644);}}
async function waitDrained(release) {
  if(release.managed){const initial=await control(release,'status');if(initial.resumeSafe)await control(release,'drain','POST');for(let i=0;i<180;i++){const status=await control(release,'status');if(!status.active&&!status.syncRunning)return;await pause(500);}throw Error('Previous release still has active work; it was kept running');}
  // The first rollout predates the managed request counter. Apache now sends
  // new traffic elsewhere; wait for its original connections to finish.
  for(let i=0;i<180;i++){let text='';try{text=cp.execFileSync('ss',['-Htn','state','established','sport','=',':'+release.port],{encoding:'utf8'}).trim()}catch{throw Error('Cannot verify legacy request drain')};if(!text){await pause(2000);let again=cp.execFileSync('ss',['-Htn','state','established','sport','=',':'+release.port],{encoding:'utf8'}).trim();if(!again)return;}await pause(500);}throw Error('Legacy release still has connections; it was kept running');
}
function stop(release){let pid=release.pid;if(release.managed)pid=Number(fs.readFileSync(path.join(location(release.id),'runtime/pid'),'utf8'));if(!Number.isSafeInteger(pid)||pid<=1)throw Error('Invalid release PID');try{process.kill(pid,'SIGTERM')}catch(error){if(error.code!=='ESRCH')throw error;}}
async function switchTo(target,previous,verifyCandidate=false) {
  await start(target);
  if(verifyCandidate) {
    try { cp.execFileSync(process.execPath,[path.join(location(target.id),'backend/scripts/smokeManagedRelease.js')],{stdio:'inherit',env:{...process.env,CRM_CANDIDATE_ROOT:path.join(location(target.id),'backend'),CRM_CANDIDATE_PORT:String(target.port)}}); }
    catch(error){await waitDrained(target).then(()=>stop(target)).catch(()=>{});throw Error('Candidate access checks failed; live routing was not changed');}
  }
  const oldProxy=proxyFiles().map(file=>[file,fs.readFileSync(file)]),oldIndex=fs.readFileSync(path.join(web,'index.html'));
  const oldState=fs.existsSync(stateFile)?fs.readFileSync(stateFile):null;
  try{
    copyFrontend(target);switchProxy(target.port);
    const health=await httpRequest(target.port,'/api/health');if(health.status!==200)throw Error('Post-switch health failed');
    const external=await fetch('https://payday-api.waqtmoney.com/api/health?_release='+encodeURIComponent(target.id)+'&t='+Date.now(),{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});
    if(!external.ok||external.headers.get('x-crm-release')!==target.id)throw Error('Public API release verification failed');
    const frontend=await fetch('https://payday.waqtmoney.com/?_release='+encodeURIComponent(target.id)+'&t='+Date.now(),{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});
    if(!frontend.ok||!(await frontend.text()).includes('content="'+target.id+'"'))throw Error('Public frontend release verification failed');
    await waitDrained(previous);
    await control(target,'activate','POST');
    atomic(stateFile,JSON.stringify({active:target,previous,changedAt:new Date().toISOString()},null,2));
    stop(previous);
  }catch(error){for(const [file,content]of oldProxy)atomic(file,content,0o644);atomic(path.join(web,'index.html'),oldIndex,0o644);if(oldState)atomic(stateFile,oldState);else if(fs.existsSync(stateFile))fs.unlinkSync(stateFile);if(previous.managed)await control(previous,'activate','POST').catch(()=>{});await waitDrained(target).then(()=>stop(target)).catch(()=>{});throw error;}
}
async function snapshot(id) {
  if(fs.existsSync(stateFile))throw Error('A managed release already exists; use status');
  const directory=location(id);if(fs.existsSync(directory))throw Error('Backup already exists');fs.mkdirSync(directory,{mode:0o700});
  const backend=path.join(directory,'backend');
  fs.cpSync(api,backend,{recursive:true,filter:source=>{const rel=path.relative(api,source);if(!rel)return true;const first=rel.split(path.sep)[0];return !/^(node_modules(?:\.|$)|uploads$|backups$|scratch$|tmp$|deploy-doc$)/.test(first)&&!/(?:\.log|\.err|\.zip|\.tar)$/.test(first)&&!first.startsWith('.env')&& !/^gcp-key.*\.json$/.test(first);}});
  // Suppress the saved server's unguarded startup scheduler. The launcher
  // activates that same hourly collection sync only after traffic switches.
  const serverFile=path.join(backend,'server.js');atomic(serverFile,fs.readFileSync(serverFile,'utf8').replace('      startBackgroundSyncScheduler();',"      if (process.env.CRM_MANAGED_RELEASE !== 'true') startBackgroundSyncScheduler();"),0o644);
  fs.cpSync(web,path.join(directory,'frontend'),{recursive:true});linkRuntime(backend);
  cp.execFileSync(process.execPath,['/opt/alt/alt-nodejs24/root/usr/lib/node_modules/npm/bin/npm-cli.js','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:backend,stdio:'inherit',env:{...process.env,NODE_PATH:''}});
  const pidText=cp.execFileSync('fuser',['8081/tcp'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();if(!/^\d+$/.test(pidText))throw Error('Cannot identify current production process');
  const legacy={id,port:8081,pid:Number(pidText),managed:false,legacySource:'waqtmoney'};
  atomic(path.join(directory,'release.json'),JSON.stringify({...legacy,sharedRoot:api},null,2));
  atomic(path.join(base,'baseline.json'),JSON.stringify(legacy,null,2));
  console.log(JSON.stringify({snapshot:id,backend:true,frontend:true,dependencies:true,databaseRestore:false}));
}
function acquireLock() {
  for(let attempt=0;attempt<2;attempt++) {
    try { const descriptor=fs.openSync(lockFile,'wx',0o600);fs.writeFileSync(descriptor,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));return descriptor; }
    catch(error) {
      if(error.code!=='EEXIST')throw error;
      let owner;try{owner=read(lockFile)}catch{throw Error('Existing deployment lock needs inspection');}
      if(!Number.isSafeInteger(owner.pid)||owner.pid<=1)throw Error('Invalid deployment lock owner');
      try{process.kill(owner.pid,0);throw Error('Another release operation is running; retry after it completes');}
      catch(check){if(check.code!=='ESRCH')throw check;}
      if(read(lockFile).pid!==owner.pid)continue;
      fs.unlinkSync(lockFile);
    }
  }
  throw Error('Could not acquire deployment lock');
}
async function main(){fs.mkdirSync(base,{recursive:true,mode:0o700});const [action,id]=process.argv.slice(2);
  if(action==='status'){console.log(JSON.stringify(fs.existsSync(stateFile)?read(stateFile):{active:read(path.join(base,'baseline.json'))},null,2));return;}
  const lock=acquireLock();try{
  if(action==='snapshot')return await snapshot(id);
  if(action==='status'){console.log(JSON.stringify(fs.existsSync(stateFile)?read(stateFile):{active:read(path.join(base,'baseline.json'))},null,2));return;}
  if(action==='check-rollback'){
    const state=fs.existsSync(stateFile)?read(stateFile):{active:read(path.join(base,'baseline.json'))};
    const target={...(state.previous||state.active),port:state.active.port===8085?8084:8085,managed:true};delete target.pid;await start(target);const status=await control(target,'status');await control(target,'drain','POST');stop(target);console.log(JSON.stringify({rollbackDryRun:'passed',ready:status.ready,backgroundSync:false,liveRoutingChanged:false}));return;
  }
  if(action==='prepare'){const state=fs.existsSync(stateFile)?read(stateFile):{active:read(path.join(base,'baseline.json'))};const target={id,port:state.active.port===8084?8085:8084,managed:true,legacySource:'waqtmoney'};await start(target);console.log(JSON.stringify({prepared:target}));return;}
  if(action==='activate'||action==='deploy'){const state=fs.existsSync(stateFile)?read(stateFile):{active:read(path.join(base,'baseline.json'))};if(state.active.id===id){const current=await control(state.active,'status');if(!current.ready)throw Error('Active release is not ready');console.log(JSON.stringify({alreadyActive:id}));return;}const target={id,port:state.active.port===8084?8085:8084,managed:true,legacySource:'waqtmoney'};await switchTo(target,state.active,action==='deploy');console.log(JSON.stringify({deployed:id,rollback:'node '+path.join(base,'manageRelease.js')+' rollback'}));return;}
  if(action==='rollback'){const state=read(stateFile);const target={...state.previous,port:state.active.port===8084?8085:8084,managed:true};delete target.pid;await switchTo(target,state.active);console.log(JSON.stringify({rolledBackTo:target.id,databaseRestored:false}));return;}
  throw Error('Use snapshot ID, check-rollback, activate ID, rollback, or status');
 }finally{if(lock!==undefined)fs.closeSync(lock);fs.unlinkSync(lockFile);}}
module.exports={atomic,location,copyFrontend,switchProxy,start,control,waitDrained,acquireLock};
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({releaseOperationFailed:true,message:error.message}));process.exitCode=1});
