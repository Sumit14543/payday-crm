const crypto = require('crypto');
const { connectDatabase, query } = require('../config/db');

async function seedTestingDummyData() {
  try {
    await connectDatabase();
    console.log(`\n======================================================`);
    console.log(`     SEEDING RICH TESTING DUMMY DATA FOR TESTING CRM   `);
    console.log(`======================================================\n`);

    // Safety check: Avoid accidental execution on production environment
    const isProductionPort = String(process.env.PORT || '') === '8081';
    const isProductionDb = String(process.env.DB_NAME || '').toLowerCase() === 'waqtmoney_payday' && !process.argv.includes('--force');
    if (isProductionPort && isProductionDb) {
      console.warn('⚠️ Safety Notice: Detected production port (8081) and production DB. To run dummy seeding on production, pass --force. Aborting.');
      return;
    }

    // -------------------------------------------------------------------------
    // 1. SEED TEST USERS (Password: WaqtTest@2026##)
    // -------------------------------------------------------------------------
    const testUsers = [
      { email: 'test.telecaller@waqtmoney.in', name: 'Test Telecaller Agent', role: 'telecaller' },
      { email: 'test.credit@waqtmoney.in', name: 'Test Credit Manager', role: 'credit-manager' },
      { email: 'test.accountant@waqtmoney.in', name: 'Test Senior Accountant', role: 'accountant' },
      { email: 'test.collection@waqtmoney.in', name: 'Test Collection Officer', role: 'collection' },
      { email: 'test.admin@waqtmoney.in', name: 'Test Product Admin', role: 'product-admin' },
    ];

    for (const u of testUsers) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync('WaqtTest@2026##', salt, 120000, 32, 'sha256').toString('hex');
      const existing = await query('SELECT id FROM crm_users WHERE email = ? AND role = ?', [u.email, u.role]);

      if (existing.length > 0) {
        await query(
          'UPDATE crm_users SET name = ?, password_salt = ?, password_hash = ?, is_active = 1, on_duty = 1, updated_at = CURRENT_TIMESTAMP WHERE email = ? AND role = ?',
          [u.name, salt, hash, u.email, u.role]
        );
      } else {
        await query(
          'INSERT INTO crm_users (name, email, role, password_salt, password_hash, is_active, on_duty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [u.name, u.email, u.role, salt, hash]
        );
      }
    }
    console.log('✅ Test Users Verified & Active');

    // -------------------------------------------------------------------------
    // 2. SEED PIPELINE LEADS (loan_applications)
    // -------------------------------------------------------------------------
    const demoApplications = [
      // --- Stage 1: Submitted (New Leads) ---
      {
        id: 9101,
        appId: 'WQTMN09101',
        name: 'Aarav Mehta',
        mobile: '9876543101',
        email: 'aarav.mehta@example.com',
        amount: 45000,
        status: 'submitted',
        priority: 'High',
        assignedTo: 'test.telecaller@waqtmoney.in',
        income: 52000,
        city: 'Jaipur',
        pan: 'AARVM1011A',
        createdAt: '2026-10-09 10:00:00'
      },
      {
        id: 9102,
        appId: 'WQTMN09102',
        name: 'Rohan Verma',
        mobile: '9876543102',
        email: 'rohan.verma@example.com',
        amount: 60000,
        status: 'submitted',
        priority: 'Urgent',
        assignedTo: 'test.telecaller@waqtmoney.in',
        income: 68000,
        city: 'Delhi',
        pan: 'ROHAN1012B',
        createdAt: '2026-10-09 11:30:00'
      },
      {
        id: 9103,
        appId: 'WQTMN09103',
        name: 'Kavita Sen',
        mobile: '9876543103',
        email: 'kavita.sen@example.com',
        amount: 35000,
        status: 'submitted',
        priority: 'Medium',
        assignedTo: 'test.telecaller@waqtmoney.in',
        income: 42000,
        city: 'Indore',
        pan: 'KAVIT1013C',
        createdAt: '2026-10-09 12:15:00'
      },

      // --- Stage 2: In Review (Contacted) ---
      {
        id: 9104,
        appId: 'WQTMN09104',
        name: 'Manish Tiwari',
        mobile: '9876543104',
        email: 'manish.tiwari@example.com',
        amount: 50000,
        status: 'review',
        priority: 'High',
        assignedTo: 'test.telecaller@waqtmoney.in',
        income: 55000,
        city: 'Lucknow',
        pan: 'MANIS1014D',
        createdAt: '2026-10-08 09:30:00'
      },
      {
        id: 9105,
        appId: 'WQTMN09105',
        name: 'Deepak Joshi',
        mobile: '9876543105',
        email: 'deepak.joshi@example.com',
        amount: 40000,
        status: 'review',
        priority: 'Medium',
        assignedTo: 'test.telecaller@waqtmoney.in',
        income: 48000,
        city: 'Bhopal',
        pan: 'DEEPA1015E',
        createdAt: '2026-10-08 14:00:00'
      },

      // --- Stage 3: Documents Pending ---
      {
        id: 9106,
        appId: 'WQTMN09106',
        name: 'Siddharth Rao',
        mobile: '9876543106',
        email: 'siddharth.rao@example.com',
        amount: 70000,
        status: 'documents_pending',
        priority: 'Urgent',
        assignedTo: 'test.telecaller@waqtmoney.in',
        income: 75000,
        city: 'Bangalore',
        pan: 'SIDDH1016F',
        createdAt: '2026-10-07 10:20:00'
      },
      {
        id: 9107,
        appId: 'WQTMN09107',
        name: 'Ananya Mishra',
        mobile: '9876543107',
        email: 'ananya.mishra@example.com',
        amount: 55000,
        status: 'documents_pending',
        priority: 'High',
        assignedTo: 'test.telecaller@waqtmoney.in',
        income: 58000,
        city: 'Pune',
        pan: 'ANANY1017G',
        createdAt: '2026-10-07 16:45:00'
      },

      // --- Stage 4: Bank Verification (Send to Credit) ---
      {
        id: 9108,
        appId: 'WQTMN09108',
        name: 'Gaurav Nair',
        mobile: '9876543108',
        email: 'gaurav.nair@example.com',
        amount: 80000,
        status: 'send_to_credit',
        priority: 'Urgent',
        assignedTo: 'test.credit@waqtmoney.in',
        income: 88000,
        city: 'Chennai',
        pan: 'GAURA1018H',
        createdAt: '2026-10-06 11:00:00'
      },
      {
        id: 9109,
        appId: 'WQTMN09109',
        name: 'Pooja Deshmukh',
        mobile: '9876543109',
        email: 'pooja.deshmukh@example.com',
        amount: 90000,
        status: 'send_to_credit',
        priority: 'High',
        assignedTo: 'test.credit@waqtmoney.in',
        income: 95000,
        city: 'Mumbai',
        pan: 'POOJA1019I',
        createdAt: '2026-10-06 15:30:00'
      },

      // --- Stage 5: Approved (In Accountant Pending Disbursal Queue!) ---
      {
        id: 9110,
        appId: 'WQTMN09110',
        name: 'Rajesh Kulkarni',
        mobile: '9876543110',
        email: 'rajesh.kulkarni@example.com',
        amount: 50000,
        status: 'approved',
        priority: 'Urgent',
        assignedTo: 'test.accountant@waqtmoney.in',
        income: 60000,
        city: 'Pune',
        pan: 'RAJES1020J',
        bankName: 'HDFC Bank',
        accountNumber: '50100456123456',
        ifscCode: 'HDFC0000123',
        createdAt: '2026-10-05 09:00:00'
      },
      {
        id: 9111,
        appId: 'WQTMN09111',
        name: 'Sneha Roy',
        mobile: '9876543111',
        email: 'sneha.roy@example.com',
        amount: 65000,
        status: 'approved',
        priority: 'High',
        assignedTo: 'test.accountant@waqtmoney.in',
        income: 70000,
        city: 'Kolkata',
        pan: 'SNEHA1021K',
        bankName: 'ICICI Bank',
        accountNumber: '000401567890',
        ifscCode: 'ICIC0000004',
        createdAt: '2026-10-05 11:30:00'
      },
      {
        id: 9112,
        appId: 'WQTMN09112',
        name: 'Arjun Malhotra',
        mobile: '9876543112',
        email: 'arjun.malhotra@example.com',
        amount: 100000,
        status: 'approved',
        priority: 'Urgent',
        assignedTo: 'test.accountant@waqtmoney.in',
        income: 110000,
        city: 'Gurgaon',
        pan: 'ARJUN1022L',
        bankName: 'State Bank of India',
        accountNumber: '32014567890',
        ifscCode: 'SBIN0001234',
        createdAt: '2026-10-05 14:00:00'
      },

      // --- Stage 6: Disbursed (Active On-time, Partial, Closed) ---
      {
        id: 9113,
        appId: 'WQTMN09113',
        name: 'Karan Kapoor',
        mobile: '9876543113',
        email: 'karan.kapoor@example.com',
        amount: 40000,
        status: 'disbursed',
        priority: 'High',
        assignedTo: 'test.accountant@waqtmoney.in',
        income: 48000,
        city: 'Chandigarh',
        pan: 'KARAN1023M',
        bankName: 'Axis Bank',
        accountNumber: '91201001234567',
        ifscCode: 'UTIB0000123',
        createdAt: '2026-09-20 10:00:00'
      },
      {
        id: 9114,
        appId: 'WQTMN09114',
        name: 'Swati Aggarwal',
        mobile: '9876543114',
        email: 'swati.aggarwal@example.com',
        amount: 50000,
        status: 'disbursed',
        priority: 'Medium',
        assignedTo: 'test.accountant@waqtmoney.in',
        income: 56000,
        city: 'Delhi',
        pan: 'SWATI1024N',
        bankName: 'Kotak Mahindra Bank',
        accountNumber: '4012345678',
        ifscCode: 'KKBK0000123',
        createdAt: '2026-09-22 11:00:00'
      },
      {
        id: 9115,
        appId: 'WQTMN09115',
        name: 'Naveen Saxena',
        mobile: '9876543115',
        email: 'naveen.saxena@example.com',
        amount: 60000,
        status: 'disbursed',
        priority: 'Urgent',
        assignedTo: 'test.accountant@waqtmoney.in',
        income: 65000,
        city: 'Jaipur',
        pan: 'NAVEE1025O',
        bankName: 'HDFC Bank',
        accountNumber: '50100789012345',
        ifscCode: 'HDFC0000123',
        createdAt: '2026-09-10 12:00:00'
      },
      {
        id: 9116,
        appId: 'WQTMN09116',
        name: 'Preeti Singhania',
        mobile: '9876543116',
        email: 'preeti.singhania@example.com',
        amount: 75000,
        status: 'disbursed',
        priority: 'High',
        assignedTo: 'test.accountant@waqtmoney.in',
        income: 82000,
        city: 'Ahmedabad',
        pan: 'PREET1026P',
        bankName: 'ICICI Bank',
        accountNumber: '000901234567',
        ifscCode: 'ICIC0000009',
        createdAt: '2026-09-01 10:00:00'
      },
      {
        id: 9117,
        appId: 'WQTMN09117',
        name: 'Harish Bansal',
        mobile: '9876543117',
        email: 'harish.bansal@example.com',
        amount: 30000,
        status: 'closed',
        priority: 'Low',
        assignedTo: 'test.accountant@waqtmoney.in',
        income: 38000,
        city: 'Agra',
        pan: 'HARIS1027Q',
        bankName: 'SBI Bank',
        accountNumber: '33012345678',
        ifscCode: 'SBIN0001234',
        createdAt: '2026-08-15 10:00:00'
      },

      // --- Stage 7: Collection Overdue Cases ---
      {
        id: 9118,
        appId: 'WQTMN09118',
        name: 'Sunil Yadav',
        mobile: '9876543118',
        email: 'sunil.yadav@example.com',
        amount: 45000,
        status: 'disbursed',
        priority: 'Urgent',
        assignedTo: 'test.collection@waqtmoney.in',
        income: 50000,
        city: 'Noida',
        pan: 'SUNIL1028R',
        bankName: 'Punjab National Bank',
        accountNumber: '0123000100012345',
        ifscCode: 'PUNB0012300',
        createdAt: '2026-09-10 10:00:00'
      },
      {
        id: 9119,
        appId: 'WQTMN09119',
        name: 'Tarun Bajaj',
        mobile: '9876543119',
        email: 'tarun.bajaj@example.com',
        amount: 55000,
        status: 'disbursed',
        priority: 'High',
        assignedTo: 'test.collection@waqtmoney.in',
        income: 60000,
        city: 'Faridabad',
        pan: 'TARUN1029S',
        bankName: 'HDFC Bank',
        accountNumber: '50100987654321',
        ifscCode: 'HDFC0000123',
        createdAt: '2026-09-03 11:00:00'
      },
      {
        id: 9120,
        appId: 'WQTMN09120',
        name: 'Ritika Chauhan',
        mobile: '9876543120',
        email: 'ritika.chauhan@example.com',
        amount: 35000,
        status: 'disbursed',
        priority: 'Medium',
        assignedTo: 'test.collection@waqtmoney.in',
        income: 42000,
        city: 'Meerut',
        pan: 'RITIK1030T',
        bankName: 'ICICI Bank',
        accountNumber: '001101234567',
        ifscCode: 'ICIC0000011',
        createdAt: '2026-08-27 12:00:00'
      },
      {
        id: 9121,
        appId: 'WQTMN09121',
        name: 'Vijay Khurana',
        mobile: '9876543121',
        email: 'vijay.khurana@example.com',
        amount: 70000,
        status: 'disbursed',
        priority: 'Urgent',
        assignedTo: 'test.collection@waqtmoney.in',
        income: 76000,
        city: 'Ludhiana',
        pan: 'VIJAY1031U',
        bankName: 'Axis Bank',
        accountNumber: '91301007654321',
        ifscCode: 'UTIB0000123',
        createdAt: '2026-08-18 10:00:00'
      },
      {
        id: 9122,
        appId: 'WQTMN09122',
        name: 'Meenakshi Iyer',
        mobile: '9876543122',
        email: 'meenakshi.iyer@example.com',
        amount: 40000,
        status: 'disbursed',
        priority: 'High',
        assignedTo: 'test.collection@waqtmoney.in',
        income: 48000,
        city: 'Chennai',
        pan: 'MEENA1032V',
        bankName: 'SBI Bank',
        accountNumber: '34012345678',
        ifscCode: 'SBIN0001234',
        createdAt: '2026-08-11 11:30:00'
      },
      {
        id: 9123,
        appId: 'WQTMN09123',
        name: 'Alok Trivedi',
        mobile: '9876543123',
        email: 'alok.trivedi@example.com',
        amount: 60000,
        status: 'disbursed',
        priority: 'Urgent',
        assignedTo: 'test.collection@waqtmoney.in',
        income: 65000,
        city: 'Kanpur',
        pan: 'ALOKT1033W',
        bankName: 'Bank of Baroda',
        accountNumber: '12340100012345',
        ifscCode: 'BARB0KNPURX',
        createdAt: '2026-07-26 14:00:00'
      },
      {
        id: 9124,
        appId: 'WQTMN09124',
        name: 'Bhavna Patel',
        mobile: '9876543124',
        email: 'bhavna.patel@example.com',
        amount: 85000,
        status: 'disbursed',
        priority: 'Urgent',
        assignedTo: 'test.collection@waqtmoney.in',
        income: 92000,
        city: 'Surat',
        pan: 'BHAVN1034X',
        bankName: 'HDFC Bank',
        accountNumber: '50100112233445',
        ifscCode: 'HDFC0000123',
        createdAt: '2026-06-26 10:00:00'
      },
      {
        id: 9125,
        appId: 'WQTMN09125',
        name: 'Kishore Nair',
        mobile: '9876543125',
        email: 'kishore.nair@example.com',
        amount: 50000,
        status: 'disbursed',
        priority: 'Urgent',
        assignedTo: 'test.collection@waqtmoney.in',
        income: 54000,
        city: 'Kochi',
        pan: 'KISHO1035Y',
        bankName: 'Federal Bank',
        accountNumber: '10010100054321',
        ifscCode: 'FDRL0001001',
        createdAt: '2026-05-25 15:00:00'
      }
    ];

    for (const app of demoApplications) {
      await query(`
        INSERT INTO loan_applications (
          id, application_id, full_name, mobile, email, loan_amount, status, priority,
          assigned_to, source_system, employment_status, monthly_income, city, pan_number,
          bank_name, account_number, ifsc_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'waqtmoney', 'Salaried', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          status = VALUES(status),
          priority = VALUES(priority),
          assigned_to = VALUES(assigned_to),
          loan_amount = VALUES(loan_amount),
          bank_name = VALUES(bank_name),
          account_number = VALUES(account_number),
          ifsc_code = VALUES(ifsc_code)
      `, [
        app.id, app.appId, app.name, app.mobile, app.email, app.amount,
        app.status, app.priority, app.assignedTo, app.income, app.city, app.pan,
        app.bankName || null, app.accountNumber || null, app.ifscCode || null, app.createdAt
      ]);
    }
    console.log(`✅ 25 Demo Applications Seeded across all Pipeline Stages`);

    // -------------------------------------------------------------------------
    // 3. SEED DOCUMENT CHECKS & CREDIT HANDOFFS
    // -------------------------------------------------------------------------
    const docKeys = ['pan', 'aadhaar', 'selfie', 'salary_slip_current', 'bank_details', 'cibil'];
    for (let id = 9106; id <= 9125; id++) {
      const appId = `WQTMN0${id}`;
      for (const key of docKeys) {
        await query(`
          INSERT INTO lead_document_checks (lead_id, application_id, document_key, label, status, verified_by, verified_at)
          VALUES (?, ?, ?, ?, 'verified', 'test.telecaller@waqtmoney.in', CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE status = 'verified'
        `, [String(id), appId, key, key.toUpperCase().replace(/_/g, ' ')]);
      }
    }
    console.log('✅ KYC & Document Checks Verified for Stages 3-7');

    // -------------------------------------------------------------------------
    // 4. SEED SANCTIONS & AGREEMENTS
    // -------------------------------------------------------------------------
    // Sanctions for 9110, 9111, 9112 (Approved, Waiting for Disbursal in Accounting Queue)
    // and 9113 - 9125 (Disbursed)
    const sanctionConfigs = [
      { id: 9110, principal: 50000, fee: 2000, gst: 360, disb: 47640, repay: 55000, tenure: 30, due: '2026-11-04', bank: 'HDFC Bank', acc: '50100456123456', ifsc: 'HDFC0000123' },
      { id: 9111, principal: 65000, fee: 2600, gst: 468, disb: 61932, repay: 71500, tenure: 30, due: '2026-11-04', bank: 'ICICI Bank', acc: '000401567890', ifsc: 'ICIC0000004' },
      { id: 9112, principal: 100000, fee: 4000, gst: 720, disb: 95280, repay: 110000, tenure: 30, due: '2026-11-04', bank: 'State Bank of India', acc: '32014567890', ifsc: 'SBIN0001234' },
      // Disbursed
      { id: 9113, principal: 40000, fee: 1600, gst: 288, disb: 38112, repay: 44000, tenure: 30, due: '2026-10-20', bank: 'Axis Bank', acc: '91201001234567', ifsc: 'UTIB0000123' },
      { id: 9114, principal: 50000, fee: 2000, gst: 360, disb: 47640, repay: 55000, tenure: 30, due: '2026-10-22', bank: 'Kotak Mahindra Bank', acc: '4012345678', ifsc: 'KKBK0000123' },
      { id: 9115, principal: 60000, fee: 2400, gst: 432, disb: 57168, repay: 66000, tenure: 30, due: '2026-10-10', bank: 'HDFC Bank', acc: '50100789012345', ifsc: 'HDFC0000123' },
      { id: 9116, principal: 75000, fee: 3000, gst: 540, disb: 71460, repay: 82500, tenure: 30, due: '2026-10-01', bank: 'ICICI Bank', acc: '000901234567', ifsc: 'ICIC0000009' },
      { id: 9117, principal: 30000, fee: 1200, gst: 216, disb: 28584, repay: 33000, tenure: 30, due: '2026-09-14', bank: 'SBI Bank', acc: '33012345678', ifsc: 'SBIN0001234' },
      // Collections
      { id: 9118, principal: 45000, fee: 1800, gst: 324, disb: 42876, repay: 49500, tenure: 30, due: '2026-10-10', bank: 'Punjab National Bank', acc: '0123000100012345', ifsc: 'PUNB0012300' },
      { id: 9119, principal: 55000, fee: 2200, gst: 396, disb: 52404, repay: 60500, tenure: 30, due: '2026-10-03', bank: 'HDFC Bank', acc: '50100987654321', ifsc: 'HDFC0000123' },
      { id: 9120, principal: 35000, fee: 1400, gst: 252, disb: 33348, repay: 38500, tenure: 30, due: '2026-09-26', bank: 'ICICI Bank', acc: '001101234567', ifsc: 'ICIC0000011' },
      { id: 9121, principal: 70000, fee: 2800, gst: 504, disb: 66696, repay: 77000, tenure: 30, due: '2026-09-18', bank: 'Axis Bank', acc: '91301007654321', ifsc: 'UTIB0000123' },
      { id: 9122, principal: 40000, fee: 1600, gst: 288, disb: 38112, repay: 44000, tenure: 30, due: '2026-09-11', bank: 'SBI Bank', acc: '34012345678', ifsc: 'SBIN0001234' },
      { id: 9123, principal: 60000, fee: 2400, gst: 432, disb: 57168, repay: 66000, tenure: 30, due: '2026-08-26', bank: 'Bank of Baroda', acc: '12340100012345', ifsc: 'BARB0KNPURX' },
      { id: 9124, principal: 85000, fee: 3400, gst: 612, disb: 80988, repay: 93500, tenure: 30, due: '2026-07-27', bank: 'HDFC Bank', acc: '50100112233445', ifsc: 'HDFC0000123' },
      { id: 9125, principal: 50000, fee: 2000, gst: 360, disb: 47640, repay: 55000, tenure: 30, due: '2026-06-25', bank: 'Federal Bank', acc: '10010100054321', ifsc: 'FDRL0001001' },
    ];

    for (const sc of sanctionConfigs) {
      const appId = `WQTMN0${sc.id}`;
      const appRecord = demoApplications.find(a => a.id === sc.id);
      const borrowerName = appRecord ? appRecord.name : `Applicant ${sc.id}`;
      const borrowerPhone = appRecord ? appRecord.mobile : `987654${sc.id}`;
      const borrowerEmail = appRecord ? appRecord.email : `applicant${sc.id}@example.com`;

      await query(`
        INSERT INTO lead_sanctions (
          lead_id, application_id, agreement_number, borrower, borrower_phone, borrower_email,
          principal_amount, processing_fee, gst_amount, disbursed_amount, repayment_amount,
          tenure_days, interest_rate, due_date, bank_name, account_number, ifsc_code, status, sent_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10, ?, ?, ?, ?, 'sent', CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          principal_amount = VALUES(principal_amount),
          disbursed_amount = VALUES(disbursed_amount),
          repayment_amount = VALUES(repayment_amount),
          status = 'sent'
      `, [
        String(sc.id), appId, `SAN-WQTMN-${sc.id}`, borrowerName, borrowerPhone, borrowerEmail,
        sc.principal, sc.fee, sc.gst, sc.disb, sc.repay, sc.tenure, sc.due, sc.bank, sc.acc, sc.ifsc
      ]);

      await query(`
        INSERT INTO lead_loan_agreements (
          lead_id, application_id, agreement_number, status, sent_at, signed_at
        ) VALUES (?, ?, ?, 'signed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE status = 'signed'
      `, [String(sc.id), appId, `SAN-WQTMN-${sc.id}`]);

      await query(`
        INSERT INTO lead_status_events (
          lead_id, application_id, stage_key, occurred_at, actor
        ) VALUES (?, ?, 'accounting_handoff', CURRENT_TIMESTAMP, 'test.credit@waqtmoney.in')
        ON DUPLICATE KEY UPDATE stage_key = 'accounting_handoff'
      `, [String(sc.id), appId]);
    }
    console.log('✅ Sanctions, Signed eSign Agreements, & Accounting Handoffs Seeded');

    // -------------------------------------------------------------------------
    // 5. SEED ACCOUNTANT DISBURSEMENTS & RECENT TRANSFERS
    // -------------------------------------------------------------------------
    // Disbursed leads: 9113 to 9125 (Exclude 9110, 9111, 9112 so they remain in Pending Disbursal Queue!)
    const disbursedLeads = sanctionConfigs.filter(s => s.id >= 9113);
    for (const dl of disbursedLeads) {
      const appId = `WQTMN0${dl.id}`;
      const loanId = `LN${dl.id}`;
      const utr = `UTR${dl.id}${Math.floor(100000 + Math.random() * 900000)}`;

      await query(`
        INSERT INTO lead_accounting_payments (
          lead_id, application_id, loan_id, amount, method, reference, transfer_type,
          transaction_id, notes, status, paid_by, disbursed_at, account_number, bank_name, ifsc_code
        ) VALUES (?, ?, ?, ?, 'IMPS', ?, 'IMPS', ?, 'Disbursed via automated testing bank transfer', 'paid', 'test.accountant@waqtmoney.in', '2026-09-20 10:00:00', ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          amount = VALUES(amount),
          status = 'paid'
      `, [
        String(dl.id), appId, loanId, dl.disb, utr, utr, dl.acc, dl.bank, dl.ifsc
      ]);
    }
    console.log('✅ Accountant Disbursal Records Seeded (Leaves 9110, 9111, 9112 Pending for Testing)');

    // -------------------------------------------------------------------------
    // 6. SEED CUSTOMERS & LOANS
    // -------------------------------------------------------------------------
    for (const sc of sanctionConfigs) {
      const cusId = `CUS${sc.id}`;
      const loanId = `LN${sc.id}`;
      const appRecord = demoApplications.find(a => a.id === sc.id);
      const name = appRecord ? appRecord.name : `Customer ${sc.id}`;
      const phone = appRecord ? appRecord.mobile : `987654${sc.id}`;
      const email = appRecord ? appRecord.email : `cus${sc.id}@example.com`;
      const city = appRecord ? appRecord.city : 'Mumbai';

      let isClosed = (sc.id === 9117);
      let isPartial = (sc.id === 9116);
      let amountPaid = isClosed ? sc.repay : (isPartial ? 40000 : 0);
      let balance = isClosed ? 0 : (isPartial ? (sc.repay - 40000) : sc.repay);
      let loanStatus = isClosed ? 'Closed' : 'Active';
      let payStatus = isClosed ? 'Paid' : (isPartial ? 'Partially Paid' : 'Pending');

      await query(`
        INSERT INTO customers (
          id, name, email, phone, address, credit_score, total_loans, active_loans,
          total_borrowed, total_repaid, join_date, risk_level, monthly_income
        ) VALUES (?, ?, ?, ?, ?, 720, 1, ?, ?, ?, '2026-08-01', 'Low', ?)
        ON DUPLICATE KEY UPDATE
          active_loans = VALUES(active_loans),
          total_borrowed = VALUES(total_borrowed),
          total_repaid = VALUES(total_repaid)
      `, [
        cusId, name, email, phone, `${city}, India`, isClosed ? 0 : 1, sc.principal, amountPaid, appRecord?.income || 50000
      ]);

      await query(`
        INSERT INTO loans (
          id, customer_id, principal, interest_rate, total_amount, amount_paid, balance,
          start_date, due_date, status, payment_status, next_payment_date, next_payment_amount
        ) VALUES (?, ?, ?, 10, ?, ?, ?, '2026-09-10', ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          balance = VALUES(balance),
          amount_paid = VALUES(amount_paid),
          status = VALUES(status),
          due_date = VALUES(due_date)
      `, [
        loanId, cusId, sc.principal, sc.repay, amountPaid, balance, sc.due, loanStatus, payStatus, sc.due, balance
      ]);

      // Repayment schedule
      await query(`
        INSERT INTO loan_repayment_schedule (
          loan_id, lead_id, application_id, installment_number, due_date,
          principal_due, interest_due, fees_due, penalty_due, total_due, amount_paid, status
        ) VALUES (?, ?, ?, 1, ?, ?, ?, 0, 0, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_due = VALUES(total_due),
          amount_paid = VALUES(amount_paid),
          status = VALUES(status)
      `, [
        loanId, String(sc.id), `WQTMN0${sc.id}`, sc.due, sc.principal, (sc.repay - sc.principal),
        sc.repay, amountPaid, isClosed ? 'paid' : (isPartial ? 'partial' : 'pending')
      ]);
    }
    console.log('✅ Customers, Loans, and Repayment Schedules Seeded');

    // -------------------------------------------------------------------------
    // 7. SEED REPAYMENTS (FOR REVENUE ANALYTICS & ACCOUNTANT INTEREST REPORTS)
    // -------------------------------------------------------------------------
    const demoRepayments = [
      {
        loanId: 'LN9116',
        cusId: 'CUS9116',
        amount: 40000,
        ref: 'REP9116-REF-01',
        method: 'UPI',
        date: '2026-10-05 14:00:00'
      },
      {
        loanId: 'LN9117',
        cusId: 'CUS9117',
        amount: 33000,
        ref: 'REP9117-REF-01',
        method: 'NEFT',
        date: '2026-10-08 11:30:00'
      },
      {
        loanId: 'LN9114',
        cusId: 'CUS9114',
        amount: 15000,
        ref: 'REP9114-TODAY-01',
        method: 'IMPS',
        date: new Date().toISOString().slice(0, 19).replace('T', ' ')
      }
    ];

    for (const rep of demoRepayments) {
      await query(`
        INSERT INTO loan_repayments (
          loan_id, customer_id, amount, principal_component, interest_component,
          method, reference, status, received_by, received_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'received', 'test.accountant@waqtmoney.in', ?, ?)
        ON DUPLICATE KEY UPDATE
          amount = VALUES(amount),
          status = 'received'
      `, [
        rep.loanId, rep.cusId, rep.amount, Math.round(rep.amount * 0.8), Math.round(rep.amount * 0.2),
        rep.method, rep.ref, rep.date, rep.date
      ]);
    }
    console.log('✅ Repayments Seeded (Accrued & Received Revenue Available for Analytics)');

    // -------------------------------------------------------------------------
    // 8. SEED COLLECTION CASES & BUCKETS (DPD 0, 1-30, 31-60, 61-90, 90+)
    // -------------------------------------------------------------------------
    const collectionCases = [
      // Due Today / 0 DPD
      { caseId: 'COL9118', loanId: 'LN9118', cusId: 'CUS9118', name: 'Sunil Yadav', phone: '9876543118', due: 49500, dpd: 0, origDue: '2026-10-10', status: 'Active' },
      // Bucket 0-30: Active PTPs
      { caseId: 'COL9119', loanId: 'LN9119', cusId: 'CUS9119', name: 'Tarun Bajaj', phone: '9876543119', due: 60500, dpd: 7, origDue: '2026-10-03', status: 'Active' },
      { caseId: 'COL9120', loanId: 'LN9120', cusId: 'CUS9120', name: 'Ritika Chauhan', phone: '9876543120', due: 38500, dpd: 14, origDue: '2026-09-26', status: 'Active' },
      // Bucket 0-30: Broken PTPs
      { caseId: 'COL9121', loanId: 'LN9121', cusId: 'CUS9121', name: 'Vijay Khurana', phone: '9876543121', due: 77000, dpd: 22, origDue: '2026-09-18', status: 'Active' },
      { caseId: 'COL9122', loanId: 'LN9122', cusId: 'CUS9122', name: 'Meenakshi Iyer', phone: '9876543122', due: 44000, dpd: 29, origDue: '2026-09-11', status: 'Active' },
      // Bucket 31-60
      { caseId: 'COL9123', loanId: 'LN9123', cusId: 'CUS9123', name: 'Alok Trivedi', phone: '9876543123', due: 66000, dpd: 45, origDue: '2026-08-26', status: 'Active' },
      // Bucket 61-90: Dispute / Legal Warning
      { caseId: 'COL9124', loanId: 'LN9124', cusId: 'CUS9124', name: 'Bhavna Patel', phone: '9876543124', due: 93500, dpd: 75, origDue: '2026-07-27', status: 'Active' },
      // Bucket 90+: Severe Default
      { caseId: 'COL9125', loanId: 'LN9125', cusId: 'CUS9125', name: 'Kishore Nair', phone: '9876543125', due: 55000, dpd: 107, origDue: '2026-06-25', status: 'Active' },
    ];

    for (const cc of collectionCases) {
      await query(`
        INSERT INTO collection_cases (
          id, loan_id, customer_id, customer, phone, total_due, days_overdue,
          original_due_date, status, assigned_to
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'test.collection@waqtmoney.in')
        ON DUPLICATE KEY UPDATE
          total_due = VALUES(total_due),
          days_overdue = VALUES(days_overdue),
          original_due_date = VALUES(original_due_date),
          status = VALUES(status),
          assigned_to = 'test.collection@waqtmoney.in'
      `, [
        cc.caseId, cc.loanId, cc.cusId, cc.name, cc.phone, cc.due, cc.dpd, cc.origDue, cc.status
      ]);
    }
    console.log('✅ Collection Cases Seeded Across All DPD Buckets (Assigned to test.collection@waqtmoney.in)');

    // -------------------------------------------------------------------------
    // 9. SEED COLLECTION CALL LOGS, PTPS, & FOLLOWUPS
    // -------------------------------------------------------------------------
    // Call logs
    await query(`
      INSERT INTO collection_call_logs (case_id, loan_id, disposition, sub_disposition, notes, actor, created_at)
      VALUES 
        ('COL9119', 'LN9119', 'Connected', 'PTP Taken', 'Borrower salary delayed. Confirmed promise to pay in 2 days.', 'test.collection@waqtmoney.in', '2026-10-09 11:00:00'),
        ('COL9120', 'LN9120', 'Connected', 'PTP Taken', 'Borrower agreed to pay ₹38,500 via NetBanking link.', 'test.collection@waqtmoney.in', '2026-10-09 14:15:00'),
        ('COL9121', 'LN9121', 'Connected', 'Broken PTP Rework', 'Borrower did not pay on committed date. Warned about penalty charges.', 'test.collection@waqtmoney.in', '2026-10-08 16:00:00'),
        ('COL9123', 'LN9123', 'Call Back Requested', 'Customer Busy', 'Borrower travelling in train. Scheduled callback for today evening.', 'test.collection@waqtmoney.in', '2026-10-09 10:30:00'),
        ('COL9124', 'LN9124', 'Refused To Pay', 'Interest Dispute', 'Borrower disputing late fee calculation. Case escalated to team lead.', 'test.collection@waqtmoney.in', '2026-10-07 12:00:00'),
        ('COL9125', 'LN9125', 'Not Connected', 'Switched Off', 'Borrower phone continuously switched off. Address verification flagged.', 'test.collection@waqtmoney.in', '2026-10-08 17:30:00')
      ON DUPLICATE KEY UPDATE notes = VALUES(notes)
    `);

    // PTPs (Active & Broken)
    await query(`
      INSERT INTO collection_ptps (case_id, loan_id, amount, ptp_date, status, notes, actor, created_at)
      VALUES 
        ('COL9119', 'LN9119', 60500, DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'active', 'Committed to pay ₹60,500 by evening.', 'test.collection@waqtmoney.in', NOW()),
        ('COL9120', 'LN9120', 38500, DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'active', 'Promised ₹38,500 after client payment.', 'test.collection@waqtmoney.in', NOW()),
        ('COL9121', 'LN9121', 77000, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'broken', 'Did not honour payment commitment on 3 days ago.', 'test.collection@waqtmoney.in', NOW()),
        ('COL9122', 'LN9122', 44000, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'broken', 'Failed to transfer on due date.', 'test.collection@waqtmoney.in', NOW())
      ON DUPLICATE KEY UPDATE status = VALUES(status), amount = VALUES(amount)
    `);

    // Followups
    await query(`
      INSERT INTO collection_followups (case_id, loan_id, due_at, reason, status, notes, actor, created_at)
      VALUES 
        ('COL9123', 'LN9123', DATE_ADD(NOW(), INTERVAL 2 HOUR), 'call_back', 'open', 'Callback promised at 4:30 PM.', 'test.collection@waqtmoney.in', NOW()),
        ('COL9119', 'LN9119', DATE_ADD(NOW(), INTERVAL 2 DAY), 'ptp_reminder', 'open', 'Verify PTP payment status.', 'test.collection@waqtmoney.in', NOW())
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `);
    console.log('✅ Collection Call Logs, Active/Broken PTPs, and Followups Seeded');

    console.log(`\n======================================================`);
    console.log(`   DUMMY DATA SEEDING COMPLETE FOR TESTING ENVIRONMENT!`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('❌ Error seeding testing dummy data:', err.message);
  } finally {
    process.exit(0);
  }
}

seedTestingDummyData();
