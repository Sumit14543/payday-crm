# Security audit — 26 October 2026

**Critical follow-up:** the deeper [information-leak review](security-audit/INFORMATION_LEAK_REVIEW.md) confirms additional cross-tenant caches/in-flight report leaks and a historical development env signing secret reused in the current local production configuration. The targeted original `.env` history checks below did not cover that `.env.development` exposure; use the follow-up findings for remediation priorities.

**Assessment: high risk. The reviewed code has credible paths to unauthorized customer-data access and financial/KYC record manipulation. It should not be treated as secure in its current state. This review does not establish that a breach has already happened.**

Scope: local working tree at commit `cec5f15`, including existing uncommitted edits. Reviewed backend route registration, authentication/OTP, role and tenant boundaries, lead/loan/customer access, public journeys, document storage/uploads, integration callbacks, frontend HTML/token handling, database configuration, dependency lockfiles, and deployment workflows. Findings apply to this code; whether each path is reachable on the deployed server depends on its deployed revision, configuration, proxy and database contents.

No production login, API exploitation, database connection, migrations, credential rotation, email, or deployment was performed. Application code and existing edits were not changed. The audit adds this report and `security-audit/reproduce.cjs` only.

## Verification and scope limits

Run from the repository root:

```text
node security-audit/reproduce.cjs
```

The script evaluates actual project functions with explicit mocked dependencies and synthetic records. It does not load `.env`, start the app, use real customer files, or contact a database/provider. Final verification reproduced **21/21 vulnerable behavior observations**. **`CONFIRMED` means vulnerable behavior reproduced; it is not a passing security assessment.** Some findings have multiple observations, while configuration/dependency findings rely on inspection and published advisories. After remediation, replace these vulnerability observations with tests expecting rejection.

Concurrent working-tree changes to authentication/seeding/password scripts appeared during the review and were left untouched. The final local checks were rerun against the resulting files. Changing fixed credential values does not remove the password-reset/reactivation or authorization defects described here.

Both backend and frontend `npm audit --json --package-lock-only --ignore-scripts` returned zero findings, including a repeat with the public npm registry explicitly selected. This result is contradicted by the installed `xlsx` version and published advisories; it cannot be used as clearance.

The normal backend `npm test` was deliberately not run: `scripts/checkBackend.js` starts `server.start()`, which invokes database bootstrap/migrations/seeding. It also exits before background bootstrap finishes, so it is not a reliable security validation. No dependency updates or build were needed for this audit-only change.

The audit does not verify live server firewall/ports, Apache behavior, actual DB grants, GCS IAM/public access, TLS certificates, provider dashboards, backups, GitHub access permissions, or incident history. The credential scan covered current tracked text files using targeted patterns and checked history for the `.env` paths; it was not a complete secret scan of every historical commit or binary artifact.

## Fix these first

1. Remove automatic production support/test-account creation, password resets and reactivation. Disable affected shared/test accounts and rotate their credentials **after fixing the startup code**, otherwise restart can restore them. Revoke existing sessions.
2. Remove the product-admin bypass of superadmin authorization. Restrict all master-database and cross-company operations to verified platform administrators.
3. Require provider authentication for all financial, credit-report and eSign callbacks. Reject missing/invalid signatures before any file write, status update or fallback processing.
4. Add tenant-bound sessions and central object authorization to every lead, loan and document read/write. Remove arbitrary-path document downloads.
5. Replace public mandate IDs with scoped expiring capabilities; disable production test routes; escape print HTML; enforce upload limits before storage.
6. Repair TLS/proxy handling, upgrade the spreadsheet parser and remove credentials from logs/URLs. Then validate on isolated staging with separate databases and provider sandboxes.

## Critical findings

### C01 — Startup restores fixed privileged credentials and reactivates accounts

Evidence: [schema.js:1454](backend/database/schema.js#L1454), [tenantProvisionerService.js:34](backend/services/tenantProvisionerService.js#L34), [bootstrap.js:355](backend/database/bootstrap.js#L355), [seed.js:93](backend/database/seed.js#L93), [masterSchema.js:133](backend/database/masterSchema.js#L133).

`ensureSupportUsers()` inserts shared support/telecaller accounts using a shared fixed salt/hash. Its duplicate-key update overwrites the password and sets `is_active = 1` and `on_duty = 1`. Tenant provisioning calls it even for existing databases. Credential material, including plaintext password comments, is present in tracked source. Other bootstrap blocks similarly restore named users and the test credit manager. Master seeding can overwrite administrative passwords when setup/forced provisioning runs.

Impact: a source reader can obtain working default credentials if these routines ran; disabling accounts or changing passwords can be undone by restart. Product-admin login has no OTP requirement in the reviewed flow. Combined with C03, a compromised shared tenant administrator can affect other companies.

Verified locally: support seeding emits multiple credential-overwriting, account-reactivating SQL statements with the same hash. No real SQL executed.

Fix: production migrations must never create/reset operational user credentials. Use an explicit one-time administrator provisioning command with unique random credentials, enforced password change and MFA. Remove password comments and rotate every credential represented in source; removing the text alone does not revoke it.

### C02 — Production test account plus request-controlled test mode defeats OTP

Evidence: [authController.js:93](backend/controllers/authController.js#L93), [authController.js:167](backend/controllers/authController.js#L167), [authController.js:241](backend/controllers/authController.js#L241), [crmUserModel.js:25](backend/models/crmUserModel.js#L25), [bootstrap.js:432](backend/database/bootstrap.js#L432).

Login considers request `Origin`/`Host` strings containing `testing` or `localhost` sufficient to enable test behavior, including on production. A test email prefix then selects a fixed OTP. The model automatically provisions/reactivates the test credit-manager account during authentication lookup without a production guard. Its source-seeded password is recoverable from tracked code. OTP verification accepts the stored fixed OTP even when the verification request uses an ordinary production host.

Impact: an attacker with the source-known test credential can reach a credit-manager session without control of the email inbox. A restricted email-domain list does not prevent this chain. There is still a password check; the defect is the known credential plus automatic account provisioning and OTP bypass, not a universal password-free login.

Verified locally: actual password derivation against the source-seeded hash, actual login/OTP functions in production mode, a forged test-like Origin, and token issuance reproduced the full chain against synthetic database responses. No credentials or issued tokens are printed.

Fix: delete test-account provisioning and fixed OTP logic from production code. Environment mode must come solely from trusted server configuration, never headers, ports or public URL substrings. Production must reject test identities. Use shared persistent OTP attempt limits and single-use, hashed challenges.

### C03 — Tenant product-admin is authorized as a platform superadmin

Evidence: [auth.js:176](backend/middleware/auth.js#L176), [superadminRoutes.js:25](backend/routes/superadminRoutes.js#L25), [superadminController.js:446](backend/controllers/superadminController.js#L446), [superadminController.js:491](backend/controllers/superadminController.js#L491), [superadminController.js:532](backend/controllers/superadminController.js#L532).

`requireRole()` unconditionally permits both `superadmin` and `product-admin`, even when its caller requests only `superadmin`. Master tenant/user endpoints use that helper. User management accepts a request-selected `tenantSlug`, then lists users or creates/resets accounts in that tenant. A GeetPay-only tenant restriction does not establish ownership or a platform-admin boundary.

Impact: an authenticated tenant product-admin can access cross-company administration, including other tenants' users and password resets where the target company is reachable. This is a direct account-takeover boundary failure, not merely an exposed UI page.

Verified locally: a product-admin passes `requireRole(['superadmin'])`.

Fix: make role checks explicit with no implicit product-admin elevation. Use a separate platform-admin authorization guard tied to active master accounts and an administrative session audience. Tenant administrators must be pinned to their own tenant and prohibited from assigning platform roles.

### C04 — Unsigned mandate callbacks can mark mandates active

Evidence: [routes/index.js:75](backend/routes/index.js#L75), [billdeskEmandateController.js:489](backend/controllers/billdeskEmandateController.js#L489), [cashfreeEmandateController.js:636](backend/controllers/cashfreeEmandateController.js#L636).

The public BillDesk/Razorpay webhook accepts ordinary JSON `orderid`/status fields without authenticating the sender. JOSE parsing is attempted only for string payloads, and a parse failure does not immediately reject the request. The Cashfree mandate handler verifies signatures only when both the secret and signature exist: omitting the signature skips verification. If the provider lookup fails, it falls back to status fields from the submitted subscription. Supplied account/phone mismatch fields may also drive a cancellation attempt.

Impact: someone with a discoverable application/order/subscription identifier can forge financial verification state or trigger disruptive processing. The separate `/api/cashfree/webhook` repayment handler has mandatory signature verification; that protection does not cover these mandate routes.

Verified locally: unsigned BillDesk JSON sets `ACTIVE`; an unsigned Cashfree event sets `ACTIVE` when a simulated provider lookup fails, even with a configured webhook secret.

Fix: require the correct provider authentication format on every callback, verify signatures over original bytes, reject missing/invalid/expired signatures, bind the provider object to the tenant/application, and process events idempotently. Provider lookup failures must fail closed. Do not accept arbitrary JSON as a substitute for verified JOSE.

### C05 — Public Digio callback accepts an attacker-supplied signed agreement

Evidence: [routes/index.js:94](backend/routes/index.js#L94), [loanAgreementController.js:192](backend/controllers/loanAgreementController.js#L192), [loanAgreementController.js:441](backend/controllers/loanAgreementController.js#L441).

The webhook performs no sender authentication. It matches a provider document ID or agreement reference, accepts `documentBase64`, writes its decoded bytes to the signed-agreement location and marks an agreement signed based on a supplied status. A provider fetch is unnecessary if uploaded bytes were supplied.

Impact: someone who knows a document/reference identifier can replace the supposed signed contract and falsify eSign completion. No valid signature or actual customer signing is required by this handler.

Verified locally: the actual handler reaches mocked file-write and `markSigned()` operations for an unsigned synthetic callback containing supplied PDF bytes.

Fix: authenticate the provider callback before processing, verify completion against the provider, download the signed artifact only from that verified document, check MIME/signature/size, and retain immutable hashes and provenance. Never treat webhook-supplied bytes as proof of customer signing.

## High-severity findings

### H01 — Sessions are not bound to a tenant or revocable session record

Evidence: [auth.js:45](backend/middleware/auth.js#L45), [verifyTenantSession.js:11](backend/middleware/verifyTenantSession.js#L11), [tenantMiddleware.js:203](backend/middleware/tenantMiddleware.js#L203).

Tokens contain email/name/role/expiry but no tenant, immutable user ID, audience or session version. The requested tenant can be selected through headers/query/body. Session verification only checks whether the same email/role exists and is active in the selected database; superadmins are skipped entirely. Shared seeded identities make cross-tenant matches plausible. Password changes do not invalidate existing bearer tokens; frontend logout only removes browser storage. Ordinary deactivation can additionally be delayed by the 60-second user cache.

Verified locally: a token minted in tenant A remains accepted in tenant B when the same email/role exists. Fix: validate tenant ID, user ID, audience, current role and session version on every protected request; implement server-side logout/password-reset revocation and active master-account checks.

### H02 — Lead and loan reads lack consistent object authorization

Evidence: [leadController.js:35](backend/controllers/leadController.js#L35), [leadController.js:56](backend/controllers/leadController.js#L56), [leadRoutes.js:93](backend/routes/leadRoutes.js#L93), [loanRoutes.js:10](backend/routes/loanRoutes.js#L10), [loanController.js:9](backend/controllers/loanController.js#L9).

`getLead()` retrieves a supplied identifier without an assignment check and returns the full lead plus matched loan history. List scoping for telecallers is removed by request flags such as `includeAllLeads=true`, `duplicateLookup=true`, or simply a search. The loan list/detail routes require login but do not apply a per-user ownership/assignment boundary. Related controllers often fetch records by ID independently.

Impact: an ordinary or stolen employee account can enumerate customer records beyond its assigned work, including identity, bank and loan information returned by the model. Verified locally: a telecaller reads another assigned lead and removes list scope with a query flag.

Fix: centralize role/tenant/assignment authorization and apply it before every record read/write, document/report view, bulk operation and export. Search/duplicate handling should return only necessary masked fields unless explicitly authorized.

### H03 — Documents are protected by login only, across a shared storage namespace

Evidence: [app.js:42](backend/app.js#L42), [app.js:71](backend/app.js#L71), [fileController.js:17](backend/controllers/fileController.js#L17), [uploads.js:8](backend/config/uploads.js#L8), [gcs.js:65](backend/config/gcs.js#L65).

Any authenticated user can request an upload path through static `/uploads` or `/api/files/download?path=...`. Neither path checks document ownership, assignment, tenant, or a document-specific permission. All tenants use the same upload root and GCS destination prefix. A path that is valid inside the root is not necessarily authorized for that user.

Impact: knowledge of another customer's or tenant's file URL can be enough to download their PAN/Aadhaar, statement or agreement with any active account. Filename randomness reduces guessing but is not authorization. Verified locally: a tenant A request reaches `sendFile` for a synthetic tenant B file without an ownership query.

Fix: store immutable tenant/lead/document ownership metadata and serve private files through an authorized document-ID endpoint. Separate tenant storage prefixes, prevent direct static serving of private documents and preserve authorization on the GCS fallback. Use private/no-store response caching: static serving currently uses a one-day max age, and GCS upload metadata defaults to public one-year caching. This metadata does not itself make a private bucket publicly readable; live bucket IAM remains unverified.

### H04 — Account Aggregator and credit-report callbacks trust unauthenticated data

Evidence: [accountAggregatorRoutes.js:14](backend/routes/accountAggregatorRoutes.js#L14), [accountAggregatorController.js:456](backend/controllers/accountAggregatorController.js#L456), [accountAggregatorController.js:521](backend/controllers/accountAggregatorController.js#L521), [cibilController.js:368](backend/controllers/cibilController.js#L368), [routes/index.js:95](backend/routes/index.js#L95).

AA webhook status updates require only a tracking ID. The AA callback can consider a query-string success status authoritative even if provider status lookup fails. The public score callback saves normalized credit-report data and updates report URLs without sender authentication.

Impact: consent/KYC/credit-report records can be poisoned by someone with the relevant identifiers. In particular, a public credit callback is not a trusted underwriting source merely because it is rate limited. Verified locally: unsigned AA and CIBIL callbacks reach state-saving operations.

Fix: authenticate callbacks, bind events to a server-recorded request and tenant, use provider-confirmed status, restrict report hosts and reject uncorrelated events. Return minimal acknowledgements rather than saved sensitive records.

### H05 — Public mandate endpoints reveal applicant PII using guessable IDs

Evidence: [routes/index.js:48](backend/routes/index.js#L48), [billdeskEmandateController.js:268](backend/controllers/billdeskEmandateController.js#L268), [cashfreeEmandateController.js:412](backend/controllers/cashfreeEmandateController.js#L412).

Public handlers accept application IDs or raw numeric lead IDs and return applicant name, full email/mobile, financial/mandate details and masked bank information. A public GET may also create gateway orders/subscriptions. No customer OTP, unpredictable capability or record-level proof is required.

Impact: unauthenticated enumeration can disclose customer information and trigger gateway activity. Rate limiting limits speed but does not authorize access. Verified locally: a request with only a numeric ID receives synthetic full email/mobile fields.

Fix: use a short-lived random capability bound to a specific application/action, verify customer possession when needed, mask unnecessary fields, and move creation/update side effects to authenticated POST operations.

### H06 — Statement print/export inserts unescaped customer data into HTML

Evidence: [LeadDetails.tsx:2131](frontend/src/app/pages/LeadDetails.tsx#L2131), [LeadDetails.tsx:2172](frontend/src/app/pages/LeadDetails.tsx#L2172), [LeadDetails.tsx:2194](frontend/src/app/pages/LeadDetails.tsx#L2194), [LeadDetails.tsx:2451](frontend/src/app/pages/LeadDetails.tsx#L2451), [auth.tsx:168](frontend/src/app/lib/auth.tsx#L168).

`handleDownloadAaPdf()` interpolates lead name, bank fields, transaction narration and analytics fields into a template and passes it to `document.write()` in a blank popup. These values are not HTML-escaped. The popup inherits the application's origin; bearer sessions are stored in localStorage. There is no application CSP in the reviewed security-header middleware, although an uninspected hosting layer could add one.

Impact: malicious stored customer/provider text can become active HTML when a staff member prints/downloads the statement, potentially stealing tokens or performing actions in that session. Exploitation requires the relevant data to reach this print flow and a user action.

Verified locally: actual print-function execution with a synthetic markup-bearing applicant/narration produces unescaped executable markup in the generated HTML. Browser execution and exfiltration were deliberately not attempted.

Fix: construct print content with text nodes or context-appropriate escaping for every dynamic field; use an isolated export document and strict CSP. Reduce session exposure with an appropriate HttpOnly secure-cookie design and CSRF controls if cookie authentication is adopted.

### H07 — Integration keys are not bound to the selected tenant

Evidence: [tenantMiddleware.js:203](backend/middleware/tenantMiddleware.js#L203), [integrationAuth.js:23](backend/middleware/integrationAuth.js#L23), [integrationController.js:171](backend/controllers/integrationController.js#L171), [integrationRoutes.js:9](backend/routes/integrationRoutes.js#L9).

Tenant routing accepts a caller-supplied tenant before integration authorization. The key guard checks a submitted source-system string, but does not require the resolved tenant to belong to the key. Omitting sourceSystem bypasses the string comparison. The selected DB and authenticated source can consequently disagree. Impact depends on which source records/actions exist in the selected tenant.

Verified locally: a key scoped to tenant/source A is accepted with tenant B already resolved. Fix: keys must carry explicit tenant and operation scopes; resolve the tenant from the authenticated key or enforce an allowlist before any model call. Reject conflicting request selectors.

### H08 — SMTP TLS certificate validation is disabled

Evidence: [emailService.js:32](backend/services/emailService.js#L32).

The mail transport sets `tls.rejectUnauthorized = false`. This allows an invalid server certificate to be accepted, exposing SMTP credentials, OTPs and customer documents to an attacker who can intercept the SMTP connection. This is a network-position-dependent risk, not proof of an existing interception. `secure=false` on port 587 alone is not a defect; STARTTLS is normal there.

Verified locally: the actual service supplies disabled certificate verification to a mocked Nodemailer transport. Fix: validate certificates, fix the SMTP hostname/certificate chain and require TLS for credential-bearing delivery.

### H09 — Global proxy trust permits IP-based protection bypass if headers are not sanitized

Evidence: [app.js:18](backend/app.js#L18), [rateLimiter.js:19](backend/middleware/rateLimiter.js#L19), [authController.js:30](backend/controllers/authController.js#L30), [getIp.js:12](backend/utils/getIp.js#L12), [auditModel.js:23](backend/models/auditModel.js#L23).

`trust proxy = true` trusts the leftmost forwarded IP. Rate limiters and login lockout keys depend on that IP. If a client can supply or preserve forwarded headers through the actual ingress, changing them can evade throttling. Audit IPs also prefer caller-supplied `x-client-ip` and other forwarded headers. Live ingress/header sanitation and direct backend port exposure were not tested, so deployed exploitability is conditional.

Fix: trust only known proxy addresses/topology, block public access to backend listener ports, strip/overwrite forwarded identity headers at ingress, and key authentication protections on account plus server-derived IP with shared persistent storage. See the [Express proxy guide](https://expressjs.com/en/guide/behind-proxies/) and [rate-limiter validation guidance](https://express-rate-limit.github.io/ERR_ERL_PERMISSIVE_TRUST_PROXY/).

### H10 — Uploads are stored before capability validation; bulk upload is unbounded

Evidence: [routes/index.js:83](backend/routes/index.js#L83), [documentRequestController.js:74](backend/controllers/documentRequestController.js#L74), [documentRequestController.js:312](backend/controllers/documentRequestController.js#L312), [loanRoutes.js:8](backend/routes/loanRoutes.js#L8).

Public Multer disk storage runs before checking whether the token exists, is expired, cancelled or completed. The later rejection does not delete stored files; unexpected/unmatched files are also left behind. One request can contain up to twenty 10 MB files. MIME checks trust submitted metadata and allow broad image/video types without content verification. Bulk-repayment parsing uses `memoryStorage()` with no explicit byte/file limit; its superadmin guard also admits product-admin because of C03.

Impact: disk/memory exhaustion and unverified file retention. Rate limits are defense in depth, not a fix for writing data under an invalid capability. Verified locally: mocked disk storage runs before a nonexistent token is rejected.

Fix: validate capability and allowed document fields before Multer, impose bounded request/file/field counts and sizes, verify bytes against expected types, quarantine/scan documents, clean up every rejected/unmatched upload and cap bulk spreadsheet parsing work.

### H11 — Production auth configuration error does not stop token verification

Evidence: [auth.js:7](backend/middleware/auth.js#L7), [auth.js:45](backend/middleware/auth.js#L45), [auth.js:59](backend/middleware/auth.js#L59).

Missing `AUTH_TOKEN_SECRET` uses a source-known fallback. Production configuration errors are enforced while creating tokens/authenticating users but not while verifying incoming tokens. A token signed with that fallback can therefore verify even though login reports a configuration error. Superadmin tokens then skip tenant session lookup.

Verified locally in production mode with the secret omitted. The effective local development configuration and separately selected local production env file both contain a non-placeholder secret of at least 32 characters, so this is a dangerous misconfiguration path, not a claim that either reviewed local configuration is currently using the fallback.

Fix: fail application startup without a strong configured secret and reject verification whenever configuration is invalid. Remove known fallbacks outside explicitly isolated tests, separate audiences and support key rotation/session revocation.

### H12 — Vulnerable spreadsheet parser is reachable through bulk repayment import

Evidence: [package.json:32](backend/package.json#L32), backend lockfile resolves `xlsx@0.18.5`; [loanController.js:77](backend/controllers/loanController.js#L77).

The backend parses uploaded workbooks with `xlsx.read()`. The installed version is below fixes for CVE-2023-30533 (prototype pollution) and CVE-2024-22363 (ReDoS). Reachability is authenticated, currently including product-admin due to C03; this is not an anonymous parser endpoint.

The [prototype-pollution advisory](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) affects versions below 0.19.3, and the [ReDoS advisory](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) affects versions below 0.20.2. [SheetJS installation documentation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) identifies its maintained distribution; the legacy npm package does not provide the needed fixed release. These sources were checked during this audit despite npm audit returning zero.

Fix: use a verified maintained release/distribution or a maintained replacement, pin its integrity, apply strict upload/workbook limits and isolate expensive parsing. Validate the repayment import behavior after updating. No malicious workbook or denial-of-service payload was executed.

### H13 — Production exposes a public testing route that accepts application status

Evidence: [publicLeadRoutes.js:7](backend/routes/publicLeadRoutes.js#L7), [routes/index.js:47](backend/routes/index.js#L47), [publicLeadController.js:57](backend/controllers/publicLeadController.js#L57), [leadModel.js:738](backend/models/leadModel.js#L738).

`POST /api/public/test-leads` has no authentication or production-disable guard. It passes caller-supplied `status` into the model; the model accepts workflow statuses such as Approved and inserts their mapped database state. It also accepts unrestricted text later used by UI/export flows. This proves unauthorized record/status creation, not that a forged application automatically triggers a real payout.

Verified locally: a production-mode unauthenticated synthetic submission reaches creation with `status: 'Approved'`. Fix: disable testing routes in production, use separate test databases, hardcode the initial state for public intake and restrict every approval/state transition to authorized server-side operations.

## Medium findings and additional hardening

### M01 — CORS accepts broad origins, including production wildcard reflection

Evidence: [cors.js:19](backend/middleware/cors.js#L19), [cors.js:81](backend/middleware/cors.js#L81).

The helper accepts wildcard configuration regardless of environment, defeating the later production wildcard check, and reflects origins with credentials. Trusted base-domain matching also admits all subdomains, localhost and varying schemes/ports. Verified locally: production wildcard configuration permits an arbitrary origin with `Access-Control-Allow-Credentials: true`. Neither reviewed effective local config selected a wildcard. CORS alone does not bypass bearer authentication.

Fix: parse and compare exact allowed scheme/host/port tuples, reject wildcard production configuration at startup, and permit local origins only in development.

### M02 — OTPs and bearer capabilities leak into logs and URLs

Evidence: [authController.js:182](backend/controllers/authController.js#L182), [authController.js:327](backend/controllers/authController.js#L327), [auth.js:144](backend/middleware/auth.js#L144), [logger.js:5](backend/middleware/logger.js#L5), [LeadDetails.tsx:1094](frontend/src/app/pages/LeadDetails.tsx#L1094), [LeadDetails.tsx:3466](frontend/src/app/pages/LeadDetails.tsx#L3466), [tallyController.js:195](backend/controllers/tallyController.js#L195).

Login/resend log live OTPs. The backend accepts full bearer tokens in query strings; frontend file fallbacks append them to URLs, and request logging records `req.url`. Tally also accepts a query-string API key. Browser history, access logs and monitoring can retain these credentials. AA handlers additionally log complete webhook bodies. Testing deployment prints recent application logs into CI output.

Fix: remove OTP logging, redact sensitive fields and query parameters in all app/proxy/CI logs, use Authorization headers/blob fetching or short-lived document-specific capabilities, and disable query-string API keys. Restrict and review existing logs; rotate any exposed tokens/keys as appropriate.

### M03 — Audit evidence can be spoofed, and sensitive configuration needs deployment isolation

Evidence: [auditModel.js:4](backend/models/auditModel.js#L4), [auditModel.js:23](backend/models/auditModel.js#L23), [config/env.js:4](backend/config/env.js#L4), [config/db.js:51](backend/config/db.js#L51), [.github/workflows/deploy-production.yml:114](.github/workflows/deploy-production.yml#L114).

Client headers supply audit IP/location fields, and some activity records accept caller-provided actor names. These must not be treated as verified identity/location. The env loader overwrites inherited deployment variables from local files. Database pools enable multi-statements and do not configure MySQL TLS. Actual least-privilege grants and server-side encryption were not inspected; there is no confirmed general SQL injection from these settings alone.

Deployment places backend source under `public_html`, uses mutable third-party action tags, has no security-test gate, and broadly changes files to mode 644 before restoring selected credential-file permissions. The testing workflow does not restore private modes for `.env`/GCP credentials after its blanket chmod. Production installs dependencies only when node_modules is missing and tolerates installation failure, so deployed versions may differ from audited lockfiles.

Fix: derive audit identity/IP on the server and mark user-reported GPS as unverified; preserve trusted deployment environment precedence; use separate least-privilege DB users and TLS for remote DB connections; disable multi-statements on request pools. Keep server source/secrets/uploads outside the public web root, preserve private credential modes, install locked dependencies on every release, pin CI actions and add meaningful security checks before deployment. Verify actual Apache routing rather than relying on an untracked `.htaccess` file.

## Secrets and data observations

- `.env`, `.env.development` and `.env.production` are ignored/untracked; targeted Git history checks found no entries for the checked backend/frontend `.env` paths. This is positive, but not proof that no secret ever entered another file or commit.
- The raw base `.env` alone gave misleading database/key results because `.env.development` overrides it. The **effective** local development configuration uses a non-root-looking DB username, a non-empty password, configured integration keys and a configured auth secret of at least 32 characters. The separately selected local production env file also sets production mode, a non-root-looking username, non-empty DB password and a configured non-placeholder auth secret of at least 32 characters. This does not measure secret entropy or prove the deployed server uses those values. No values are included here.
- The selected local production file has no integration API keys configured; the guard should return 503 rather than open access. GCS sync is disabled in both reviewed effective configurations. Live hosting can differ.
- A Google Maps API key is embedded in frontend source/built assets and backend geocoding source. A browser Maps key is inherently public, so exposure alone is not proof of credential compromise. Verify API/referrer restrictions and quotas; use a distinct restricted server key. Restrictions were not inspected and the key was not tested.
- Tracked account-creation/screenshot scripts contain literal account passwords. Fixed credential comments/hashes also occur in bootstrapping. Treat these credentials as exposed to every repository reader.
- Bootstrap contains customer identity and historical loan information in source. Restrict repository access and move real operational/customer data out of code and screenshots/artifacts. Do not send this repository to a public scanner.
- Local upload traversal has explicit root containment checks; common SQL paths use placeholders and sorting allowlists; auth signatures use HMAC with timing-safe comparison; public document/eSign capabilities use cryptographic randomness. These useful protections do not repair the authorization and callback defects above.

## Evidence needed to assess whether data was already stolen

Review server/proxy and database audit logs for unexpected test/support logins, cross-tenant administrative changes, bulk lead/document reads, unrecognized file downloads, OTP/token-bearing requests and unsigned financial callbacks. Compare platform/tenant users and recent password/activation changes with approved administration. Compare mandate/eSign/credit state with authoritative provider records and check DB/GCS/hosting access logs. Absence of events in application audit tables alone is insufficient because some reads are not audited, failures are swallowed and client-supplied metadata is spoofable.

Complete those checks using authorized read-only hosting/provider access and preserved log copies. No conclusion about past compromise can be drawn from this source audit alone.
