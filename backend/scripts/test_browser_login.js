const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function capture() {
  console.log('Starting frontend server...');
  const env = { ...process.env, PORT: '3000', NODE_ENV: 'production' };
  const serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..', '..', 'frontend'),
    env: env,
    shell: true
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server STDOUT]: ${data.toString().trim()}`);
  });

  console.log('Waiting 5 seconds for frontend server...');
  await sleep(5000);

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();

  // Print browser console logs in Node console for debugging
  page.on('console', msg => console.log('🌐 BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('🌐 BROWSER ERROR:', err.toString()));

  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
    await sleep(2000);
    
    // Attempting a simple login for telecaller
    console.log('Typing credentials directly...');
    await page.focus('input[type="email"]');
    await page.keyboard.type('telecaller@waqtfinance.com');
    
    await page.focus('input[type="password"]');
    await page.keyboard.type('Admin@123');
    
    console.log('Clicking submit...');
    const submitBtn = await page.$('form button[type="submit"]');
    await submitBtn.click();
    
    await sleep(5000);
    console.log('Current page URL after login submit:', page.url());
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
    serverProcess.kill('SIGINT');
    process.exit(0);
  }
}

capture();
