const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("=== SEARCHING FOR PASSENGER ERROR LOGS ===");

// List of possible locations for error logs
const searchPaths = [
  '/home/waqtmoney/logs',
  '/home/waqtmoney/public_html/payday-api',
  '/home/waqtmoney'
];

searchPaths.forEach(dir => {
  try {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    entries.forEach(entry => {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isFile() && (entry.includes('log') || entry.includes('err') || entry.includes('out'))) {
        console.log(`Found log file: ${full} (${stat.size} bytes, modified: ${stat.mtime})`);
        if (stat.size > 0) {
          // print last 30 lines
          try {
            const tail = execSync(`tail -n 30 ${full}`, { encoding: 'utf8' });
            console.log(`--- LAST 30 LINES OF ${entry} ---`);
            console.log(tail);
            console.log(`---------------------------------\n`);
          } catch (e) {
            console.log(`Failed to tail ${entry}: ${e.message}`);
          }
        }
      }
    });
  } catch (e) {
    console.log(`Error reading directory ${dir}: ${e.message}`);
  }
});
