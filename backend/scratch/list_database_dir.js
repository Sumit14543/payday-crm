const fs = require('fs');
const path = require('path');

console.log("=== LISTING DATABASE DIRECTORY ON SERVER ===");

const dir = '/home/waqtmoney/public_html/payday-api/database';
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir);
  console.log("Files inside payday-api/database:");
  files.forEach(f => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    console.log(`- ${f} (${stat.size} bytes, modified: ${stat.mtime})`);
  });
} else {
  console.log("payday-api/database directory does not exist!");
}
