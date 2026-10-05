const { connectDatabase, query } = require('../config/db');

async function run() {
  try {
    await connectDatabase();
    console.log('Connected.');

    const descLoans = await query('DESCRIBE loans');
    console.log('Loans columns:', descLoans.map(c => `${c.Field} (${c.Type})`));

    const sampleLoan = await query('SELECT * FROM loans LIMIT 1');
    console.log('Sample loan record:', sampleLoan[0]);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
