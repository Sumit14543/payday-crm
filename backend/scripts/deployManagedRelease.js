// Called only after CI tests/build and an isolated production dependency install.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process'),assert=require('assert/strict');
const backend=path.resolve(__dirname,'..'),release=path.dirname(backend),base=path.dirname(release);
const id=path.basename(release);
assert.equal(base,'/home/waqtmoney/payday-releases');
assert.match(id,/^github-[a-f0-9]{40}-[0-9]+-[0-9]+$/);
assert.equal(fs.realpathSync(release),release);
const manifest=JSON.parse(fs.readFileSync(path.join(release,'deployment-manifest.json'),'utf8'));
assert.match(manifest.commit,/^[a-f0-9]{40}$/);
assert.ok(id.startsWith('github-'+manifest.commit+'-'));
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(digest(path.join(backend,'package-lock.json')),manifest.backendLock);
assert.equal(digest(path.join(release,'frontend/index.html')),manifest.frontendIndex);
assert.ok(fs.existsSync(path.join(base,'active.json')),'An initial managed release must exist');
// Each build keeps its own dependencies and uploads remain shared. No npm
// selector wrappers, application bootstrap repairs, or database restores.
for(const name of ['manageRelease.js','releaseLauncher.js']) {
  const target=path.join(base,name),temporary=target+'.new-'+process.pid;
  fs.copyFileSync(path.join(__dirname,name),temporary);fs.chmodSync(temporary,0o700);fs.renameSync(temporary,target);
}
cp.execFileSync(process.execPath,[path.join(__dirname,'securitySqlSelfTest.js')],{stdio:'inherit',env:{...process.env,CRM_LIVE_ROOT:'/home/waqtmoney/public_html/payday-api'}});
cp.execFileSync(process.execPath,[path.join(__dirname,'securitySanctionSqlSelfTest.js')],{stdio:'inherit'});
cp.execFileSync(process.execPath,[path.join(__dirname,'securityRuntimeCompatibility.js')],{stdio:'inherit'});
cp.execFileSync(process.execPath,[path.join(__dirname,'verifyPendingDigio.js')],{stdio:'inherit',env:{...process.env,CRM_CANDIDATE_ROOT:backend}});
require('./hardenLegacyLogs')();
cp.execFileSync(process.execPath,[path.join(base,'manageRelease.js'),'deploy',id],{stdio:'inherit'});
