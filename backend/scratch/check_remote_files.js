const fs = require('fs');
const path = require('path');

console.log("=== RECURSIVE FILE LISTING ===");
const targetDir = '/home/waqtmoney/public_html/payday-api';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        results.push(filePath + '/');
        results = results.concat(walk(filePath));
      }
    } else {
      results.push(filePath + ` (${stat.size} bytes)`);
    }
  });
  return results;
}

try {
  const files = walk(targetDir);
  console.log("Total files found (excluding node_modules):", files.length);
  console.log(files.map(f => f.replace(targetDir, '')).join('\n'));
} catch (e) {
  console.log("Failed to list files:", e.message);
}
