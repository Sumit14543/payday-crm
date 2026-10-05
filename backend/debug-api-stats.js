const superadminController = require('./controllers/superadminController');
require('./config/env');

const req = {
  params: {},
  query: {},
  body: {}
};

const res = {
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    this.data = data;
    return this;
  }
};

async function run() {
  try {
    await superadminController.getTenantStats(req, res);
    const data = res.data;
    console.log('API Response Success:', data.success);
    if (data.success) {
      data.data.forEach((tenant) => {
        console.log(`\nTenant: ${tenant.name} (${tenant.slug})`);
        console.log('Stats:', tenant.stats);
      });
    } else {
      console.log('Error:', data);
    }
  } catch (err) {
    console.error('Run failed:', err);
  }
  process.exit(0);
}

run();
