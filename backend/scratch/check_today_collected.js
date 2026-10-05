require('../config/env');
const { connectDatabase } = require('../config/db');
const referenceModel = require('../models/referenceModel');

(async () => {
  try {
    await connectDatabase();
    console.log('Connected to DB!');

    const todayRepayments = await referenceModel.all(`
      SELECT r.id, r.loan_id, r.amount, r.received_at, r.created_at, r.status, r.payment_mode,
             l.customer_id, la.full_name
      FROM loan_repayments r
      LEFT JOIN loans l ON l.id = r.loan_id
      LEFT JOIN loan_applications la ON la.application_id = l.customer_id OR la.source_lead_id = l.customer_id
      WHERE (
        DATE(COALESCE(r.received_at, r.created_at)) = CURDATE()
        OR DATE(DATE_ADD(COALESCE(r.received_at, r.created_at), INTERVAL 330 MINUTE)) = DATE(DATE_ADD(NOW(), INTERVAL 330 MINUTE))
        OR DATE(COALESCE(r.received_at, r.created_at)) = DATE(DATE_ADD(NOW(), INTERVAL 330 MINUTE))
        OR DATE(DATE_ADD(COALESCE(r.received_at, r.created_at), INTERVAL 330 MINUTE)) = CURDATE()
      )
    `);
    console.log('--- Today Repayments ---');
    console.log(JSON.stringify(todayRepayments, null, 2));

    const validRepayments = todayRepayments.filter(r => 
      !r.status || r.status.trim() === '' || ['received', 'success', 'paid', 'settled', 'completed', 'approved'].includes(r.status.trim().toLowerCase())
    );

    const sum = validRepayments.reduce((acc, item) => acc + Number(item.amount || 0), 0);
    console.log(`\nValid Today Payments Count: ${validRepayments.length}`);
    console.log(`Total Collected Today: ₹${sum}`);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
