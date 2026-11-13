# Acceptance checklist — tick off with evidence

## 1. Repository and setup

- [ ] Neutral public repository name; does not contain the company name.
- [x] Independent backend repository `blush-atelier-api`; frontend in `blush-atelier-web` (see README).
- [x] `.gitignore` excludes `.env`, build output, node_modules, coverage, local DB files.
- [x] `.env.example` lists variable names only; no real values.
- [ ] README has setup commands that work from a clean clone.
- [ ] Meaningful commits show real progress.

## 2. Product and UI

- [ ] Product name, description, price and stock are visible.
- [ ] "Pay with credit card" opens a modal.
- [ ] Card form validates required fields and format.
- [ ] Visa/Mastercard detection is present (bonus).
- [ ] Delivery form validates required fields.
- [ ] Summary shows product amount + base fee + delivery fee.
- [ ] Payment button is in a backdrop-style summary layer/component.
- [ ] Loading, error, decline, pending and success states are clear.
- [ ] Final screen shows transaction reference/status.
- [ ] Return to product page refreshes stock.
- [ ] Refresh restores safe checkout progress.
- [ ] No full PAN/CVV or secret appears in Redux persistence/localStorage.
- [ ] Mobile layout works at iPhone SE reference size without horizontal overflow.
- [ ] Tablet and desktop layouts are polished.
- [ ] Images are optimized, sized, lazy-loaded where appropriate, and have fallbacks.
- [ ] Keyboard navigation, labels, focus, and contrast are acceptable.

## 3. API and business rules

- [x] Product listing/detail endpoint works.
- [x] Customer creation/registration endpoint validates data.
- [x] Delivery creation endpoint validates data.
- [x] Transaction endpoint creates PENDING transaction and returns reference.
- [ ] Payment endpoint initiates Sandbox flow.
- [ ] Transaction status endpoint returns backend-verified status.
- [ ] Webhook endpoint validates authenticity and handles duplicate events idempotently.
- [x] Stock is reserved/updated safely; insufficient stock is rejected.
- [ ] Duplicate requests do not double-charge or double-decrement stock.
- [ ] Provider decline/failure leaves consistent transaction and stock state.
- [x] Backend calculates price, fees, delivery fee and stock; frontend values are not trusted.
- [x] API uses correct HTTP status codes and validation errors.

## 4. Wompi Sandbox and security

- [ ] Sandbox base URL and keys are configured through environment variables.
- [ ] Private, event and integrity secrets exist only on backend.
- [ ] Public key is exposed only if the official integration requires it.
- [ ] Card collection/tokenization follows current official Wompi documentation.
- [ ] PAN/CVV are not stored, logged, or sent to our database.
- [ ] Payment success is verified server-side, not trusted from browser redirect.
- [ ] Webhook signature/integrity validation follows provider docs.
- [ ] Secrets are absent from Git history, logs, screenshots and README.
- [ ] CORS allows only expected frontend origin in production.
- [ ] HTTPS enabled for deployed app/API.
- [ ] Security headers enabled.
- [ ] Sensitive endpoints have rate limiting and input validation.
- [ ] Database user has least-privilege permissions.

## 5. Hexagonal Architecture and ROP

- [x] Domain has no NestJS/TypeORM/Wompi/AWS imports.
- [x] Application use cases depend on ports, not concrete adapters.
- [x] Infrastructure adapters implement ports.
- [x] Nest controllers only validate/translate HTTP and call use cases.
- [x] DI tokens bind ports to adapters.
- [x] ORM models are mapped to domain entities.
- [x] Use cases return typed `Result<T,E>` for expected outcomes.
- [x] Controllers map Result errors to appropriate HTTP responses.
- [x] No broad catch-and-ignore patterns.
- [x] README includes architecture diagram and request/data flow.

## 6. Tests

- [ ] Jest configured and runs in frontend.
- [x] Jest configured and runs in backend.
- [x] Domain unit tests cover invariants and business policies.
- [x] Use-case tests cover success and expected failures.
- [x] API/controller tests cover validation and HTTP mapping.
- [ ] Frontend tests cover form validation, Redux state, loading/error/success.
- [ ] Payment adapter tests mock provider; no real payment calls.
- [ ] Duplicate webhook test.
- [x] Insufficient stock test.
- [ ] Duplicate payment/idempotency test.
- [x] Stock concurrency/oversell test.
- [ ] Refresh/resume test.
- [ ] Both apps exceed 80% coverage (actual reports saved).
- [x] README reports exact coverage and test commands.

## 7. AWS and delivery

- [ ] Frontend deployed to S3 + CloudFront and opens from public URL.
- [ ] Backend deployed to Lambda + API Gateway and responds from public URL.
- [ ] Production frontend calls deployed backend (not localhost).
- [ ] PostgreSQL cloud database reachable securely from backend.
- [ ] Database migrations/seed completed in cloud.
- [ ] No public database port or broad inbound rule.
- [ ] AWS budget alert configured; no unexpected paid resources.
- [ ] Cloud logs checked without exposing secrets/card data.
- [ ] Swagger or Postman collection public and linked in README.
- [ ] README includes AWS architecture, URLs, environment variable names, ERD, setup and test evidence.
- [ ] Full Sandbox checkout tested against deployed application.

## 8. Interview readiness

- [ ] I can explain public vs private Wompi keys.
- [ ] I can explain why secrets stay in backend environment variables.
- [ ] I can explain tokenization and why PAN/CVV are not persisted.
- [ ] I can trace frontend → API → use case → port → adapter → DB/provider.
- [ ] I can explain how PostgreSQL relations and transactions work.
- [ ] I can explain PENDING → final payment state.
- [ ] I can explain webhook verification and idempotency.
- [ ] I can explain stock reservation and prevention of overselling.
- [ ] I can explain Hexagonal Architecture and ROP with one real code example.
- [ ] I can explain deployment and public URLs in AWS.

## CI/CD extra

- [ ] GitHub Actions CI triggers on PR and development/staging/production pushes.
- [ ] CI verifies lint, TypeScript, Jest >80% coverage, and build.
- [ ] GitHub Actions uses least-privilege permissions.
- [ ] AWS OIDC role is restricted to the correct repository and branch.
- [ ] AWS deployment runs only after green CI and infrastructure setup.
- [ ] No long-lived AWS access keys or payment secrets in repository/workflows.
- [ ] README explains CI/CD and links to public workflow runs.

## Promotion and environments

- [ ] Remote development, staging and production branches published and protected.
- [ ] feature/* -> development PR with required quality check.
- [ ] development -> staging PR with CI and validation evidence.
- [ ] staging -> production PR with CI and acceptance evidence.
- [ ] Direct pushes and force pushes blocked on permanent branches.
- [ ] All environments use Wompi Sandbox.
- [ ] Staging costs evaluated before persistent AWS infrastructure.
- [ ] Production AWS deployment verified after CI; OIDC scoped to production.
- [ ] Rollback documented and verified without destructive database rollback.
- [ ] Frontend/backend money contract preserves exact cent values.
- [ ] First remote GitHub Actions run verified and linked in README.

## Evidence for the products slice

See [verification.md](verification.md): 53 unit/HTTP tests and 6 PostgreSQL integration
tests passed; backend coverage exceeds 80% in all four metrics. This does not complete
the payment, frontend, race/oversell or deployed-environment acceptance checks.

- [x] CI workflow created with quality gates and promotion-source checks (remote run pending).
- [x] Initial migration and repeatable product seed verified on PostgreSQL 17.11.
- [x] BIGINT/string/bigint conversion verified beyond Number.MAX_SAFE_INTEGER.
- [x] Current ERD source and SVG export generated; full future checkout model documented separately.
- [ ] Docker Compose startup/build verified after Docker becomes available in WSL.
- [ ] Dependency audit findings reviewed and resolved with compatible updates.

## Evidence for the pending checkout slice

- [x] Cookie HttpOnly contains a random credential; PostgreSQL stores only its hash and expiry.
- [x] Session ownership checked for delivery and transaction access; no contact/address in status JSON.
- [x] Unexpected card fields and malformed/oversized bodies rejected without echoing received values.
- [x] Strict DTO validation, CORS with credentials, custom anti-CSRF header and per-process throttling tested.
- [x] Concurrent duplicate requests create one PENDING transaction and one reservation.
- [x] Eight buyers competing for three units create exactly three reservations.
- [x] Failed transaction insertion rolls back the stock reservation.
- [x] Expired unstarted reservation releases once; a started payment is not released by time alone.
- [x] WSL local commands discover the current Docker container address without modifying .env.
- [ ] Provider payment confirmation, decline, webhook and reconciliation verified (next slice).
- [ ] AWS shared/distributed rate controls and production cookie routing verified during deployment.

See [payment security](payment-security.md), [Swagger walkthrough](checkout-testing.md)
and measured [verification](verification.md). Stock confirmation/decrement after payment
is not implemented yet; frontend refresh UX and provider idempotency remain pending.
