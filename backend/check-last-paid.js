const https = require('https');
require('./config/env');
const { createToken } = require('./middleware/auth');

const token = createToken({
  email: 'superadmin@testing.com',
  name: 'Super Admin Test',
  role: 'superadmin'
});

const options = {
  hostname: 'testing-api.waqtmoney.com',
  port: 443,
  path: '/api/superadmin/tenants/stats',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.success) {
        const t = parsed.data.find(x => x.slug === 'waqtfinance');
        if (t) {
          console.log('Waqt Finance Stats Keys:', Object.keys(t.stats));
          console.log('Waqt Finance recentPayments:', t.stats.recentPayments);
          console.log('Waqt Finance recentApplications:', t.stats.recentApplications);
        } else {
          console.log('Waqt Finance tenant not found in response');
        }
      } else {
        console.log('Error:', parsed.message);
      }
    } catch (e) {
      console.log('Failed to parse:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.end();
