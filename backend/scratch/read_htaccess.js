const fs = require('fs');
const path = require('path');

console.log("=== READING HTACCESS ON SERVER ===");
const p = '/home/waqtmoney/public_html/payday-api/.htaccess';
if (fs.existsSync(p)) {
  console.log(fs.readFileSync(p, 'utf8'));
} else {
  console.log(".htaccess does not exist!");
}
