# PHASE-1 PERFORMANCE BASELINE

## Overview
This document records the baseline architectural inspection, query analysis, payload metrics, and execution patterns for the Payday Loan CRM prior to applying Phase-1 performance fixes.

*Note on Runtime Measurements:* 
Local MySQL service on `localhost:3306` is offline / unavailable in this environment (`ECONNREFUSED 127.0.0.1:3306`). As strictly instructed, runtime measurements requiring a live database server are marked explicitly as **"Runtime measurement unavailable (local MySQL offline)"** to avoid fabricating metrics. Static code analysis, query profiling, and algorithmic complexities are verified directly against the production source code.

---

### A. Loans
**Endpoint:** `GET /api/v1/loans`  
**Target File:** `backend/models/loanModel.js` (`findAll()`), `backend/controllers/loanController.js` (`listLoans()`)  
**Current Baseline Inspection:**
- **Response time:** Runtime measurement unavailable (local MySQL offline)
- **DB query execution time:** Runtime measurement unavailable
- **Response size:** Estimated ~1.5 MB – 10 MB+ (scales linearly with total loans in DB)
- **Number of returned records:** Unbounded (Fetches 100% of rows from `loans` table; no `LIMIT` or `OFFSET` clauses present)
- **Number of SQL queries per request:** 2 queries:
  1. Main loan selection query with 15+ correlated subqueries in the `SELECT` projection and complex string cleaning functions (`TRIM(LEADING 'LN' FROM REPLACE(REPLACE(...)))`) in `JOIN` conditions.
  2. Unfiltered repayments query: `SELECT loan_id, amount, received_at FROM loan_repayments WHERE status = 'received'` fetching the entire table across all historical loans into Node.js memory.
- **Node processing time:** O(N_loans * M_repayments) in-memory JavaScript array iteration to compute realized ROI, effective tenure, and cumulative payments.

---

### B. Leads
**Endpoint:** `GET /api/v1/leads`  
**Target Files:** `backend/models/leadModel.js` (`findAll()`), `frontend/src/app/pages/Leads.tsx`  
**Current Baseline Inspection:**
- **Response time:** Runtime measurement unavailable (local MySQL offline)
- **Response size:** Estimated ~2 MB – 15 MB+ (returns full lead records including references, employment, bank details, and KYC status)
- **Number of returned records:** Unbounded when `limit` query param is absent.
- **Frontend Behavior:** Non-telecaller roles in `Leads.tsx` (Admins, Credit Managers, Accountants, Collections) call `GET /leads` without pagination parameters, storing thousands of records in React state and performing filtering, searching, and pagination client-side via JavaScript `.filter().slice()`.
- **Query Count:** 
  1. Auto-assign query checking unassigned leads.
  2. ID collection query: `SELECT id FROM loan_applications`.
  3. Detail query: `SELECT ... FROM loan_applications WHERE id IN (...)`.
  4. 3 duplicate-checking queries in `enrichDuplicates` with large `IN (...)` arrays for all fetched mobile numbers, PANs, and applicant names.

---

### C. Bulk Repayment
**Endpoint:** `POST /api/v1/loans/bulk-repayment`  
**Target File:** `backend/controllers/loanController.js` (`bulkRepayment()`)  
**Current Baseline Inspection:**
- **Total execution time:** Runtime measurement unavailable (local MySQL offline)
- **SQL query count:** ~7 to 10 sequential database queries per row in the uploaded Excel spreadsheet.
- **Execution Pattern:**
  Inside `for (let i = 0; i < rows.length; i++)`:
  1. `resolveLoanId({ loanId, phone, pan })`: 1 to 3 queries.
  2. `repaymentModel.findByReference(reference)`: 1 query.
  3. `repaymentModel.findLoanContext({ loanId })`: 1 query.
  4. `repaymentModel.createRepayment()`: 1 INSERT query.
  5. `repaymentModel.refreshLoanAfterRepayment()`: 1 UPDATE query.
  6. `repaymentModel.repaymentSummaryByLead()`: 1 SELECT query.
  7. `leadStatusModel.createForLead()`: 1 INSERT query.
  8. Customer stats sync: 1 UPDATE query with 2 correlated subqueries.
  9. Loan application closing sync (if balance <= 0): 1 UPDATE query with joins.
- **Total Queries for 1,000 Excel Rows:** ~7,000 to 10,000 sequential database queries over the network socket.

---

### D. Tenant Token Resolution
**Target File:** `backend/middleware/tenantMiddleware.js` (`resolveTenantByToken()`)  
**Current Baseline Inspection:**
- **Resolution flow:** `for (const tenant of allTenants)` iterates over every active tenant in the master database sequentially.
- **Number of tenant DB lookups:** O(N) where N = number of active tenants.
- **Number of SQL queries:** 1 master DB query (`SELECT * FROM tenants WHERE status = 'active'`) + up to N queries against individual tenant database pools (`SELECT id FROM lead_document_requests WHERE token = ?`).
- **Total resolution time:** Scales linearly with number of tenant databases.

---

### E. Authentication PBKDF2
**Target Files:** `backend/middleware/auth.js` (`verifyPassword()`), `backend/controllers/superadminController.js`  
**Current Baseline Inspection:**
- **Implementation:** Uses synchronous `crypto.pbkdf2Sync(cleanPass, user.salt, 120000, 32, 'sha256')`.
- **Execution mode:** Synchronous on the single-threaded Node.js event loop.
- **Approximate execution time:** ~40ms – 120ms per login request depending on CPU clock speed. Under 10 concurrent login requests, the Node event loop is blocked for ~0.5 to 1.2 seconds, stalling all other concurrent HTTP traffic.

---

### F. Database Connection Configuration
**Target File:** `backend/config/db.js` (`connectDatabase()`, `getTenantPool()`)  
**Current Baseline Inspection:**
- **Event Hook:** `pool.on('connection', (connection) => { connection.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci'); })` executes on every new physical connection across master pool and all tenant pools.
- **Overhead:** Extra network round-trip query execution per socket connection despite `charset: 'utf8mb4'` already being passed into `mysql.createPool()`.
