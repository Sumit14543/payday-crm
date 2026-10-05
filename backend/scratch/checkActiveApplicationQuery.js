const assert = require('assert');

// Stub query before loading leadModel
const db = require('../config/db');

let lastQuery = null;
let lastParams = null;

db.query = async (sql, params) => {
  lastQuery = sql;
  lastParams = params;
  return []; // return empty rows for testing SQL structure
};

const leadModel = require('../models/leadModel');

async function testFindActiveApplicationQuery() {
  console.log('Running testFindActiveApplicationQuery...');

  const payload = {
    phone: '9876543210',
    email: 'test@example.com'
  };

  await leadModel.findActiveApplication(payload);

  assert.ok(lastQuery, 'Query should have been captured');
  console.log('Captured SQL Query:\n', lastQuery);
  console.log('Captured Params:', lastParams);

  // Assert target conditions in SQL
  assert.ok(
    lastQuery.includes("LOWER(status) NOT IN ('rejected', 'closed', 'cancelled', 'deleted', 'trash')"),
    'Should filter status in query'
  );
  assert.ok(
    lastQuery.includes("LOWER(COALESCE(source_status, '')) NOT IN ('rejected', 'closed', 'cancelled', 'deleted', 'trash')"),
    'Should filter source_status in query'
  );

  console.log('Test passed successfully!');
}

testFindActiveApplicationQuery().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
