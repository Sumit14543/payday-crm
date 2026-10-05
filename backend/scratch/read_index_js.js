const fs = require('fs');

console.log("=== READING INDEX.JS ON SERVER ===");
const p = '/home/waqtmoney/public_html/payday-api/index.js';
if (fs.existsSync(p)) {
  console.log(fs.readFileSync(p, 'utf8'));
} else {
  console.log("index.js does not exist!");
}
