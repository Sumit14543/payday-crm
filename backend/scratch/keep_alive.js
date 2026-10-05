const { spawn, execSync } = require('child_process');
const fs = require('fs');
const net = require('net');

function checkPort(port) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(1000);
    client.once('connect', () => {
      client.destroy();
      resolve(true);
    });
    client.once('error', () => {
      resolve(false);
    });
    client.once('timeout', () => {
      client.destroy();
      resolve(false);
    });
    client.connect(port, '127.0.0.1');
  });
}

async function run() {
  const port = Number(process.env.PORT || 8083);
  const isRunning = await checkPort(port);
  if (isRunning) {
    console.log(`Server is already running on port ${port}.`);
    process.exit(0);
  }

  console.log(`Server is not running on port ${port}. Starting it now...`);
  
  try {
    execSync(`npx --yes kill-port ${port}`, { stdio: 'ignore' });
  } catch {}

  const out = fs.openSync(`/home/waqtmoney/public_html/testing-api/server_${port}.log`, 'a');
  const err = fs.openSync(`/home/waqtmoney/public_html/testing-api/server_${port}.log`, 'a');

  const child = spawn('node', ['/home/waqtmoney/public_html/testing-api/index.js'], {
    env: { ...process.env, PORT: String(port) },
    detached: true,
    stdio: ['ignore', out, err],
    cwd: '/home/waqtmoney/public_html/testing-api'
  });

  child.unref();
  console.log(`Spawned server with PID: ${child.pid}`);
  process.exit(0);
}

run();
