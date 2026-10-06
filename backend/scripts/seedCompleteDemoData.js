const { connectDatabase, query } = require('../config/db');

async function seedCompleteDemoData() {
  try {
    await connectDatabase();
    console.log(`\n======================================================`);
    console.log(`       SEEDING COMPLETE DEMO DATA ACROSS ALL PANELS    `);
    console.log(`======================================================\n`);

    // 1. Seed Telecaller & Credit Applications (loan_applications)
    const demoLeads = [
      {
        id: 9001,
        application_id: 'WQTMN09001',
        full_name: 'Rahul Sharma',
        mobile: '9876543210',
        email: 'rahul.sharma@example.com',
        loan_amount: 50000,
        status: 'submitted',
        priority: 'High',
        assigned_to: 'test.telecaller@waqtmoney.in',
        source_system: 'waqtmoney',
        employment_status: 'Salaried',
        monthly_income: 45000,
        city: 'Jaipur',
        pan_number: 'ABCDE1234F',
        created_at: '2026-09-14 10:30:00'
      },
      {
        id: 9002,
        application_id: 'WQTMN09002',
        full_name: 'Priya Verma',
        mobile: '9876543211',
        email: 'priya.verma@example.com',
        loan_amount: 75000,
        status: 'review',
        priority: 'Urgent',
        assigned_to: 'test.telecaller@waqtmoney.in',
        source_system: 'waqtmoney',
        employment_status: 'Salaried',
        monthly_income: 60000,
        city: 'Delhi',
        pan_number: 'BCDEF2345G',
        created_at: '2026-09-14 11:15:00'
      },
      {
        id: 9003,
        application_id: 'WQTMN09003',
        full_name: 'Amit Patel',
        mobile: '9876543212',
        email: 'amit.patel@example.com',
        loan_amount: 30000,
        status: 'documents_pending',
        priority: 'Medium',
        assigned_to: 'test.telecaller@waqtmoney.in',
        source_system: 'waqtmoney',
        employment_status: 'Salaried',
        monthly_income: 35000,
        city: 'Ahmedabad',
        pan_number: 'CDEFG3456H',
        created_at: '2026-09-14 12:00:00'
      },
      {
        id: 9004,
        application_id: 'WQTMN09004',
        full_name: 'Suresh Kumar',
        mobile: '9876543213',
        email: 'suresh.kumar@example.com',
        loan_amount: 100000,
        status: 'send_to_credit',
        priority: 'Urgent',
        assigned_to: 'Credit Manager',
        source_system: 'waqtmoney',
        employment_status: 'Salaried',
        monthly_income: 85000,
        city: 'Mumbai',
        pan_number: 'DEFGH4567I',
        created_at: '2026-09-14 13:45:00'
      },
      {
        id: 9005,
        application_id: 'WQTMN09005',
        full_name: 'Neha Singh',
        mobile: '9876543214',
        email: 'neha.singh@example.com',
        loan_amount: 40000,
        status: 'approved',
        priority: 'High',
        assigned_to: 'shrutisingh@waqtmoney.in',
        source_system: 'waqtmoney',
        employment_status: 'Salaried',
        monthly_income: 50000,
        city: 'Bangalore',
        pan_number: 'EFGHI5678J',
        created_at: '2026-09-14 14:20:00'
      },
      {
        id: 9006,
        application_id: 'WQTMN09006',
        full_name: 'Vikas Gupta',
        mobile: '9876543215',
        email: 'vikas.gupta@example.com',
        loan_amount: 60000,
        status: 'disbursed',
        priority: 'High',
        assigned_to: 'test.telecaller@waqtmoney.in',
        source_system: 'waqtmoney',
        employment_status: 'Salaried',
        monthly_income: 55000,
        city: 'Pune',
        pan_number: 'FGHIJ6789K',
        created_at: '2026-09-10 09:00:00'
      },
      {
        id: 9007,
        application_id: 'WQTMN09007',
        full_name: 'Pooja Reddy',
        mobile: '9876543216',
        email: 'pooja.reddy@example.com',
        loan_amount: 80000,
        status: 'disbursed',
        priority: 'Urgent',
        assigned_to: 'test.telecaller@waqtmoney.in',
        source_system: 'waqtmoney',
        employment_status: 'Salaried',
        monthly_income: 70000,
        city: 'Hyderabad',
        pan_number: 'GHIJK7890L',
        created_at: '2026-08-15 10:00:00'
      }
    ];

    for (const lead of demoLeads) {
      await query(`
        INSERT INTO loan_applications (
          id, application_id, full_name, mobile, email, loan_amount, status, priority,
          assigned_to, source_system, employment_status, monthly_income, city, pan_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          status = VALUES(status),
          priority = VALUES(priority),
          assigned_to = VALUES(assigned_to),
          loan_amount = VALUES(loan_amount)
      `, [
        lead.id, lead.application_id, lead.full_name, lead.mobile, lead.email, lead.loan_amount,
        lead.status, lead.priority, lead.assigned_to, lead.source_system, lead.employment_status,
        lead.monthly_income, lead.city, lead.pan_number, lead.created_at
      ]);
    }
    console.log('✅ Demo Lead Applications Seeded (7 Applications Across All Stages)');

    // 2. Call Logs
    await query(`
      INSERT INTO lead_call_logs (lead_id, application_id, disposition, sub_disposition, notes, call_duration_seconds, actor, created_at)
      VALUES 
        ('9001', 'WQTMN09001', 'Connected', 'Interested in loan', 'Customer confirmed income details and agreed to upload bank statement.', 145, 'test.telecaller@waqtmoney.in', '2026-09-14 10:45:00'),
        ('9002', 'WQTMN09002', 'Connected', 'Documents Uploaded', 'Customer uploaded PAN and salary slip. Sent to Credit Review.', 210, 'test.telecaller@waqtmoney.in', '2026-09-14 11:30:00'),
        ('9003', 'WQTMN09003', 'Callback requested', 'Customer Busy', 'Requested callback in afternoon.', 45, 'test.telecaller@waqtmoney.in', '2026-09-14 12:15:00')
      ON DUPLICATE KEY UPDATE notes = VALUES(notes)
    `);
    console.log('✅ Telecaller Call Logs Seeded');

    // 3. Document Checks
    const docKeys = ['pan', 'aadhaar', 'selfie', 'salary_slip_current', 'bank_details', 'cibil'];
    for (const app of ['WQTMN09002', 'WQTMN09004', 'WQTMN09005', 'WQTMN09006', 'WQTMN09007']) {
      for (const key of docKeys) {
        await query(`
          INSERT INTO lead_document_checks (lead_id, application_id, document_key, label, status, verified_by, verified_at)
          VALUES (?, ?, ?, ?, 'verified', 'test.telecaller@waqtmoney.in', CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE status = 'verified'
        `, ['9002', app, key, key.toUpperCase().replace(/_/g, ' ')]);
      }
    }
    console.log('✅ Verified Document Checks Seeded');

    // 4. Credit Handoff Queue & Approvals
    await query(`
      INSERT INTO lead_credit_handoffs (lead_id, application_id, status, notes, submitted_by, submitted_at, reviewed_by, decision)
      VALUES 
        ('9004', 'WQTMN09004', 'ready', 'Documents 100% verified. Income ₹85k. Recommended for ₹1,00,000 sanction.', 'test.telecaller@waqtmoney.in', '2026-09-14 13:50:00', NULL, NULL),
        ('9005', 'WQTMN09005', 'approved', 'FOIR 40%, CIBIL 760. Approved ₹40,000.', 'test.telecaller@waqtmoney.in', '2026-09-14 14:25:00', 'shrutisingh@waqtmoney.in', 'approved'),
        ('9006', 'WQTMN09006', 'approved', 'Approved ₹60,000 for 30 days.', 'test.telecaller@waqtmoney.in', '2026-09-10 09:30:00', 'shrutisingh@waqtmoney.in', 'approved'),
        ('9007', 'WQTMN09007', 'approved', 'Approved ₹80,000 for 30 days.', 'test.telecaller@waqtmoney.in', '2026-08-15 10:30:00', 'shrutisingh@waqtmoney.in', 'approved')
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `);
    console.log('✅ Credit Manager Queue & Handoffs Seeded');

    // 5. Sanction Letters & Loan Agreements (eSign)
    await query(`
      INSERT INTO lead_sanctions (lead_id, application_id, agreement_number, borrower, borrower_phone, borrower_email, principal_amount, processing_fee, gst_amount, disbursed_amount, repayment_amount, tenure_days, interest_rate, due_date, bank_name, account_number, ifsc_code, status, sent_at)
      VALUES 
        ('9005', 'WQTMN09005', 'SAN-WQTMN-9005', 'Neha Singh', '9876543214', 'neha.singh@example.com', 40000, 1600, 288, 38112, 44000, 30, 10, '2026-10-14', 'HDFC Bank', '50100234567890', 'HDFC0001234', 'sent', '2026-09-14 14:30:00'),
        ('9006', 'WQTMN09006', 'SAN-WQTMN-9006', 'Vikas Gupta', '9876543215', 'vikas.gupta@example.com', 60000, 2400, 432, 57168, 66000, 30, 10, '2026-10-10', 'ICICI Bank', '000701234567', 'ICIC0000007', 'sent', '2026-09-10 10:00:00'),
        ('9007', 'WQTMN09007', 'SAN-WQTMN-9007', 'Pooja Reddy', '9876543216', 'pooja.reddy@example.com', 80000, 3200, 576, 76224, 88000, 30, 10, '2026-09-14', 'SBI Bank', '31234567890', 'SBIN0001500', 'sent', '2026-08-15 11:00:00')
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `);

    await query(`
      INSERT INTO lead_loan_agreements (lead_id, application_id, agreement_number, status, sent_at, signed_at)
      VALUES 
        ('9005', 'WQTMN09005', 'SAN-WQTMN-9005', 'signed', '2026-09-14 14:35:00', '2026-09-14 14:40:00'),
        ('9006', 'WQTMN09006', 'SAN-WQTMN-9006', 'signed', '2026-09-10 10:05:00', '2026-09-10 10:15:00'),
        ('9007', 'WQTMN09007', 'SAN-WQTMN-9007', 'signed', '2026-08-15 11:05:00', '2026-08-15 11:20:00')
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `);

    await query(`
      INSERT INTO lead_status_events (lead_id, application_id, stage_key, occurred_at, actor)
      VALUES 
        ('9005', 'WQTMN09005', 'accounting_handoff', '2026-09-14 14:45:00', 'shrutisingh@waqtmoney.in'),
        ('9006', 'WQTMN09006', 'accounting_handoff', '2026-09-10 10:20:00', 'shrutisingh@waqtmoney.in'),
        ('9007', 'WQTMN09007', 'accounting_handoff', '2026-08-15 11:25:00', 'shrutisingh@waqtmoney.in')
      ON DUPLICATE KEY UPDATE stage_key = VALUES(stage_key)
    `);
    console.log('✅ Sanction Letters, eSign Agreements, & Accounting Queue Seeded');

    // 6. Accounting Payments / Disbursals
    await query(`
      INSERT INTO lead_accounting_payments (lead_id, application_id, loan_id, amount, method, reference, transfer_type, transaction_id, notes, status, paid_by, disbursed_at, account_number, bank_name, ifsc_code)
      VALUES 
        ('9006', 'WQTMN09006', 'LN9006', 57168, 'IMPS', 'UTR900612345', 'IMPS', 'UTR900612345', 'Disbursed to Vikas Gupta via ICICI IMPS', 'paid', 'test.accountant@waqtmoney.in', '2026-09-10 11:00:00', '000701234567', 'ICICI Bank', 'ICIC0000007'),
        ('9007', 'WQTMN09007', 'LN9007', 76224, 'NEFT', 'UTR900756789', 'NEFT', 'UTR900756789', 'Disbursed to Pooja Reddy via SBI NEFT', 'paid', 'test.accountant@waqtmoney.in', '2026-08-15 12:00:00', '31234567890', 'SBI Bank', 'SBIN0001500')
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `);
    console.log('✅ Accountant Disbursal Payments Seeded');

    // 7. Collection Panel Active Cases & Repayment Schedule
    await query(`
      INSERT INTO customers (id, name, email, phone, address, credit_score, total_loans, active_loans, total_borrowed, total_repaid, join_date, risk_level)
      VALUES 
        ('CUS9006', 'Vikas Gupta', 'vikas.gupta@example.com', '9876543215', 'Pune, Maharashtra', 720, 1, 1, 60000, 0, '2026-09-10', 'Low'),
        ('CUS9007', 'Pooja Reddy', 'pooja.reddy@example.com', '9876543216', 'Hyderabad, Telangana', 680, 1, 1, 80000, 0, '2026-08-15', 'High')
      ON DUPLICATE KEY UPDATE active_loans = 1
    `);

    await query(`
      INSERT INTO loans (id, customer_id, principal, interest_rate, total_amount, amount_paid, balance, start_date, due_date, status, payment_status, next_payment_date, next_payment_amount)
      VALUES 
        ('LN9006', 'CUS9006', 60000, 10, 66000, 0, 66000, '2026-09-10', '2026-10-10', 'Active', 'Pending', '2026-10-10', 66000),
        ('LN9007', 'CUS9007', 80000, 10, 88000, 0, 88000, '2026-08-15', '2026-09-14', 'Active', 'Pending', '2026-09-14', 88000)
      ON DUPLICATE KEY UPDATE balance = VALUES(balance), due_date = VALUES(due_date)
    `);

    await query(`
      INSERT INTO collection_cases (id, loan_id, customer_id, customer, phone, total_due, days_overdue, original_due_date, status, assigned_to)
      VALUES 
        ('COL9006', 'LN9006', 'CUS9006', 'Vikas Gupta', '9876543215', 66000, 0, '2026-10-10', 'Active', 'test.collection@waqtmoney.in'),
        ('COL9007', 'LN9007', 'CUS9007', 'Pooja Reddy', '9876543216', 88000, 1, '2026-09-14', 'Active', 'test.collection@waqtmoney.in')
      ON DUPLICATE KEY UPDATE status = VALUES(status), days_overdue = VALUES(days_overdue)
    `);
    console.log('✅ Collection Cases & Active Overdue Loans Seeded');

    console.log(`\n======================================================`);
    console.log(`     ALL CRM PANELS DEMO DATA SUCCESSFULLY SEEDED!     `);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('❌ Error seeding complete demo data:', err.message);
  } finally {
    process.exit(0);
  }
}

seedCompleteDemoData();
