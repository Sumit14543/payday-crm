const fs = require('fs');
const path = require('path');

console.log("=== CHECKING FILE OWNERS AND PERMISSIONS ===");
const dir = '/home/waqtmoney/public_html/payday-api';

if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    console.log(`- ${f}: owner uid=${stat.uid}, gid=${stat.gid}, permissions=${stat.mode.toString(8)}, size=${stat.size}`);
  });
} else {
  console.log("Directory does not exist!");
}
