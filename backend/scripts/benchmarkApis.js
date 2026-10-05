const { connectDatabase, query } = require('../config/db');
const crmUserModel = require('../models/crmUserModel');
const leadModel = require('../models/leadModel');
const dashboardModel = require('../models/dashboardModel');

async function runBenchmark() {
  console.log('=== Database & API Model Performance Benchmark ===\n');
  
  await connectDatabase();
  console.log('Database connected successfully.\n');

  // 1. Session verification benchmark (simulating 15 concurrent requests per page load)
  const sessionStartTime = Date.now();
  const sessionProms = [];
  for (let i = 0; i < 15; i++) {
    sessionProms.push(crmUserModel.findActiveByEmailAndRole('telecaller@waqtfinance.com', 'telecaller'));
  }
  await Promise.all(sessionProms);
  const sessionEndTime = Date.now();
  console.log(`[1] 15 Concurrent Session Verification Queries: ${sessionEndTime - sessionStartTime} ms`);

  // 2. Dashboard Stats Benchmark
  const statsStartTime = Date.now();
  await dashboardModel.getStats();
  const statsEndTime = Date.now();
  console.log(`[2] Dashboard getStats(): ${statsEndTime - statsStartTime} ms`);

  // 3. Lead List Benchmark (findAll)
  const leadsStartTime = Date.now();
  await leadModel.findAll({ limit: 50 });
  const leadsEndTime = Date.now();
  console.log(`[3] leadModel.findAll({ limit: 50 }): ${leadsEndTime - leadsStartTime} ms`);

  console.log('\nBenchmark completed successfully.');
  process.exit(0);
}

runBenchmark().catch((err) => {
  console.error('Benchmark Error:', err);
  process.exit(1);
});
