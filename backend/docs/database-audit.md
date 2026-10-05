# Database Audit

Created: 2026-05-19

## Keep As Core Tables

- `loan_applications`: CRM lead/application mirror and operational status.
- `lead_status_events`: customer-visible and CRM-visible lifecycle timeline.
- `lead_call_logs`, `lead_followups`: telecaller disposition and follow-up workflow.
- `lead_document_checks`, `lead_document_requests`: document verification and upload requests.
- `lead_credit_handoffs`, `lead_cam_sheets`: underwriting queue and credit decision artifacts.
- `lead_sanctions`, `lead_loan_agreements`, `lead_esign_requests`: sanction, agreement, and eSign workflow.
- `lead_accounting_payments`: disbursement records.
- `customers`, `loans`, `collection_cases`: post-disbursement loan/customer/collections layer.
- `aadhaar_reports`, `cibil_reports`: KYC and bureau provider responses.
- `lead_activities`, `audit_logs`: internal audit trail.

## New Fintech-Grade Tables Added

- `integration_ingestion_logs`: saves every source lead ingestion attempt, including failed requests, payload summary, response, source IDs, IP, and user agent.
- `lead_consents`: normalized consent ledger for terms, credit check, communication, privacy, and similar source/customer consents.
- `loan_repayment_schedule`: repayment calendar generated when a loan is disbursed.
- `loan_repayments`: future repayment receipts and allocation into principal, interest, fees, and penalties.

## Drop Candidates, Approval Required

These are retained because they support current dashboard/reference screens:

- `commissions`: currently used by reference/report endpoints.
- `income_lines`: currently used by dashboard revenue and reference endpoints.
- `invoices`: currently used by accountant reference endpoints.
- `team_members`: currently used by dashboard/reference data.

Before dropping any candidate table, export row counts and confirm no active frontend/API screen depends on it.

## Current Policy

- No destructive drops in automated migration.
- Additive migrations only.
- Customer status should be read from `lead_status_events`.
- Current CRM status remains in `loan_applications.status` for fast queue filtering.
- Source leads always create in CRM as `New` unless a CRM user later performs an action.
- Source-side lead status is stored separately in `loan_applications.source_status`; it must not overwrite CRM workflow status.

## Recommended Next Improvements

- Add a customer-facing tracking page backed only by `lead_status_events`, with OTP/phone verification before showing status.
- Add a repayment webhook/API so bank/UPI/NACH payment callbacks update `loan_repayments` and `loan_repayment_schedule`.
- Add source status history, not just latest status, if WaqtFinance/WaqtMoney need full source-side audit.
- Add assignment rules for telecaller queues by city, amount, source system, and workload.
- Add document expiry/versioning for PAN, Aadhaar, salary slips, bank statement, sanction letter, and agreement files.
- Add maker-checker approvals for credit decision, sanction changes, disbursement, and write-off/waiver actions.
- Add SLA timers for new lead first call, document collection, credit review, agreement signing, and disbursement.
- Add a secure customer notification table for WhatsApp/SMS/email delivery status and retries.
- Add role-level audit reports for who viewed sensitive KYC/bank documents.
- Add data retention and masking policy for Aadhaar, PAN, bank account, and provider raw responses.
