const db = require('../config/db');
const referenceModel = require('../models/referenceModel');

async function inspectAnjali() {
  await db.connectDatabase();

  const apps = await referenceModel.all("SELECT id, application_id, full_name, gender, source_payload FROM loan_applications WHERE full_name LIKE '%ANJALI%'");
  console.log('loan_applications:', JSON.stringify(apps, null, 2));

  const aadh = await referenceModel.all("SELECT id, application_id, full_name, gender, raw_response FROM aadhaar_reports WHERE full_name LIKE '%ANJALI%'");
  console.log('aadhaar_reports:', JSON.stringify(aadh, null, 2));

  const leads = await referenceModel.all("SELECT id, name, gender, source FROM leads WHERE name LIKE '%ANJALI%'");
  console.log('leads:', JSON.stringify(leads, null, 2));
}

inspectAnjali()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
