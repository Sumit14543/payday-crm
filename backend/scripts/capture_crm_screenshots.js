const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

console.log('Screenshots destination folder:', SCREENSHOTS_DIR);

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to replace sensitive data with generic dummy data in DOM
async function anonymizePage(page) {
  await page.evaluate(() => {
    // 1. Inject a CSS stylesheet to blur sensitive elements
    const style = document.createElement('style');
    style.innerHTML = `
      /* Blur sensitive columns in leads/applications/customers tables (Name, Mobile, PAN) */
      table tr td:nth-child(2),
      table tr td:nth-child(3),
      table tr td:nth-child(4) {
        filter: blur(6px) !important;
        opacity: 0.85;
      }
      
      /* Blur sensitive detail fields in sections (Personal, PAN, Aadhaar, Bank) */
      .blur-sensitive {
        filter: blur(6px) !important;
        opacity: 0.85;
      }
    `;
    document.head.appendChild(style);

    // 2. Scan DOM to apply the blur-sensitive class to values next to sensitive labels
    const labels = [
      'pan number', 'mobile', 'phone', 'aadhaar number', 'account number', 'ifsc', 
      'father', 'mother', 'dob', 'date of birth', 'email', 'address', 'utr', 
      'transaction id', 'beneficiary', 'account holder', 'holder name'
    ];
    
    document.querySelectorAll('div, span, td, p, dd, h2, h3, h4, th').forEach(el => {
      const text = el.textContent || '';
      
      // If the element is a label matching sensitive fields, blur its value
      const labelText = text.toLowerCase().trim();
      if (labels.some(l => labelText === l || labelText === l + ':')) {
        // Blur next sibling
        const next = el.nextElementSibling;
        if (next) {
          next.classList.add('blur-sensitive');
        }
        // Also check if it's inside a flex/grid row where the value is the second child
        const parent = el.parentElement;
        if (parent && parent.children.length === 2 && parent.children[0] === el) {
          parent.children[1].classList.add('blur-sensitive');
        }
      }
    });

    // 3. Blur client names in card headers / detail headers
    const mainHeader = document.querySelector('h2');
    if (mainHeader && !mainHeader.textContent.includes('Dashboard') && !mainHeader.textContent.includes('Control') && !mainHeader.textContent.includes('Workspace') && !mainHeader.textContent.includes('Sign in')) {
      mainHeader.classList.add('blur-sensitive');
    }

    // 4. Do string replacements for system names, DB names, and IDs
    function walkAndReplace(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.nodeValue;
        
        // Rebrands
        text = text.replace(/Waqt Finance/gi, 'OmniFin');
        text = text.replace(/Waqt/gi, 'OmniFin');
        text = text.replace(/GeetPay/gi, 'ApexLend');
        text = text.replace(/SalaryWaves/gi, 'WaveLend');
        text = text.replace(/LoanInWallet/gi, 'WalletLend');
        text = text.replace(/Bifrost/gi, 'CreditBureau API');
        text = text.replace(/Digio/gi, 'eSign Gate');
        
        // Database names
        text = text.replace(/waqtmoney_payday_geetpay/gi, 'omnifin_db_partner');
        text = text.replace(/waqtmoney_payday/gi, 'omnifin_db_primary');
        
        // IDs
        text = text.replace(/WAQT-MN-PD-/g, 'OMNI-PD-');
        text = text.replace(/WAQT-GP-PD-/g, 'APEX-PD-');
        
        node.nodeValue = text;
      } else {
        if (node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE') {
          for (let child of node.childNodes) {
            walkAndReplace(child);
          }
        }
      }
    }
    walkAndReplace(document.body);

    // 5. Replace branding logo images with placeholder SVGs
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || '';
      if (src.includes('logo') || src.includes('geetpay') || src.includes('waqtfinance') || src.includes('waqt')) {
        img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40"><rect width="100%" height="100%" fill="%230f172a"/><text x="50%" y="55%" font-family="Plus Jakarta Sans, sans-serif" font-size="14" fill="%23cbd5e1" font-weight="bold" dominant-baseline="middle" text-anchor="middle">OMNIFIN</text></svg>';
      }
    });
  });
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

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server STDERR]: ${data.toString().trim()}`);
  });

  console.log('Waiting 6 seconds for frontend server to stabilize...');
  await sleep(6000);

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 }
  });

  try {
    // ----------------------------------------------------
    // STEP 1: CAPTURE LOGIN SCREEN IN AN ISOLATED CONTEXT
    // ----------------------------------------------------
    console.log('Opening isolated context for login screen capture...');
    const loginContext = await browser.createBrowserContext();
    const loginPage = await loginContext.newPage();
    
    await loginPage.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
    await sleep(3000);
    
    console.log('Anonymizing and capturing Login screen...');
    await anonymizePage(loginPage);
    const loginPath = path.join(SCREENSHOTS_DIR, 'login_screen.png');
    await loginPage.screenshot({ path: loginPath });
    console.log(`📸 Saved Login screenshot -> ${loginPath}`);
    await loginContext.close();

    // ----------------------------------------------------
    // STEP 2: LOOP AND CAPTURE ALL ROLES (EACH IN INCOGNITO CONTEXT)
    // ----------------------------------------------------
    const credentials = [
      {
        role: 'telecaller',
        roleLabel: 'Telecaller',
        email: 'telecaller@waqtfinance.com',
        password: 'Admin@123',
        screenshots: [
          { path: 'dashboard_telecaller.png', url: 'http://localhost:3000/' },
          { path: 'leads_list.png', url: 'http://localhost:3000/leads' }
        ]
      },
      {
        role: 'credit-manager',
        roleLabel: 'Credit Manager',
        email: 'credit@waqtfinance.com',
        password: 'Admin@123',
        screenshots: [
          { path: 'credit_manager_panel.png', url: 'http://localhost:3000/credit-manager' },
          { path: 'credit_applications.png', url: 'http://localhost:3000/credit-applications' }
        ]
      },
      {
        role: 'accountant',
        roleLabel: 'Accountant',
        email: 'account@waqtfinance.com',
        password: 'Admin@123',
        screenshots: [
          { path: 'accountant_panel.png', url: 'http://localhost:3000/accountant' },
          { path: 'loan_management.png', url: 'http://localhost:3000/loan-management' }
        ]
      },
      {
        role: 'collection',
        roleLabel: 'Collection',
        email: 'collection@waqtfinance.com',
        password: 'Admin@123',
        screenshots: [
          { path: 'collection_panel.png', url: 'http://localhost:3000/collections' }
        ]
      },
      {
        role: 'superadmin',
        roleLabel: 'Superadmin',
        email: 'admin@paydaycrm.com',
        password: 'Admin@123',
        screenshots: [
          { path: 'superadmin_dashboard.png', url: 'http://localhost:3000/superadmin' }
        ]
      },
      {
        role: 'product-admin',
        roleLabel: 'Product Admin',
        email: 'productadmin@paydaycrm.com',
        password: 'Admin@123',
        screenshots: [
          { path: 'product_admin_dashboard.png', url: 'http://localhost:3000/' },
          { path: 'pipeline_view.png', url: 'http://localhost:3000/pipeline' },
          { path: 'revenue_analytics.png', url: 'http://localhost:3000/revenue' },
          { path: 'credit_applications_admin.png', url: 'http://localhost:3000/credit-applications' },
          { path: 'disbursals_admin.png', url: 'http://localhost:3000/loan-management' },
          { path: 'collections_admin.png', url: 'http://localhost:3000/collections' },
          { path: 'customers.png', url: 'http://localhost:3000/customers' },
          { path: 'documents.png', url: 'http://localhost:3000/documents' },
          { path: 'team.png', url: 'http://localhost:3000/team' },
          { path: 'reports_view.png', url: 'http://localhost:3000/reports' },
          { path: 'audit_logs.png', url: 'http://localhost:3000/audit-logs' },
          { path: 'settings.png', url: 'http://localhost:3000/settings' }
        ]
      }
    ];

    for (const cred of credentials) {
      console.log(`\n=========================================`);
      console.log(`🔑 Logging in as ${cred.roleLabel} (${cred.email})...`);
      console.log(`=========================================`);

      // Create a completely clean isolated browser context (incognito window) for this user
      const userContext = await browser.createBrowserContext();
      const page = await userContext.newPage();
      page.on('pageerror', err => console.log(`🌐 BROWSER [${cred.roleLabel}] ERROR:`, err.stack || err.toString()));

      await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
      await sleep(3500);

      // Open dropdown options
      console.log('Selecting role in dropdown...');
      
      let opened = false;
      let dropdownButton = null;
      
      for (let attempt = 1; attempt <= 5; attempt++) {
        const buttons = await page.$$('form button[type="button"]');
        for (const btn of buttons) {
          const text = await page.evaluate(el => el.textContent, btn);
          if (
            text.includes('Telecaller') || 
            text.includes('Credit Manager') || 
            text.includes('Accountant') || 
            text.includes('Collection') || 
            text.includes('Superadmin') || 
            text.includes('Product Admin')
          ) {
            dropdownButton = btn;
            break;
          }
        }

        if (dropdownButton) {
          console.log(`Clicking dropdown (Attempt ${attempt}/5)...`);
          await dropdownButton.click();
          await sleep(1000);
          
          const optionsCount = (await page.$$('div.absolute button')).length;
          if (optionsCount > 0) {
            opened = true;
            break;
          }
        } else {
          console.log(`Dropdown button not found on attempt ${attempt}`);
          await sleep(1000);
        }
      }

      if (!opened) {
        console.error(`❌ Failed to open dropdown for role: ${cred.roleLabel}`);
        await userContext.close();
        continue;
      }

      const options = await page.$$('div.absolute button');
      let selectedOption = null;
      for (const option of options) {
        const text = await page.evaluate(el => el.textContent, option);
        if (text.includes(cred.roleLabel)) {
          selectedOption = option;
          break;
        }
      }
      
      if (selectedOption) {
        await selectedOption.click();
        console.log(`Selected role: ${cred.roleLabel}`);
      } else {
        console.log(`⚠️ Option not found for: "${cred.roleLabel}"`);
      }
      await sleep(1000);

      // Type credentials
      console.log('Typing credentials...');
      await page.focus('input[type="email"]');
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type('input[type="email"]', cred.email);

      await page.focus('input[type="password"]');
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type('input[type="password"]', cred.password);

      // Submit login
      console.log('Submitting login form...');
      const submitBtn = await page.$('form button[type="submit"]');
      await submitBtn.click();
      await sleep(5000); // Allow redirection

      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        console.error(`❌ Failed to login as ${cred.roleLabel}`);
        await userContext.close();
        continue;
      }
      console.log(`✅ Logged in successfully! URL: ${currentUrl}`);

      // Capture screenshots
      for (const sc of cred.screenshots) {
        console.log(`Navigating to: ${sc.url}`);
        await page.goto(sc.url, { waitUntil: 'networkidle2' });
        await sleep(3500); // Let page fully render

        if (sc.path === 'leads_list.png') {
          // Anonymize and capture leads list
          await anonymizePage(page);
          await sleep(500);
          const listPath = path.join(SCREENSHOTS_DIR, sc.path);
          await page.screenshot({ path: listPath });
          console.log(`📸 Saved leads list screenshot -> ${listPath}`);

          // Reload page to restore React state cleanly before interaction
          console.log('Reloading page to restore React...');
          await page.reload({ waitUntil: 'networkidle2' });
          await sleep(2500);
          
          // Click first lead row
          console.log('Attempting to click first lead row in table...');
          const leadLink = await page.$('table tbody tr td a');
          if (leadLink) {
            await leadLink.click();
            await sleep(3500);
            
            // Anonymize details page
            await anonymizePage(page);
            await sleep(500);
            const detailPath = path.join(SCREENSHOTS_DIR, 'lead_details.png');
            await page.screenshot({ path: detailPath });
            console.log(`📸 Saved lead details screenshot -> ${detailPath}`);
          } else {
            console.log('No lead link found in table, navigating directly...');
            await page.goto('http://localhost:3000/leads/1', { waitUntil: 'networkidle2' });
            await sleep(3000);
            await anonymizePage(page);
            await sleep(500);
            const detailPath = path.join(SCREENSHOTS_DIR, 'lead_details.png');
            await page.screenshot({ path: detailPath });
            console.log(`📸 Saved fallback lead details screenshot -> ${detailPath}`);
          }
        } else {
          // Anonymize and capture
          await anonymizePage(page);
          await sleep(500);
          const scPath = path.join(SCREENSHOTS_DIR, sc.path);
          await page.screenshot({ path: scPath });
          console.log(`📸 Saved screenshot -> ${scPath}`);
        }
      }

      // Close context to clean up all storage/sessions for this user
      console.log(`Closing context for ${cred.roleLabel}...`);
      await userContext.close();
      await sleep(1000);
    }
  } catch (err) {
    console.error('❌ Capture Error:', err);
  } finally {
    console.log('Closing browser...');
    await browser.close();

    console.log('Stopping frontend server...');
    serverProcess.kill('SIGINT');
    await sleep(2000);
    console.log('Finished all captures.');
    process.exit(0);
  }
}

capture();
