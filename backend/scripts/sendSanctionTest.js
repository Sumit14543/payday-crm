const { connectDatabase } = require('../config/db');
const sanctionLetterService = require('../services/sanctionLetterService');

async function testSendSanction() {
  console.log('Connecting to database...');
  await connectDatabase();

  const targetEmail = process.argv[2] || 'sumitlodhi9401@gmail.com';
  console.log(`Sending live Sanction Letter PDF & Email to: ${targetEmail}...`);

  const mockSanction = {
    id: 99999,
    agreementNumber: 'WQT/SAN/2026/0921-TEST',
    borrower: 'Sumit Lodhi',
    emailTo: targetEmail,
    borrowerPhone: '9401000000',
    agreementDate: new Date(),
    principalAmount: 25000,
    interestRate: 0.1,
    processingFee: 1500,
    gstAmount: 270,
    disbursedAmount: 23230,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    repaymentAmount: 26750,
    sourceSystem: 'waqtfinance',
    decisionToken: 'test-decision-token-12345',
  };

  try {
    console.log('Generating Sanction PDF...');
    const pdf = await sanctionLetterService.generateSanctionPdf(mockSanction);
    console.log('PDF Generated at:', pdf.absolutePath);

    console.log('Sending Sanction Email via sanctionLetterService...');
    const result = await sanctionLetterService.emailSanctionLetter(mockSanction, pdf.absolutePath);
    console.log('🎉 SUCCESS! SANCTION EMAIL DELIVERED.');
    console.log('Message ID:', result.messageId);
  } catch (error) {
    console.error('❌ SANCTION EMAIL FAILED:', error);
  }
  process.exit(0);
}

testSendSanction();
