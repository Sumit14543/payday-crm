const mysql = require('mysql');
const path = require('path');
const fs = require('fs');

// Custom .env parser to avoid requiring 'dotenv' module
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      if (!line || line.startsWith('#')) return;
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.log('Warning: Could not parse .env:', e.message);
}

const dbName = process.env.DB_NAME || 'payday_loan_crm';

const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? process.env.DB_PASS ?? '',
  port: Number(process.env.DB_PORT || 3306),
  database: dbName,
};

async function diagnose() {
  console.log(`Connecting to database: ${dbName}...`);
  const connection = mysql.createConnection(config);

  connection.connect((err) => {
    if (err) {
      console.error('Connection failed:', err.message);
      process.exit(1);
    }
  });

  console.log('Connected to MySQL server successfully.');

  const runQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      connection.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  };

  try {
    console.log(`Reading sanctions from database: ${dbName}...`);
    const sanctions = await runQuery(
      `SELECT id, agreement_number, borrower, principal_amount, whatsapp_status, whatsapp_error, email_status, email_error, created_at 
       FROM lead_sanctions 
       ORDER BY id DESC LIMIT 10`
    );

    if (sanctions.length === 0) {
      console.log('No sanctions found in lead_sanctions table.');
    } else {
      sanctions.forEach(s => {
        console.log(`\n======================================================`);
        console.log(`ID: ${s.id} | Ref: ${s.agreement_number} | Borrower: ${s.borrower} | Amt: ${s.principal_amount}`);
        console.log(`  WhatsApp Status: [${s.whatsapp_status}]`);
        console.log(`  WhatsApp Error:  ${s.whatsapp_error || 'None'}`);
        console.log(`  Email Status:    [${s.email_status}]`);
        console.log(`  Email Error:     ${s.email_error || 'None'}`);
        console.log(`  Created At:      ${s.created_at}`);
      });
    }
  } catch (err) {
    console.error('Diagnostic query error:', err.message || err);
  } finally {
    connection.end();
  }
}

diagnose();
