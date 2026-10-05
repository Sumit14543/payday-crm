const { execSync } = require('child_process');

console.log("=== DIAGNOSING VIA SSH-PUTTY EMULATION ===");

function runCmd(cmd) {
  console.log(`\nExecuting: ${cmd}`);
  try {
    const out = execSync(cmd, { encoding: 'utf8', shell: '/bin/bash', timeout: 8000 });
    console.log("Output:");
    console.log(out || "(No stdout)");
  } catch (e) {
    console.log("Execution failed:");
    console.log(e.stdout || '');
    console.log(e.stderr || '');
    console.log(e.message);
  }
}

runCmd("whoami");
runCmd("pm2 list || true");
runCmd("sudo pm2 list || true");
runCmd("ls -ld /home/waqtmoney/public_html/payday-api/node_modules || echo 'node_modules does not exist'");
runCmd("ls -la /home/waqtmoney/public_html/payday-api/database");
runCmd("node -e \"console.log(require('./database/bootstrap'))\" || true");
runCmd("node -e \"console.log(require('./app'))\" || true");
