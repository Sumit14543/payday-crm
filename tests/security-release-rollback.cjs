const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),prefix=path.join(root,'tmp');fs.mkdirSync(prefix,{recursive:true});
const home=fs.mkdtempSync(path.join(prefix,'release-manager-'));process.env.PAYDAY_RELEASE_HOME=home;
const manager=require('../backend/scripts/manageRelease');delete process.env.PAYDAY_RELEASE_HOME;
const base=path.join(home,'payday-releases'),web=path.join(home,'public_html/payday');fs.mkdirSync(web,{recursive:true});fs.mkdirSync(path.join(home,'public_html/payday-api'),{recursive:true});
test.after(()=>{assert.ok(path.resolve(home).startsWith(path.resolve(prefix)+path.sep));fs.rmSync(home,{recursive:true,force:true});});
test('rollback restores its own index and retains hashed assets required by already-open tabs',()=>{
 const source=path.join(base,'old/frontend');fs.mkdirSync(path.join(source,'assets'),{recursive:true});fs.writeFileSync(path.join(source,'index.html'),'<html><head></head><body>Previous release</body></html>');fs.writeFileSync(path.join(source,'assets/old.js'),'old');fs.mkdirSync(path.join(web,'assets'));fs.writeFileSync(path.join(web,'assets/new.js'),'new');
 manager.copyFrontend({id:'old'});assert.ok(fs.readFileSync(path.join(web,'index.html'),'utf8').includes('Previous release'));assert.ok(fs.readFileSync(path.join(web,'index.html'),'utf8').includes('content="old"'));assert.equal(fs.readFileSync(path.join(web,'assets/new.js'),'utf8'),'new');assert.equal(fs.readFileSync(path.join(web,'assets/old.js'),'utf8'),'old');
});
test('API, frontend and existing testing alias switch together without changing unrelated rewrite rules',()=>{
 for(const name of ['payday-api','payday','testing']){const dir=path.join(home,'public_html',name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'.htaccess'),'deny .env\nRewriteRule ^api/(.*)$ http://127.0.0.1:8081/api/$1 [P,L]\n');}
 manager.switchProxy(8084);for(const name of ['payday-api','payday','testing']){const value=fs.readFileSync(path.join(home,'public_html',name,'.htaccess'),'utf8');assert.ok(value.includes('deny .env'));assert.ok(value.includes(':8084/api/'));}
 manager.switchProxy(8085);assert.ok(fs.readFileSync(path.join(web,'.htaccess'),'utf8').includes(':8085/api/'));
});
test('release IDs cannot escape the private release root',()=>{for(const id of ['../outside','a/b','a\\b',''])assert.throws(()=>manager.location(id));});
test('a running deployment is protected while an abruptly terminated operation cannot permanently block rollback',()=>{
 const file=path.join(base,'operation.lock');fs.mkdirSync(base,{recursive:true});const fd=manager.acquireLock();try{assert.throws(()=>manager.acquireLock(),/Another release operation/);}finally{fs.closeSync(fd);fs.unlinkSync(file);}
 const endedPid=Number(cp.execFileSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'}));fs.writeFileSync(file,JSON.stringify({pid:endedPid}));const recovered=manager.acquireLock();assert.equal(JSON.parse(fs.readFileSync(file)).pid,process.pid);fs.closeSync(recovered);fs.unlinkSync(file);
});
test('saved rollback application warms without startup migrations, exposes verified health and drains in-flight work before stopping',async()=>{
 const directory=path.join(base,'synthetic'),backend=path.join(directory,'backend');for(const part of ['config','database','models'])fs.mkdirSync(path.join(backend,part),{recursive:true});
 fs.copyFileSync(path.join(root,'backend/scripts/releaseLauncher.js'),path.join(base,'releaseLauncher.js'));
 fs.writeFileSync(path.join(backend,'config/db.js'),`exports.connectDatabase=async()=>{};exports.query=async()=>[{ok:1}];exports.queryMaster=async()=>[];exports.getTenantPool=()=>({});exports.tenantLocalStorage=new(require('node:async_hooks').AsyncLocalStorage)();`);
 fs.writeFileSync(path.join(backend,'config/env.js'),`exports.config={db:{database:'synthetic'}};`);
 fs.writeFileSync(path.join(backend,'models/collectionModel.js'),`exports.syncOverdueLoans=async()=>require('fs').appendFileSync(${JSON.stringify(path.join(home,'sync-count'))},'x');`);
 fs.writeFileSync(path.join(backend,'database/bootstrap.js'),`throw Error('Migrations must never run during rollback warmup');`);
 fs.writeFileSync(path.join(backend,'app.js'),`const app=require(${JSON.stringify(path.join(root,'backend/node_modules/express'))})();app.get('/api/health',(req,res)=>res.json({ok:true}));app.get('/slow',(req,res)=>setTimeout(()=>res.end('finished'),300));module.exports=app;`);
 fs.writeFileSync(path.join(backend,'server.js'),`const app=require('./app');exports.start=()=>{app.listen(process.env.PORT,'127.0.0.1');require('./database/bootstrap').bootstrap()};`);
 const socket=http.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const release={id:'synthetic',port,managed:true};let pid;
 try{
  await manager.start(release);pid=Number(fs.readFileSync(path.join(directory,'runtime/pid'),'utf8'));const status=await manager.control(release,'status');assert.equal(status.ready,true);assert.equal(status.activated,false);assert.equal(status.syncRunning,false);
  const denied=await fetch('http://127.0.0.1:'+port+'/__release/status');assert.equal(denied.status,404);
  const health=await fetch('http://127.0.0.1:'+port+'/api/health');assert.equal(health.headers.get('x-crm-release'),'synthetic');
  fs.writeFileSync(path.join(base,'active.json'),JSON.stringify({active:release}));
  const indexBefore=fs.readFileSync(path.join(web,'index.html'),'utf8');
  const repeated=cp.execFileSync(process.execPath,[path.join(root,'backend/scripts/manageRelease.js'),'activate','synthetic'],{encoding:'utf8',env:{...process.env,PAYDAY_RELEASE_HOME:home}});
  assert.equal(JSON.parse(repeated).alreadyActive,'synthetic');assert.equal(fs.readFileSync(path.join(web,'index.html'),'utf8'),indexBefore);assert.equal(Number(fs.readFileSync(path.join(directory,'runtime/pid'))),pid);
  const pending=fetch('http://127.0.0.1:'+port+'/slow');for(let i=0;i<20;i++){if((await manager.control(release,'status')).active)break;await new Promise(resolve=>setTimeout(resolve,10));}
  await manager.waitDrained(release);assert.equal(await(await pending).text(),'finished');assert.equal((await manager.control(release,'status')).active,0);assert.equal((await fetch('http://127.0.0.1:'+port+'/api/health')).status,503);
  await manager.control(release,'activate','POST');assert.equal((await manager.control(release,'status')).schedulerRunning,true);
  await manager.waitDrained(release);assert.equal((await manager.control(release,'status')).schedulerRunning,false);
  await manager.control(release,'activate','POST');assert.equal((await manager.control(release,'status')).schedulerRunning,true);assert.equal((await fetch('http://127.0.0.1:'+port+'/api/health')).status,200);
 }finally{if(pid){process.kill(pid,'SIGTERM');await new Promise(resolve=>setTimeout(resolve,250));}}
});
