const fs = require('fs');

console.log("=== SCANNING HTACCESS AND INDEX FILES ===");

const files = [
  '/home/waqtmoney/public_html/payday/index.html',
  '/home/waqtmoney/public_html/testing/index.html',
  '/home/waqtmoney/public_html/payday/.htaccess',
  '/home/waqtmoney/public_html/testing/.htaccess'
];

files.forEach(file => {
  console.log(`\nFile: ${file}`);
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    console.log(content);
  } else {
    console.log("File does not exist.");
  }
});
