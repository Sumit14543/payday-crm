const fs = require('fs');
const path = require('path');

console.log("=== LISTING LOGS DIRECTORY ===");
const homedir = process.env.HOME || '/home/waqtmoney';
const logDir = path.join(homedir, 'logs');
console.log("Log Directory:", logDir);

if (fs.existsSync(logDir)) {
  const files = fs.readdirSync(logDir);
  files.forEach(f => {
    const full = path.join(logDir, f);
    const stat = fs.statSync(full);
    console.log(`- ${f} (${stat.size} bytes, modified: ${stat.mtime})`);
  });
} else {
  console.log("Log directory does not exist!");
}
