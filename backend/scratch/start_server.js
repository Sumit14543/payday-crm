const { spawn, execSync } = require('child_process');
const fs = require('fs');
require('../config/env');

async function run() {
  console.log('Starting daemon manager...');

  const port = String(process.env.PORT || '').trim();

  // 1. Kill any user process using pkill
  try {
    console.log('Attempting to kill existing user node process...');
    const currentUser = process.env.USER || 'waqtmoney';
    execSync(`pkill -9 -u ${currentUser} -f "testing-api" 2>/dev/null || true`, { stdio: 'ignore' });
    execSync(`pkill -9 -u ${currentUser} -f "node index.js" 2>/dev/null || true`, { stdio: 'ignore' });
  } catch (err) {
    console.log('pkill warning:', err.message);
  }

  // 2. Spawn node index.js as a detached daemon process
  try {
    console.log(`Spawning node index.js in background on port ${port}...`);
    const out = fs.openSync(`./server_${port}.log`, 'a');
    const err = fs.openSync(`./server_${port}.log`, 'a');

    const child = spawn('node', ['index.js'], {
      env: { ...process.env, PORT: port },
      detached: true,
      stdio: ['ignore', out, err]
    });

    child.unref();
    console.log(`Spawned background process with PID: ${child.pid}`);
    
    // Give it a second to bind
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Daemon startup completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to spawn daemon:', err);
    process.exit(1);
  }
}

run();
