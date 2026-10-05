const assert = require('assert');
const { config } = require('../config/env');
const { normalizeApiResponse, requestCibilReport } = require('../services/cibilService');

async function checkCompletedReport() {
  const result = await normalizeApiResponse({
    data: {
      score: 739,
      result: {
        reportUrl: 'https://example.com/cibil.pdf',
      },
      refId: 'AL-completed',
    },
    error: false,
    requestId: 123,
  });

  assert.strictEqual(result.providerStatus, 'completed');
  assert.strictEqual(result.score, 739);
  assert.strictEqual(result.pdfUrl, 'https://example.com/cibil.pdf');
  assert.strictEqual(result.refId, 'AL-completed');
  assert.strictEqual(result.providerMessage, '');
}

async function checkNoRecordFound() {
  const result = await normalizeApiResponse({
    data: {
      currentCredit: 8315,
      creditUsed: 4,
      errorMessage: 'No Record Found',
      errorType: 'API_ERROR',
      refId: 'AL-no-record',
    },
    error: false,
    requestId: 456,
  });

  assert.strictEqual(result.providerStatus, 'failed');
  assert.strictEqual(result.score, null);
  assert.strictEqual(result.pdfUrl, '');
  assert.strictEqual(result.refId, 'AL-no-record');
  assert.strictEqual(result.providerMessage, 'No Record Found');
  assert.strictEqual(result.providerErrorType, 'API_ERROR');
}

async function checkPendingReport() {
  const result = await normalizeApiResponse({
    data: {
      refId: 'AL-pending',
    },
    status: 'processing',
    error: false,
    requestId: 789,
  });

  assert.strictEqual(result.providerStatus, 'pending');
  assert.strictEqual(result.pdfUrl, '');
  assert.strictEqual(result.refId, 'AL-pending');
  assert.strictEqual(result.providerMessage, '');
}

async function checkAlternateReportUrlField() {
  const result = await normalizeApiResponse({
    data: {
      signedUrl: 'https://example.com/signed-cibil.pdf',
      refId: 'AL-signed',
    },
    error: false,
  });

  assert.strictEqual(result.providerStatus, 'completed');
  assert.strictEqual(result.pdfUrl, 'https://example.com/signed-cibil.pdf');
  assert.strictEqual(result.refId, 'AL-signed');
}

async function checkDigitapCrifScoreAndPdfGeneration() {
  const samplePayload = {
    http_response_code: 200,
    client_ref_num: 'cibil_test_123',
    request_id: 'req_test_123',
    result_code: 101,
    message: 'success',
    result: {
      result_json: {
        parsed_data: {
          'B2C-REPORT': {
            'REPORT-DATA': {
              'STANDARD-DATA': {
                SCORE: [
                  {
                    NAME: 'PERFORM CONSUMER 2.2',
                    VALUE: '11',
                    DESCRIPTION: 'Not Scored: More than 50 active Accounts found',
                    FACTORS: []
                  }
                ],
                'PRIMARY-ACCOUNTS-SUMMARY': {
                  'ACTIVE-ACCOUNTS': '52',
                  'DISBURSED-AMOUNT': '5,00,000',
                  'CURRENT-BALANCE-AMOUNT': '2,50,000',
                  'OVERDUE-ACCOUNTS': '0',
                  'OVERDUE-AMOUNT': '0'
                }
              },
              RESPONSES: [
                {
                  'CREDIT-GRANTOR': 'AXIS BANK',
                  'ACCT-TYPE': 'Credit Card',
                  'ACCOUNT-STATUS': 'Active',
                  'DISBURSED-AMT': '93,344',
                  'CURRENT-BAL': '80,211',
                  'OVERDUE-AMT': '0',
                  'DISBURSED-DT': '20-12-2022'
                }
              ]
            }
          }
        }
      }
    }
  };

  const result = await normalizeApiResponse(samplePayload, {
    name: 'Test Borrower',
    phone: '9876543210',
    panNumber: 'ABCDE1234F',
    id: 'test-123'
  });

  assert.strictEqual(result.providerStatus, 'completed');
  assert.strictEqual(result.score, 11);
  assert.strictEqual(result.scoreDescription, 'Not Scored: More than 50 active Accounts found');
  assert.strictEqual(result.providerMessage, '');
  assert.strictEqual(typeof result.pdfUrl, 'string');
  assert.strictEqual(result.pdfUrl.startsWith('/uploads/cibil/'), true);
}

async function checkRequestBodyNormalization() {
  const previousFetch = global.fetch;
  const previousConfig = {
    apiUrl: config.bifrost.apiUrl,
    apiToken: config.bifrost.apiToken,
    authScheme: config.bifrost.authScheme,
    callbackUrl: config.bifrost.callbackUrl,
  };

  let capturedRequestBody = null;
  config.bifrost.apiUrl = 'https://provider.example.test/cibil';
  config.bifrost.apiToken = 'test-token';
  config.bifrost.authScheme = '';
  config.bifrost.callbackUrl = 'https://crm.example.test/api/score-callback';
  global.fetch = async (_url, options) => {
    capturedRequestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: {
          refId: 'AL-body',
          result: {
            reportUrl: 'https://example.com/cibil.pdf',
          },
        },
        error: false,
      }),
    };
  };

  const previousProvider = config.cibilProvider;
  config.cibilProvider = 'bifrost';

  try {
    await requestCibilReport({
      phone: '+91 91213 15709',
      panNumber: ' awapc5571g ',
      name: '  BHAVANI   DUTTA VENKATESHWAR   CHELAMKURI  ',
    });
  } finally {
    global.fetch = previousFetch;
    Object.assign(config.bifrost, previousConfig);
    config.cibilProvider = previousProvider;
  }

  assert.strictEqual(capturedRequestBody.Mobile_Number, '9121315709');
  assert.strictEqual(capturedRequestBody.PAN_Number, 'AWAPC5571G');
  assert.strictEqual(capturedRequestBody.Full_Name, 'BHAVANI DUTTA VENKATESHWAR CHELAMKURI');
  assert.strictEqual(capturedRequestBody.Concent, 'Y');
  assert.strictEqual(capturedRequestBody.Concent_Text.includes('valid end-user consent'), true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(capturedRequestBody, 'Consent'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(capturedRequestBody, 'Consent_Text'), false);
}

async function checkDigitapRequestBodyNormalization() {
  const previousFetch = global.fetch;
  const previousProvider = config.cibilProvider;
  config.cibilProvider = 'digitap';

  let capturedRequestBody = null;
  global.fetch = async (_url, options) => {
    capturedRequestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        http_response_code: 200,
        result_code: 101,
        result: {
          result_pdf: 'https://example.com/cibil.pdf',
          scores: { score_value: 750 }
        }
      }),
    };
  };

  try {
    await requestCibilReport({
      phone: '+91 91213 15709',
      panNumber: ' awapc5571g ',
      name: '  BHAVANI   DUTTA VENKATESHWAR   CHELAMKURI  ',
    });
  } finally {
    global.fetch = previousFetch;
    config.cibilProvider = previousProvider;
  }

  assert.strictEqual(capturedRequestBody.mobile_no, '9121315709');
  assert.strictEqual(capturedRequestBody.pan, 'AWAPC5571G');
  assert.strictEqual(capturedRequestBody.first_name, 'BHAVANI');
  assert.strictEqual(capturedRequestBody.last_name, 'DUTTA VENKATESHWAR CHELAMKURI');
  assert.strictEqual(capturedRequestBody.report_type, '1');
  assert.strictEqual(capturedRequestBody.prefill_lookup, '0');
  assert.strictEqual(capturedRequestBody.pincode, '302001');
  assert.strictEqual(capturedRequestBody.gender, 'Male');
  assert.strictEqual(capturedRequestBody.date_of_birth, '01-01-1990');
}

async function runAllChecks() {
  await checkCompletedReport();
  await checkNoRecordFound();
  await checkPendingReport();
  await checkAlternateReportUrlField();
  await checkDigitapCrifScoreAndPdfGeneration();
  await checkRequestBodyNormalization();
  await checkDigitapRequestBodyNormalization();
  console.log('All CIBIL normalization checks passed.');
}

runAllChecks().catch((error) => {
  console.error(error);
  process.exit(1);
});
