const fs = require('fs');
const path = require('path');

console.log("=== LISTING LOG FILES IN APPLICATION ROOT ===");

try {
  const appRoot = '/home/waqtmoney/public_html/payday-api';
  if (fs.existsSync(appRoot)) {
    const files = fs.readdirSync(appRoot);
    console.log("All files in appRoot:", files);
    
    files.forEach(file => {
      const filePath = path.join(appRoot, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile() && (file.endsWith('.log') || file.endsWith('.txt') || file.includes('err') || file.includes('out'))) {
        console.log(`Log File: ${file} (Size: ${stat.size} bytes)`);
      }
    });
  } else {
    console.log("App root does not exist:", appRoot);
  }
} catch (err) {
  console.error("Error listing files:", err);
}
