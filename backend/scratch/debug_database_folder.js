const { execSync } = require('child_process');
const fs = require('fs');

console.log("=== DIAGNOSING DATABASE FOLDER ===");
try {
  console.log("Current user:", execSync('whoami', { encoding: 'utf8' }).trim());
} catch (e) {
  console.log("Failed to run whoami:", e.message);
}

const dir = '/home/waqtmoney/public_html/payday-api/database';
try {
  console.log(`Listing ${dir} contents with ls -la:`);
  console.log(execSync(`ls -la ${dir}`, { encoding: 'utf8' }));
} catch (e) {
  console.log(`Failed to list ${dir}:`, e.message);
}

try {
  console.log("Checking if we can write to database folder:");
  const testFile = `${dir}/test_write.txt`;
  fs.writeFileSync(testFile, 'hello');
  console.log("Write success!");
  console.log("Listing after write:");
  console.log(execSync(`ls -la ${dir}`, { encoding: 'utf8' }));
  fs.unlinkSync(testFile);
} catch (e) {
  console.log("Write failed:", e.message);
}
