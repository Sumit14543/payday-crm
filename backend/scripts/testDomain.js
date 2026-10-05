const { verifyOfficialEmailDomain } = require('../services/officialEmailCheckerService');

async function test() {
  console.log('Testing domain checker for sumit.it@waqtfinance.com...');
  const res = await verifyOfficialEmailDomain('sumit.it@waqtfinance.com');
  console.log('Result:', JSON.stringify(res, null, 2));
}

test();
