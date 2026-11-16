// Restrict old log/credential files without reading, deleting or moving contents.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const root = '/home/waqtmoney/public_html/payday-api';
function harden() {
  assert.equal(fs.realpathSync(root), root);
  let changed = 0;
  for (const name of fs.readdirSync(root)) {
    if (!/\.(?:log|err)$/.test(name) && !['.env', 'gcp-key.json'].includes(name)) continue;
    const target = path.join(root, name), info = fs.lstatSync(target);
    if (info.isSymbolicLink() || !info.isFile()) continue;
    if ((info.mode & 0o777) !== 0o600) { fs.chmodSync(target, 0o600); changed++; }
  }
  console.log(JSON.stringify({ legacyFilePermissions: 'restricted', changed }));
}
if (require.main === module) harden();
module.exports = harden;
