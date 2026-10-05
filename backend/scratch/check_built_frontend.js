const fs = require('fs');
const path = require('path');

console.log("=== CHECKING BUILT FRONTEND ASSETS ON PRODUCTION ===");

try {
  const assetsDir = '/home/waqtmoney/public_html/payday/assets';
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    console.log("Found JS asset files:", jsFiles);
    
    jsFiles.forEach(file => {
      const filePath = path.join(assetsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      const hasPaydayApi = content.includes('payday-api.waqtmoney.com');
      const hasTestingApi = content.includes('testing-api.waqtmoney.com');
      
      console.log(`File: ${file}`);
      console.log(`  Contains 'payday-api.waqtmoney.com': ${hasPaydayApi}`);
      console.log(`  Contains 'testing-api.waqtmoney.com': ${hasTestingApi}`);
      
      // Let's also search for collections/list or collections/summary/fetch
      const hasCollectionsList = content.includes('/collections/list');
      const hasCollectionsSummaryFetch = content.includes('/collections/summary/fetch');
      console.log(`  Contains '/collections/list': ${hasCollectionsList}`);
      console.log(`  Contains '/collections/summary/fetch': ${hasCollectionsSummaryFetch}`);
    });
  } else {
    console.log("Assets directory does not exist:", assetsDir);
  }
} catch (err) {
  console.error("Error checking built assets:", err);
}
