const fs = require('fs');

console.log("=== READING PARENT HTACCESS ===");
const file = '/home/waqtmoney/public_html/.htaccess';
if (fs.existsSync(file)) {
  console.log(fs.readFileSync(file, 'utf8'));
} else {
  console.log("Parent .htaccess does not exist.");
}
