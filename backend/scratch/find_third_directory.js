const fs = require('fs');
const path = require('path');

console.log("=== SCANNING FOR TARGET TITLE TAG ON SERVER ===");

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
        if (content.includes('PayDay Loan CRM - Sales Management System')) {
          console.log(`FOUND FILE: ${fullPath}`);
          console.log("Content snippet around title:");
          const idx = content.indexOf('<title>');
          console.log(content.substring(idx, idx + 150));
        }
      }
    }
  } catch (err) {
    // Ignore read errors
  }
}

scanDir('/home/waqtmoney/public_html');
