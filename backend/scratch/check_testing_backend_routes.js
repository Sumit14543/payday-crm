const fs = require('fs');

console.log("=== CHECKING TESTING BACKEND ROUTES ===");
const path = '/home/waqtmoney/public_html/testing-api/routes/collectionRoutes.js';
if (fs.existsSync(path)) {
  const content = fs.readFileSync(path, 'utf8');
  console.log("Found testing collectionRoutes.js! Content:");
  console.log(content);
} else {
  console.log("testing collectionRoutes.js does not exist.");
}
