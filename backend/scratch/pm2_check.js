const { execSync } = require('child_process');

console.log("=== CHECKING PM2 PROCESSES ===");
try {
  const pm2List = execSync('pm2 list', { encoding: 'utf8' });
  console.log("PM2 List Output:\n", pm2List);
} catch (err) {
  console.log("PM2 is not running or failed:", err.message);
}

console.log("=== CHECKING RUNNING NODE PROCESSES ===");
try {
  const psOutput = execSync('ps aux | grep node', { encoding: 'utf8' });
  console.log("PS Output:\n", psOutput);
} catch (err) {
  console.log("Failed to run ps:", err.message);
}
