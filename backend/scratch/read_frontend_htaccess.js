const fs = require('fs');

console.log("=== READING FRONTEND .HTACCESS ===");
try {
  const content = fs.readFileSync('/home/waqtmoney/public_html/payday/.htaccess', 'utf8');
  console.log(content);
} catch (err) {
  console.error("Error reading frontend .htaccess:", err);
}
