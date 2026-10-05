const { execSync } = require('child_process');
const fs = require('fs');

console.log("=== RUNNING LOCAL DIAGNOSIS ===");
const targetDir = '/home/waqtmoney/public_html/payday-api';

try {
  process.chdir(targetDir);
  console.log("Current directory:", process.cwd());
} catch (e) {
  console.log("Failed to cd to target dir:", e.message);
}

try {
  console.log("Running: node index.js --check");
  const out = execSync('node index.js --check', { encoding: 'utf8', timeout: 5000 });
  console.log("Output:");
  console.log(out);
} catch (e) {
  console.log("Execution failed:");
  console.log(e.stdout || '');
  console.log(e.stderr || '');
  console.log(e.message);
}

try {
  console.log("Checking package.json:");
  console.log(fs.readFileSync('package.json', 'utf8'));
} catch (e) {
  console.log("Failed to read package.json:", e.message);
}
