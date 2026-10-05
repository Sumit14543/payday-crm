const fs = require('fs');

console.log("=== READING APP.JS ON SERVER ===");
const p = '/home/waqtmoney/public_html/payday-api/app.js';
if (fs.existsSync(p)) {
  const content = fs.readFileSync(p, 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, idx) => {
    console.log(`${idx + 1}: ${l}`);
  });
} else {
  console.log("app.js does not exist!");
}
