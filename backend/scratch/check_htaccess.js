const fs = require('fs');
const path = require('path');

console.log("=== CHECKING HTACCESS ON PRODUCTION ===");
try {
  const paths = [
    '/home/waqtmoney/public_html/payday/.htaccess',
    '/home/waqtmoney/public_html/payday-api/.htaccess',
  ];

  paths.forEach(p => {
    if (fs.existsSync(p)) {
      console.log(`\nContent of ${p}:`);
      console.log(fs.readFileSync(p, 'utf8'));
    } else {
      console.log(`\n${p} does not exist.`);
    }
  });
} catch (err) {
  console.error("Failed to read htaccess files:", err);
}
