# Frontend Audit And SaaS Upgrade Plan

## Implemented in this pass

- Fixed production serving for Express 5 by replacing the broken wildcard route with SPA fallback middleware.
- Cleaned server console output and aligned mock API payload IDs with the CRM screens.
- Added a centralized CRM shell data module for navigation, workspace metadata, search records, and export rows.
- Made the top search box functional across pages, leads, customers, loans, and key actions.
- Made workspace export functional with a CSV download.
- Added API health status in the header using `/api/health`.
- Added local lead creation on the Leads page so the primary sales workflow is usable before backend wiring.

## Recommended next SaaS upgrades

- Move mock arrays from pages into shared typed data/services so the backend integration has one contract.
- Add authentication, tenant/workspace switching, role permissions, and audit logs.
- Add server-backed CRUD for leads, customers, loans, collections, commissions, invoices, and reports.
- Add form validation with consistent error states and API loading states.
- Add table sorting, saved filters, bulk actions, CSV import/export, and column visibility controls.
- Add automated tests for routing, forms, filters, pagination, detail pages, and server fallback behavior.
- Add observability hooks for API failures, slow pages, and user activity.
