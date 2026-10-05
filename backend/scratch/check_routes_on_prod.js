const fs = require('fs');
const path = require('path');

console.log("=== CHECKING ROUTES FILE ON PRODUCTION ===");
try {
  const filePath = '/home/waqtmoney/public_html/payday-api/routes/collectionRoutes.js';
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    console.log(content);
  } else {
    console.log("File does not exist:", filePath);
  }
} catch (err) {
  console.error("Error reading routes file:", err);
}
