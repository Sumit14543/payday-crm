const { execSync } = require('child_process');

console.log("=== CHECKING LISTENING PORTS ON THE SERVER ===");
try {
  const ssOut = execSync('ss -tlnp || netstat -tlnp', { encoding: 'utf8' });
  console.log(ssOut);
} catch (err) {
  console.error("Error checking ports:", err.message);
  try {
    // Fallback: list all processes running on port 8080 using lsof
    const lsofOut = execSync('lsof -i :8080', { encoding: 'utf8' });
    console.log("lsof :8080:\n", lsofOut);
  } catch (lsofErr) {
    console.error("lsof failed:", lsofErr.message);
  }
}
