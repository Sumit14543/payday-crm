# Payday Loan CRM Backend

Express + MySQL API for the CRM portal.

## Structure

- `config/` - environment and MySQL connection
- `controllers/` - request handlers
- `routes/` - endpoint definitions
- `models/` - SQL/data access
- `middleware/` - CORS, logging, 404, error handling
- `database/` - schema migration and seed data
- `utils/` - shared response, validation, and formatting helpers

## Setup

1. Create a MySQL user/database or use an existing local MySQL account.
2. For local development, update `.env.development` if your local MySQL user/password is different.
3. For production, configure platform environment variables or `.env.production` from `.env.production.example`.
4. Run:

```bash
npm run setup
npm run dev
```

`npm run setup` and `npm run dev` use `NODE_ENV=development`, so they load `.env.development`. `npm start` uses the environment provided by production hosting; when `NODE_ENV=production`, local `.env.production` is used if present. `npm run setup` creates the database if needed, migrates tables, and inserts seed data.

## Environment Files

- Local backend: `backend/.env.development`
- Production backend: hosting env vars or `backend/.env.production`
- Local frontend: `frontend/.env` or `frontend/.env.development`
- Production frontend build: `frontend/.env.production`

Local frontend should keep `VITE_API_URL=/api`; Vite proxies `/api` and `/uploads` to `VITE_DEV_API_PROXY_TARGET`, usually `http://localhost:8080`.

## Core Endpoints

- `GET /api/health`
- `GET /api/dashboard/stats`
- `GET /api/leads`
- `GET /api/leads/:id`
- `GET /api/leads/:id/cibil-report`
- `POST /api/leads/:id/cibil-report`
- `POST /api/score-callback`
- `POST /api/leads`
- `PATCH /api/leads/:id`
- `GET /api/customers`
- `GET /api/customers/:id`
- `POST /api/customers`
- `GET /api/loans`
- `GET /api/loans/:id`
- `POST /api/loans`
- `GET /api/collections`
- `GET /api/team`
- `GET /api/commission`
- `GET /api/income`
- `GET /api/invoices`
- `POST /api/integrations/leads`
- `GET /api/integrations/leads/status`

## Database Backup and Restore

Before changing production database structure, create both backups:

```bash
# Built-in backup command, writes to backend/backups/
npm run backup:db

# Alternative when mysqldump is available
mysqldump --single-transaction --routines --triggers --events -h DB_HOST -P DB_PORT -u DB_USER -p DB_NAME > backups/DB_NAME-full.sql
mysqldump --no-data --routines --triggers --events -h DB_HOST -P DB_PORT -u DB_USER -p DB_NAME > backups/DB_NAME-schema.sql
```

Restore into a new CRM database with:

```bash
mysql -h DB_HOST -P DB_PORT -u DB_USER -p NEW_CRM_DB_NAME < backups/DB_NAME-full.sql
```

`npm run setup` also creates the CRM tables from `database/schema.js` when pointed at an empty database. Keep source product databases separate from the CRM database.

## Source Lead Ingestion

Source websites should save leads in their own database first, then call:

```http
POST /api/integrations/leads
x-integration-api-key: <source integration key>
Content-Type: application/json
```

Minimum payload:

```json
{
  "sourceSystem": "waqtfinance",
  "sourceLeadId": "12345",
  "sourceApplicationId": "WF-12345",
  "sourceStatus": "submitted",
  "name": "Applicant Name",
  "phone": "9999999999",
  "loanAmount": 25000
}
```

Supported `sourceSystem` values are `waqtfinance` and `waqtmoney`. Send the source-side status in `sourceStatus` when available, for example `submitted`, `pending_kyc`, `documents_uploaded`, or `rejected_by_source`. Re-sending the same `sourceSystem` + `sourceLeadId` updates the CRM lead snapshot instead of creating a duplicate. CRM status, assignment, credit, sanction, eSign, and accounting workflow remain CRM-only and are not written back to source databases.

To show CRM loan status on a source website, call this from the source website backend:

```http
GET /api/integrations/leads/status?sourceSystem=waqtmoney&sourceLeadId=12345
x-integration-api-key: <source integration key>
```

You can use `sourceApplicationId` instead of `sourceLeadId` if that is the stable ID available on the source website:

```http
GET /api/integrations/leads/status?sourceSystem=waqtmoney&sourceApplicationId=WM-12345
x-integration-api-key: <source integration key>
```

If the source website only has the customer's mobile number, it can poll by mobile too. CRM normalizes the last 10 digits, so `9761811212`, `+91 9761811212`, and `91-9761811212` match the same lead:

```http
GET /api/integrations/leads/status?sourceSystem=waqtmoney&mobile=9761811212
x-integration-api-key: <source integration key>
```

The response contains the current CRM status and customer-visible timeline:

```json
{
  "success": true,
  "data": {
    "applicationId": "WAQTFN-PD-1779182355",
    "sourceSystem": "waqtmoney",
    "sourceLeadId": "12345",
    "sourceStatus": "documents_uploaded",
    "crmStatus": "New",
    "pan_number": "ABCDE1234F",
    "tenure_days": 30,
    "interest_rate": 1.00,
    "interest_accrued": 750,
    "statusCode": "application_received",
    "publicStatus": "Application received",
    "progressPercent": 5,
    "nextExpectedAction": "Tele-verification pending",
    "isTerminalStatus": false,
    "timeline": []
  }
}
```

For realtime sync, configure optional status webhooks in CRM:

```env
INTEGRATION_STATUS_WEBHOOK_URLS=waqtmoney:https://waqtmoney.com/api/crm-webhooks/lead-status
INTEGRATION_STATUS_WEBHOOK_SECRETS=waqtmoney:replace-with-webhook-hmac-secret
```

CRM will POST customer-visible lifecycle events to the source website:

```http
POST /api/crm-webhooks/lead-status
x-crm-webhook-event: lead.status.updated
x-crm-webhook-signature: sha256=<hmac>
x-crm-webhook-timestamp: 2026-05-23T10:30:00.000Z
```

Webhook body:

```json
{
  "event": "lead.status.updated",
  "eventId": "credit-decision:49:approved",
  "applicationId": "WAQTFN-PD-1779460642302",
  "crmLeadId": "492",
  "sourceSystem": "waqtmoney",
  "sourceLeadId": "WAQTMN-PD-946064055186",
  "sourceApplicationId": "WAQTMN-PD-946064055186",
  "statusCode": "approved",
  "publicStatus": "Loan approved",
  "title": "Loan approved",
  "description": "Your loan has been approved and is moving to agreement/disbursement.",
  "progressPercent": 60,
  "nextExpectedAction": "Agreement eSign pending",
  "isTerminalStatus": false,
  "occurredAt": "2026-05-23T10:30:00.000Z"
}
```

To post a successful repayment from a source website after gateway confirmation:

```http
POST /api/integrations/repayments
x-integration-api-key: <source integration key>
Content-Type: application/json
```

Payload:

```json
{
  "sourceSystem": "waqtmoney",
  "sourceLeadId": "WAQTMN-PD-946064055186",
  "sourceApplicationId": "WAQTMN-PD-946064055186",
  "loanId": "LNWQTMN00132",
  "amount": 4219,
  "method": "UPI",
  "reference": "PAY_123456789",
  "gateway": "razorpay",
  "paidAt": "2026-05-23T12:30:00.000Z",
  "status": "success"
}
```

`reference` must be unique. Re-sending the same reference is idempotent and returns the already recorded repayment.

Repayment responses and lead status tracking include a repayment summary:

```json
{
  "sanction": {
    "agreementNumber": "WQTMN00492",
    "principalAmount": 3245,
    "disbursedAmount": 3168,
    "repaymentAmount": 4219,
    "dueDate": "2026-06-21",
    "pdfAvailable": true,
    "pdfUrl": "https://payday-api.waqtmoney.com/api/integrations/leads/sanction-pdf?sourceSystem=waqtmoney&sourceLeadId=WAQTMN-PD-946064055186"
  },
  "disbursement": {
    "status": "paid",
    "loanId": "LNWQTMN00132",
    "disbursedAmount": 3168,
    "disbursedAt": "2026-05-23T12:00:00.000Z",
    "transactionId": "UTR123456",
    "transferType": "IMPS"
  },
  "repayment": {
    "loanId": "LNWQTMN00132",
    "repaymentStatus": "Paid",
    "dueAmount": 4219,
    "amountPaid": 4219,
    "outstanding": 0,
    "dueDate": "2026-06-21",
    "lastPaymentAt": "2026-05-23T12:30:00.000Z"
  }
}
```

The sanction PDF URL is protected by the same integration API key. Source website backends should fetch/proxy it with:

```http
GET /api/integrations/leads/sanction-pdf?sourceSystem=waqtmoney&sourceLeadId=WAQTMN-PD-946064055186
x-integration-api-key: <source integration key>
```

CRM also pushes repayment webhooks to the configured source webhook URL:

```json
{
  "event": "loan.repayment.updated",
  "sourceSystem": "waqtmoney",
  "sourceLeadId": "WAQTMN-PD-946064055186",
  "loanId": "LNWQTMN00132",
  "reference": "PAY_123456789",
  "amount": 4219,
  "amountPaid": 4219,
  "outstanding": 0,
  "repaymentStatus": "Paid",
  "publicStatus": "Repayment completed"
}
```

## Lead Source Mapping

`GET /api/leads` reads from the CRM lead mirror table:

- `loan_applications`

The API normalizes `loan_applications` into the shape expected by the CRM frontend. CRM-only fields are returned as defaults, for example `assignedTo = "Unassigned"`, `assignedRole = "Intake Queue"`, and `creditScore = 0`. Source identity is tracked with `source_system`, `source_lead_id`, `source_application_id`, and `source_status`.

Useful CRM columns to add later if you want richer workflow:

- `assigned_to`, `assigned_role`
- `priority`
- `last_contact`
- `lead_stage` or CRM-specific status separate from application `status`
- `source_channel`
- `credit_score`
- `notes`
