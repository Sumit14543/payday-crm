const { execSync } = require('child_process');

console.log("=== CHECKING RUNNING NODE PROCESSES AND THEIR WORKING DIRECTORIES ===");

try {
  const psOutput = execSync('ps -u $USER -f', { encoding: 'utf8' });
  console.log(psOutput);

  // For each node process, let's try to find its working directory using lsof or pwdx
  const lines = psOutput.split('\n');
  lines.forEach(line => {
    if (line.includes('node') && !line.includes('grep') && !line.includes('ps -u')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[1];
      if (pid) {
        console.log(`\nProcess ID: ${pid}`);
        try {
          const cwd = execSync(`pwdx ${pid}`, { encoding: 'utf8' }).trim();
          console.log(`  CWD (pwdx): ${cwd}`);
        } catch (err) {
          console.log(`  pwdx failed: ${err.message.trim()}`);
        }
        try {
          const cmdLine = execSync(`cat /proc/${pid}/cmdline`, { encoding: 'utf8' }).replace(/\0/g, ' ');
          console.log(`  Cmdline: ${cmdLine}`);
        } catch (err) {
          console.log(`  cmdline read failed: ${err.message.trim()}`);
        }
      }
    }
  });
} catch (err) {
  console.error("Error executing commands:", err);
}
