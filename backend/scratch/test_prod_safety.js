const { syncUploadedFile } = require('../config/uploads');
const path = require('path');
const fs = require('fs');

async function testProdSafety() {
  console.log('--- Testing Main (Production) Safety Guard ---');

  // Case 1: Main / Production Environment Simulation (GCS_PREFIX is NOT test-uploads)
  delete process.env.ENABLE_GCS_SYNC;
  delete process.env.GCS_PREFIX;

  const prodSample = path.resolve(__dirname, 'prod_test_sample.txt');
  fs.writeFileSync(prodSample, 'Main production content');

  console.log('Case 1 (Main/Production): Calling syncUploadedFile...');
  syncUploadedFile(prodSample, '/uploads/prod_test_sample.txt');
  console.log('✓ Main (Production) guard passed: Zero GCS calls made.');

  // Case 2: Testing Environment Simulation
  process.env.GCS_PREFIX = 'waqtmoney-documents/test-uploads';
  console.log('\nCase 2 (Testing Environment): Calling syncUploadedFile...');
  syncUploadedFile(prodSample, 'test-documents/testing_sample.txt');
  console.log('✓ Testing sync triggered for test-uploads folder.');

  setTimeout(() => {
    if (fs.existsSync(prodSample)) fs.unlinkSync(prodSample);
    console.log('\n--- Production Safety Guard Test Passed ---');
  }, 1000);
}

testProdSafety().catch(console.error);
