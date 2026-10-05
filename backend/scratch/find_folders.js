const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("=== SCANNING FOLDERS ===");

function scanDir(dir, depth = 0) {
  if (depth > 3) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.git' || file === '.github') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file.includes('api') || file.includes('crm') || file.includes('payday')) {
          console.log(`Folder found: ${fullPath}`);
          if (fs.existsSync(path.join(fullPath, 'package.json'))) {
            console.log(`  (Contains package.json)`);
          }
        }
        scanDir(fullPath, depth + 1);
      }
    }
  } catch (err) {
    // ignore errors
  }
}

scanDir('/home/waqtmoney');

console.log("=== CPANEL DOMAIN INFO ===");
try {
  // Let's check if there are passenger or domain config files in home directory
  const files = execSync('find /home/waqtmoney -maxdepth 3 -name "*passenger*" -o -name "*cpanel*"', { encoding: 'utf8' });
  console.log("Passenger/cPanel files:\n", files);
} catch (e) {}
