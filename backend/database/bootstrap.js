const { connectDatabase, formatDatabaseError, queryMaster } = require('../config/db');
const { migrateMaster, seedMaster } = require('./masterSchema');
const { provisionTenant } = require('../services/tenantProvisionerService');
const { config } = require('../config/env');

let bootstrapPromise = null;

async function bootstrap() {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    console.log('[BOOTSTRAP] Starting database bootstrap...');
    // 1. Initialize databases and pools
    await connectDatabase();

    // 2. Migrate and Seed the central master DB if not already done
    let isMasterProvisioned = false;
    try {
      const result = await queryMaster("SHOW TABLES LIKE 'tenants'");
      isMasterProvisioned = result && result.length > 0;
    } catch (e) {
      isMasterProvisioned = false;
    }

    if (isMasterProvisioned && process.env.FORCE_MIGRATIONS !== 'true' && !process.argv.includes('--setup')) {
      console.log('[BOOTSTRAP] Master DB is already provisioned. Skipping master migrations & seeds.');
    } else {
      await migrateMaster();
      await seedMaster();
    }


    // 3. Retrieve all active tenants from master DB
    const tenants = await queryMaster('SELECT * FROM tenants WHERE status = "active"');

    // 4. Provision databases & schemas for each active tenant automatically
    for (const tenant of tenants) {
      if (tenant.slug === 'waqtfinance') {
        tenant.db_name = config.db.database;
      }
      try {
        await provisionTenant(tenant);
      } catch (err) {
        console.error(`⚠️ Failed to provision database for tenant ${tenant.slug}:`, formatDatabaseError(err));
        if (tenant.slug === 'waqtfinance') {
          throw err;
        }
      }
    }
    
    // 5. Run database due-date healer for existing affected loans
    try {
      const { getTenantPool } = require('../config/db');
      for (const tenant of tenants) {
        if (tenant.slug === 'waqtfinance') {
          tenant.db_name = config.db.database;
        }
        const pool = getTenantPool(tenant);
        const runQuery = (sql, params = []) => {
          return new Promise((resolve, reject) => {
            pool.query(sql, params, (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });
        };

        const affectedLoans = await runQuery(`
          SELECT id FROM loans 
          WHERE DATE(start_date) = '2026-07-03' AND DATE(due_date) = '2026-08-01'
        `);
        
        if (affectedLoans.length > 0) {
          console.log(`[HEAL] Found ${affectedLoans.length} affected loans in tenant ${tenant.slug}. Healing...`);
          const loanIds = affectedLoans.map(l => l.id);
          
          await runQuery(`
            UPDATE loans 
            SET due_date = '2026-08-02', 
                next_payment_date = CASE WHEN DATE(next_payment_date) = '2026-08-01' THEN '2026-08-02' ELSE next_payment_date END
            WHERE id IN (?)
          `, [loanIds]);
          
          await runQuery(`
            UPDATE loan_repayment_schedule 
            SET due_date = '2026-08-02'
            WHERE loan_id IN (?) AND DATE(due_date) = '2026-08-01'
          `, [loanIds]);
          
          await runQuery(`
            UPDATE collection_cases 
            SET original_due_date = '2026-08-02'
            WHERE loan_id IN (?) AND DATE(original_due_date) = '2026-08-01'
          `, [loanIds]);
          console.log(`[HEAL] Tenant ${tenant.slug} loans healed successfully.`);
        }

        await runQuery(`
          UPDATE loans 
          SET next_payment_date = due_date 
          WHERE next_payment_date IS NULL 
             OR next_payment_date = start_date 
             OR (amount_paid = 0 AND next_payment_date < due_date)
        `);

        await runQuery(`
          UPDATE loans l
          JOIN lead_accounting_payments lap 
            ON lap.loan_id = l.id 
            OR TRIM(LEADING 'LN' FROM UPPER(l.id)) = TRIM(LEADING 'LN' FROM UPPER(lap.loan_id))
            OR TRIM(LEADING '0' FROM TRIM(LEADING 'LNWQTMN' FROM TRIM(LEADING 'WQTMN' FROM TRIM(LEADING 'LN' FROM UPPER(l.id))))) = lap.lead_id
          SET l.start_date = DATE(lap.disbursed_at)
          WHERE lap.disbursed_at IS NOT NULL AND DATE(l.start_date) <> DATE(lap.disbursed_at)
        `);

        await runQuery(`
          UPDATE loan_applications
          SET status = 'disbursed'
          WHERE id IN (1986, 127) 
             OR application_id IN ('LNWQTMN01986', 'LNWQTMN00127', 'WQTMN01986', 'WQTMN00127', 'WAQTFN-PD-1782455676578', 'WAQTMN-PD-890903924560')
        `);

        // Finalize historical closed loan cases as requested by user
        try {
          const historicalClosedCases = [
            {
              loanId: 'WQTMN075',
              mobile: '8879190181',
              name: 'PRAVIN BABAN DONGRE',
              principal: 8820,
              paidAmount: 11100,
              disbursalDate: '2026-05-18',
              dueDate: '2026-05-29',
              closeDate: '2026-06-01',
              closeDateTime: '2026-06-01 00:00:00',
            },
            {
              loanId: 'LNWQTMN00170',
              mobile: '9557196828',
              name: 'VISHAL PANT',
              principal: 10584,
              paidAmount: 13440,
              disbursalDate: '2026-05-20',
              dueDate: '2026-06-01',
              closeDate: '2026-06-02',
              closeDateTime: '2026-06-02 00:00:00',
            },
            {
              loanId: 'LNWQTMN00509',
              mobile: '9055000141',
              name: 'ANSAR AHMAD KHAN',
              principal: 8820,
              paidAmount: 11100,
              disbursalDate: '2026-05-23',
              dueDate: '2026-06-03',
              closeDate: '2026-06-01',
              closeDateTime: '2026-06-01 00:00:00',
            },
            {
              loanId: 'LNWQTMN00243',
              mobile: '8800562592',
              name: 'KULDEEP SAINI',
              principal: 7056,
              paidAmount: 8400,
              disbursalDate: '2026-05-25',
              dueDate: '2026-05-30',
              closeDate: '2026-05-27',
              closeDateTime: '2026-05-27 00:00:00',
            },
            {
              loanId: 'WQTMN097',
              mobile: '8586999055',
              name: 'OSHIN VISHNOI',
              principal: 17640,
              paidAmount: 21600,
              disbursalDate: '2026-05-25',
              dueDate: '2026-06-02',
              closeDate: '2026-06-03',
              closeDateTime: '2026-06-03 00:00:00',
            },
            {
              loanId: 'LNWQTMN02791',
              mobile: '8688066259',
              name: 'HITESH REDDY GOURU SAI',
              principal: 22050,
              paidAmount: 34000,
            },
            {
              loanId: 'LNWQTMN02821',
              mobile: '9713095701',
              name: 'SHIREESH DUBEY',
              principal: 13230,
              paidAmount: 16500,
            },
            {
              loanId: 'LNWQTMN03088R1',
              mobile: '9593359233',
              name: 'POOJA GURUNG',
              principal: 20286,
              paidAmount: 28290,
            },
            {
              loanId: 'LNWQTMN02982',
              mobile: '9830237570',
              name: 'NILANJAN BHATTACHARYA',
              principal: 17640,
              paidAmount: 24400,
            },
            {
              loanId: 'LNWQTMN03021R1',
              mobile: '7002836115',
              name: 'AJIT DEKA',
              principal: 8820,
              paidAmount: 12700,
            },
            {
              loanId: 'LNWQTMN00901',
              mobile: '9891910285',
              name: 'VIPUL DUBEY',
              principal: 35280,
              paidAmount: 55080,
              disbursalDate: '2026-05-27',
              dueDate: '2026-06-28',
              closeDate: '2026-06-03',
              closeDateTime: '2026-06-03 00:00:00',
            },
          ];

          for (const item of historicalClosedCases) {
            const normId = item.loanId;
            const mobile = item.mobile;
            const firstName = item.name.split(' ')[0];

            await runQuery(`
              UPDATE loan_applications
              SET status = 'closed', is_active_application = 0
              WHERE application_id = ? 
                 OR application_id = CONCAT('LN', ?)
                 OR source_lead_id = ?
            `, [normId, normId, normId]);

            await runQuery(`
              UPDATE collection_cases
              SET total_due = 0,
                  status = 'Paid Off',
                  last_payment_date = ?,
                  original_due_date = COALESCE(?, original_due_date)
              WHERE loan_id = ? 
                 OR UPPER(loan_id) = ? 
                 OR UPPER(loan_id) = CONCAT('LN', ?)
            `, [item.closeDate, item.dueDate, normId, normId, normId]);

            const matchedLoans = await runQuery(`
              SELECT l.id, l.customer_id FROM loans l
              WHERE l.id = ? 
                 OR UPPER(l.id) = ? 
                 OR UPPER(l.id) = CONCAT('LN', ?)
                 OR TRIM(LEADING '0' FROM TRIM(LEADING 'LNWQTMN' FROM TRIM(LEADING 'WQTMN' FROM TRIM(LEADING 'LN' FROM UPPER(l.id))))) = TRIM(LEADING '0' FROM TRIM(LEADING 'WQTMN' FROM ?))
            `, [normId, normId, normId, normId]);

            for (const targetLoan of matchedLoans) {
              await runQuery(`
                UPDATE loans
                SET start_date = COALESCE(?, start_date),
                    due_date = COALESCE(?, due_date),
                    amount_paid = ?,
                    balance = 0,
                    status = 'Paid Off',
                    payment_status = 'Paid'
                WHERE id = ?
              `, [item.disbursalDate, item.dueDate, item.paidAmount, targetLoan.id]);

              const existingRepayments = await runQuery(`
                SELECT id FROM loan_repayments WHERE loan_id = ?
              `, [targetLoan.id]);

              const closeDateTimeVal = item.closeDateTime || new Date();
              const closeDateVal = item.closeDate || new Date().toISOString().slice(0, 10);

              const historicalRepayment = await runQuery(`
                SELECT id FROM loan_repayments WHERE loan_id = ? AND method = 'Historical Settlement' LIMIT 1
              `, [targetLoan.id]);

              if (historicalRepayment && historicalRepayment.length > 0) {
                await runQuery(`
                  UPDATE loan_repayments
                  SET amount = ?,
                      received_at = COALESCE(?, received_at, NOW()),
                      created_at = COALESCE(?, created_at, NOW()),
                      status = 'settled'
                  WHERE id = ?
                `, [item.paidAmount, item.closeDateTime || null, item.closeDateTime || null, historicalRepayment[0].id]);
              } else if (!existingRepayments || existingRepayments.length === 0) {
                await runQuery(`
                  INSERT INTO loan_repayments (
                    loan_id, customer_id, amount, principal_component, interest_component,
                    method, reference, status, received_by, received_at, created_at, metadata
                  ) VALUES (?, ?, ?, ?, ?, 'Historical Settlement', ?, 'settled', 'System Admin', ?, ?, ?)
                `, [
                  targetLoan.id,
                  targetLoan.customer_id || 'CUS-HISTORICAL',
                  item.paidAmount,
                  item.principal,
                  Math.max(0, item.paidAmount - item.principal),
                  `REF-SETTLED-${mobile}`,
                  closeDateTimeVal,
                  closeDateTimeVal,
                  JSON.stringify({ note: `Historical loan settlement on ${closeDateVal}` }),
                ]);
              }
            }
          }
          console.log('[HEAL] Historical 5 closed cases finalized by mobile successfully.');
        } catch (hCasesErr) {
          console.error('[HEAL] Historical 5 closed cases processing error:', hCasesErr);
        }

        // Self-heal corrupted loan amount_paid and balance records
        try {
          await runQuery(`
            UPDATE loans l
            SET amount_paid = COALESCE((
              SELECT SUM(r.amount)
              FROM loan_repayments r
              WHERE (
                r.loan_id = l.id
                OR TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(r.loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(l.id), ' ', ''), '-', ''), '_', ''))
              ) AND r.status IN ('received', 'success', 'paid', 'settled')
            ), 0)
          `);

          await runQuery(`
            UPDATE loans
            SET balance = GREATEST(0, ROUND(total_amount - amount_paid)),
                status = CASE 
                  WHEN GREATEST(0, ROUND(total_amount - amount_paid)) <= 0 THEN 'Paid Off' 
                  WHEN CURDATE() > due_date THEN 'Overdue' 
                  ELSE 'Active' 
                END,
                payment_status = CASE 
                  WHEN GREATEST(0, ROUND(total_amount - amount_paid)) <= 0 THEN 'Paid' 
                  WHEN amount_paid > 0 THEN 'Partial' 
                  WHEN CURDATE() > due_date THEN 'Overdue' 
                  ELSE 'Pending' 
                END
            WHERE balance > 0 AND status = 'Paid Off'
          `);

          await runQuery(`
            UPDATE collection_cases cc
            JOIN loans l ON (cc.loan_id = l.id OR TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(cc.loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(l.id), ' ', ''), '-', ''), '_', '')))
            SET cc.total_due = l.balance,
                cc.status = CASE WHEN l.balance <= 0 THEN 'Paid Off' WHEN CURDATE() > l.due_date THEN 'Overdue' ELSE 'Active' END
            WHERE l.balance > 0 AND cc.status = 'Paid Off'
          `);
        } catch (healErr) {
          console.error(`[BOOTSTRAP] Tenant ${tenant.slug} loan repayment self-heal error:`, healErr);
        }

        // Seed Himanshu Collection Agent account if missing or update credentials
        try {
          const himanshuEmail = 'himanshukumar@waqtfinance.com';
          const himanshuName = 'Himanshu';
          const himanshuRole = 'collection';
          const salt = '45fc08e36726dcad454fdc48a13b0c61';
          const hash = '16247bf3d93a6a8ef62144f46387eb3c999690637e65bc4c739c4708e9377795';

          await runQuery(
            `INSERT INTO crm_users (name, email, role, password_salt, password_hash, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               password_salt = VALUES(password_salt),
               password_hash = VALUES(password_hash),
               is_active = 1`,
            [himanshuName, himanshuEmail, himanshuRole, salt, hash]
          );
          console.log(`[SEED] Ensured Himanshu Collection account in database (${himanshuEmail})`);
        } catch (hErr) {
          console.error('⚠️ Failed to seed Himanshu collection user:', hErr.message);
        }

        // Seed Kanhiya Kumar Collection Agent account if missing or update credentials
        try {
          const kanhiyaEmail = 'kanhiayakumar@waqtfinance.com';
          const kanhiyaName = 'Kanhiya Kumar';
          const kanhiyaRole = 'collection';
          const kanhiyaSalt = 'cf0af1027e1f5b00788a041c6f8f62f7';
          const kanhiyaHash = '50c74212a6ab4586fdcf9dd63ccc48522da5489af740844bc1d48136db8f200d';

          await runQuery(
            `INSERT INTO crm_users (name, email, role, password_salt, password_hash, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               password_salt = VALUES(password_salt),
               password_hash = VALUES(password_hash),
               is_active = 1`,
            [kanhiyaName, kanhiyaEmail, kanhiyaRole, kanhiyaSalt, kanhiyaHash]
          );
          console.log(`[SEED] Ensured Kanhiya Kumar Collection account in database (${kanhiyaEmail})`);
        } catch (kErr) {
          console.error('⚠️ Failed to seed Kanhiya collection user:', kErr.message);
        }

        // Ensure ONLY Shruti Singh is Credit Manager and purge any legacy credit accounts
        try {
          const shrutiEmail = 'shrutisingh@waqtmoney.in';
          const shrutiName = 'Shruti Singh';
          const shrutiRole = 'credit-manager';
          const shrutiSalt = '45fc08e36726dcad454fdc48a13b0c61';
          const shrutiHash = '2b4ddded9506d7c47afa921cfc5696cf54ec1cdd3932851da1a042f0dcd0c537'; // Shruti@@waqtmoney##

          await runQuery(
            `INSERT INTO crm_users (name, email, role, password_salt, password_hash, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               role = VALUES(role),
               password_salt = VALUES(password_salt),
               password_hash = VALUES(password_hash),
               is_active = 1`,
            [shrutiName, shrutiEmail, shrutiRole, shrutiSalt, shrutiHash]
          );

          await runQuery(`
            DELETE FROM crm_users 
            WHERE (role = 'credit-manager' AND email NOT IN ('shrutisingh@waqtmoney.in', 'test.credit@waqtmoney.in'))
               OR email IN ('credit@waqtfinance.com', 'credit@geetpay.com', 'credit@loaninwallet.com', 'shruti@waqtmoney.in')
          `);

          // Seed test.credit@waqtmoney.in for testing environment
          const testCreditEmail = 'test.credit@waqtmoney.in';
          const testCreditName = 'Test Credit Manager';
          const testCreditRole = 'credit-manager';
          const testCreditSalt = '45fc08e36726dcad454fdc48a13b0c61';
          const testCreditHash = 'fd48197a6617817987d647982073a67e087f35747808b9bb23b5fb4ee3253a68'; // WaqtTest@2026##

          await runQuery(
            `INSERT INTO crm_users (name, email, role, password_salt, password_hash, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               role = VALUES(role),
               password_salt = VALUES(password_salt),
               password_hash = VALUES(password_hash),
               is_active = 1`,
            [testCreditName, testCreditEmail, testCreditRole, testCreditSalt, testCreditHash]
          );
          console.log(`[SEED] Ensured Shruti Singh and Test Credit Manager accounts in tenant ${tenant.slug}`);
        } catch (sErr) {
          console.error('⚠️ Failed to ensure Shruti credit user in bootstrap:', sErr.message);
        }
      }
    } catch (healError) {
      console.error('⚠️ Failed to run database startup due-date healer:', healError);
    }

    console.log('[BOOTSTRAP] Database bootstrap completed successfully.');
  })();

  return bootstrapPromise;
}

module.exports = { bootstrap };
