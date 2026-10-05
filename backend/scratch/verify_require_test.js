const path = require('path');
const fs = require('fs');

console.log("=== RUNNING REQUIRE DIAGNOSTIC TEST ===");
console.log("Current working directory:", process.cwd());
console.log("Node version:", process.version);

const targetPath = path.resolve(__dirname, '../database/bootstrap.js');
console.log(`Checking path: ${targetPath}`);
console.log("File exists:", fs.existsSync(targetPath));

if (fs.existsSync(targetPath)) {
  const stat = fs.statSync(targetPath);
  console.log(`File permissions: ${stat.mode.toString(8)}`);
  console.log(`File owner uid: ${stat.uid}, gid: ${stat.gid}`);
}

try {
  console.log("Attempting to require('../database/bootstrap')...");
  const bootstrap = require('../database/bootstrap');
  console.log("Require succeeded!", Object.keys(bootstrap));
} catch (e) {
  console.error("Require failed with error:");
  console.error(e.stack || e);
}
