const fs = require('fs');
const path = require('path');

console.log("=== SCANNING FOR JS ASSET FILES ON SERVER ===");

function scanDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js') && (fullPath.includes('assets') || entry.name.includes('index-'))) {
        const stat = fs.statSync(fullPath);
        console.log(`File: ${fullPath}`);
        console.log(`  Size: ${stat.size} bytes`);
        console.log(`  MTime: ${stat.mtime.toISOString()}`);
      }
    }
  } catch (err) {
    // Ignore read errors
  }
}

scanDir('/home/waqtmoney/public_html');
scanDir('/home/waqtmoney/repositories');
