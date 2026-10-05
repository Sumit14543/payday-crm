const fs = require('fs');

console.log("=== READING ROOT .HTACCESS ===");
try {
  const content = fs.readFileSync('/home/waqtmoney/public_html/.htaccess', 'utf8');
  console.log(content);
} catch (err) {
  console.error("Error reading root .htaccess:", err);
}
