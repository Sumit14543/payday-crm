const { uploadToGCS, getGCSFile } = require('../config/gcs');
const path = require('path');
const fs = require('fs');

async function testGCSIntegration() {
  console.log('--- Testing GCS Upload & Fetch ---');
  process.env.GCS_PREFIX = 'waqtmoney-documents/test-uploads';

  const sampleFile = path.resolve(__dirname, 'test_sample.txt');
  fs.writeFileSync(sampleFile, 'Test content for GCS upload verification');

  console.log('Uploading sample file to test-uploads folder...');
  const gcsUrl = await uploadToGCS(sampleFile, 'test-documents/test_sample.txt');
  console.log('GCS Upload Result URL:', gcsUrl);

  const fileHandle = getGCSFile('test-documents/test_sample.txt');
  const [exists] = await fileHandle.exists();
  console.log('File Exists in GCS test-uploads:', exists);

  if (fs.existsSync(sampleFile)) fs.unlinkSync(sampleFile);
  console.log('--- Test Finished Successfully ---');
}

testGCSIntegration().catch(console.error);
