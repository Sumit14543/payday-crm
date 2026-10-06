const { createToken } = require('../middleware/auth');

const payload = {
  email: 'shrutisingh@waqtmoney.in',
  name: 'Shruti Singh',
  role: 'credit-manager'
};

const token = createToken(payload);
console.log('Generated token:', token);

const url = 'https://testing-api.waqtmoney.com/api/loans';

fetch(url, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(res => {
  console.log('Status code:', res.status);
  return res.json();
})
.then(data => {
  console.log('Is array:', Array.isArray(data));
  if (data && data.success) {
    const list = data.data;
    console.log('Total loans in response:', list.length);
    console.log('Sample loan record keys:', Object.keys(list[0] || {}));
    console.log('Sample loan record details:', list[0]);
    
    const countNonNullFee = list.filter(d => d.processingFee !== undefined && d.processingFee !== null).length;
    console.log('Loans with processingFee property in JSON:', countNonNullFee);
  } else {
    console.log('Response body:', data);
  }
})
.catch(err => {
  console.error('Error fetching testing API:', err);
});
