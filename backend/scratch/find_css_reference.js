const fs = require('fs');
const path = require('path');

console.log("=== SCANNING FOR index-PWSIA7Uo.css ON SERVER ===");

function scanDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name === 'index.html') {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('index-PWSIA7Uo.css') || content.includes('index-CSA8Y8Co.js')) {
          console.log(`FOUND MATCH IN FILE: ${fullPath}`);
          console.log("File content:");
          console.log(content);
        }
      }
    }
  } catch (err) {
    // Ignore read errors
  }
}

scanDir('/home/waqtmoney/public_html');
scanDir('/home/waqtmoney/repositories');
