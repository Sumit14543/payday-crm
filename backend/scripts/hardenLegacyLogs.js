// Restrict owned files; preserve host-owned legacy logs in a private archive.
// No contents are read/deleted and central credential paths never move.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict');
const root = '/home/waqtmoney/public_html/payday-api';
function harden() {
  assert.equal(fs.realpathSync(root), root);
  const archive = '/home/waqtmoney/payday-releases/legacy-log-archive';
  let changed = 0, archived = 0;
  for (const name of fs.readdirSync(root)) {
    if (!/\.(?:log|err)$/.test(name) && !['.env', 'gcp-key.json'].includes(name)) continue;
    const target = path.join(root, name), info = fs.lstatSync(target);
    if (info.isSymbolicLink() || !info.isFile()) continue;
    if ((info.mode & 0o777) === 0o600) continue;
    if (info.uid !== process.getuid() && /\.(?:log|err)$/.test(name)) {
      // The account owns the source directory, but cannot chmod old root-owned
      // files. Moving these inactive logs keeps their data and inode intact;
      // the owner-only parent removes cross-account traversal/read access.
      fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
      assert.equal(fs.realpathSync(archive), archive);
      assert.equal(fs.lstatSync(archive).uid, process.getuid());
      fs.chmodSync(archive, 0o700);
      const destination = path.join(archive, name + '-' + crypto.randomBytes(12).toString('hex'));
      assert.equal(path.dirname(target), root);
      assert.equal(path.dirname(destination), archive);
      assert.ok(!fs.existsSync(destination));
      fs.renameSync(target, destination); archived++;
    } else { fs.chmodSync(target, 0o600); changed++; }
  }
  console.log(JSON.stringify({ legacyFilePermissions: 'restricted', changed, hostOwnedLogsPreservedInPrivateArchive: archived, logContentsDeleted: false }));
}
if (require.main === module) harden();
module.exports = harden;
