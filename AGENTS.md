# Project instructions — Blush Atelier

## Mission
Build the assessment described in `docs/requirements.md`. Treat the supplied assessment PDF as the source of truth. Do not add Vercel or requirements that are not in the PDF. Deployment target: AWS only.

## Non-negotiable assessment rules
- Frontend: SPA using React or Vue only; this project uses React + TypeScript + Vite.
- Redux or Vuex is mandatory; use Redux Toolkit.
- Backend: JavaScript/TypeScript with NestJS, Grappe or Sinatra; this project uses NestJS + TypeScript.
- No Rails or unapproved frameworks.
- Business rules must not live in controllers.
- Use strict Hexagonal Architecture / Ports & Adapters and Railway Oriented Programming (ROP).
- PostgreSQL is the selected database; seed dummy products. No product-creation endpoint is required.
- Jest is mandatory in frontend and backend. Each must exceed 80% coverage. Report actual measured results.
- Payment tests must use Wompi Sandbox only. Never make real-money transactions.
- Public GitHub repository. Repository name must not contain the company name.
- Deploy frontend and backend to AWS and document working public URLs.
- Include DB model in README and public Swagger URL or Postman collection.

## Architecture boundaries (strict)
### Domain
- Entities, value objects, domain policies, domain errors, and port interfaces.
- No imports from NestJS, TypeORM, React, Redux, Wompi SDK/client, AWS SDK, or HTTP frameworks.
- No persistence decorators or provider-specific types.
### Application
- Use cases/application services, input/output DTOs, orchestration, and typed Result.
- Depend on domain abstractions/ports, never concrete infrastructure adapters.
- Keep business rules here or in domain objects, never in controllers.
### Infrastructure
- Nest controllers/modules, DI wiring, TypeORM entities/migrations/repositories, Wompi adapter, AWS adapters, HTTP clients, config, logging.
- Infrastructure implements domain ports.
- Map ORM models to domain entities; do not leak ORM entities into domain/application.
### Presentation
- React pages/components call typed API clients and Redux actions/thunks.
- Components do not contain payment orchestration or business rules.
- Redux state contains only safe checkout progress and backend references/status.

## ROP conventions
- Use a discriminated union: `Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`.
- Expected business failures are typed Results, not exceptions.
- Compose/branch on Results explicitly; avoid deeply nested try/catch.
- Unexpected infrastructure failures may throw internally, but translate them at adapter/use-case boundaries into controlled errors.
- Controllers map application Results to correct HTTP status and response contracts.
- Never silently swallow errors.

## Payment and security rules
- Sandbox only. Use environment variables for all keys and secrets.
- Never commit `.env`, private keys, event secrets, integrity secrets, access tokens, passwords, or credentials.
- Keep Wompi private key and integrity/event secrets on the backend only. Public key may be used in frontend only where the documented integration requires it.
- Do not persist or log full card number, CVV/CVC, PIN, or sensitive authentication data. Prefer provider-hosted/tokenized card collection and send only the provider token/reference to the backend. Confirm the exact Sandbox flow against current Wompi docs before implementing.
- Never treat a frontend redirect or client-side status as proof of payment. Verify status server-side with Wompi and/or authenticated webhook plus server-side API lookup.
- Validate webhook authenticity according to provider documentation. Make webhook handling idempotent.
- Backend is authoritative for product price, fees, shipping calculation, stock, and transaction state.
- Prevent duplicate payment attempts and duplicate stock decrement. Use idempotency and database transactions/locking or conditional updates for stock reservation/confirmation/release.
- Never mark a transaction paid merely because the browser says so.
- Validate and normalize inputs; use parameterized ORM queries; apply least privilege; avoid sensitive data in logs.
- Configure CORS to the deployed frontend origin, HTTPS in production, security headers, rate limiting on sensitive endpoints, safe error messages, and request size limits.
- Use TLS for external connections where supported. Do not claim that application-level encryption replaces TLS.
- Persist only safe resumable checkout data in localStorage (e.g. product ID, backend transaction ID, step, non-sensitive status). Never store PAN/CVV or secrets there.

## Required business flow
1. Product page: product information and stock.
2. Credit card + delivery information.
3. Payment summary: product amount + base fee + delivery fee.
4. Payment result.
5. Return to product page with refreshed stock.
Create a backend PENDING transaction before payment processing. Update status from verified provider result. Assign delivery/product and update stock consistently with the agreed business rules.

## Data model and diagrams
- Design the schema before implementing repositories.
- Include at minimum products/stock, customers, deliveries, and transactions.
- Add appropriate constraints, indexes, foreign keys, timestamps, and transaction status enum/check.
- Decide and document how stock reservation works to avoid overselling.
- Generate `docs/erd.mmd` using Mermaid ER diagram syntax and render/export a readable image (e.g. `docs/erd.png`) if tooling is available. Keep Mermaid source in repo even if image export is unavailable.
- Add a data dictionary and explain important relationships in README.
- Keep the diagram synchronized with migrations/entities; update it when schema changes.

## Testing and quality gates
- Jest in both apps; do not substitute Vitest.
- Add meaningful unit tests for domain policies, use cases, adapters where practical, API validation, and React components/state/API behavior.
- Test success, validation failures, provider declines/errors, duplicate webhook, refresh/resume, insufficient stock, duplicate requests, and race/oversell behavior.
- Coverage must be >80% in each app; report the actual output. Do not game coverage by excluding meaningful code or writing trivial tests.
- Run format/lint/typecheck/tests/build after meaningful milestones.
- Add tests while implementing each vertical slice, not at the end.

## UI direction
- Visual identity: premium cosmetics / inventory boutique, palette of warm beige, blush pink, rose, cocoa and restrained metallic accents.
- Polished, memorable, mobile-first UI. Avoid generic admin-template appearance.
- Product imagery must load efficiently; use responsive image sizing, sensible formats, dimensions/aspect ratios, lazy loading below the fold, and graceful fallbacks.
- Accessible contrast, labels, keyboard navigation, visible focus, clear validation and loading/error/success states.
- Use CSS Grid/Flexbox thoughtfully; prevent overflow at iPhone SE reference size and wider breakpoints.
- A small inventory/operations accent can make the store feel credible, but do not let an optional dashboard delay the required checkout.

## Code comments and explainability
- Write concise, natural comments only where they explain a non-obvious decision, invariant, security boundary, or tricky flow.
- Comments should sound like a developer explaining why/how, not generic AI narration.
- Do not comment every line or restate the code.
- For every important module/use case, provide a short plain-language explanation in `docs/decisions-and-interview-notes.md`: what it does, why it exists, how data flows, and likely interview questions.
- Do not implement concepts the candidate cannot explain. When using an unfamiliar library/pattern, explain it and ask for confirmation before adding unnecessary complexity.

## Workflow for Codex
1. Read this file and all relevant skills before coding.
2. Read `docs/requirements.md` and `docs/acceptance-checklist.md`.
3. Inspect repository and toolchain; do not overwrite existing work.
4. Propose a small implementation plan for the current vertical slice.
5. Implement one slice at a time; summarize changed files and design decisions.
6. Run relevant tests and report exact commands/results.
7. Explain the code in clear Spanish, including what the candidate should understand for an interview.
8. Do not claim a feature, test, coverage threshold, security control, or deployment works unless verified.
9. Keep commits small and meaningful. Use feature branches where practical.
10. Never put credentials in source code, README, screenshots, commits, or logs.

## Delivery definition
- Working public AWS frontend URL and API URL.
- Public GitHub repository with no secrets.
- Complete README with setup, env var names (not values), architecture, ERD/data model, API docs, test commands and measured coverage, deployment steps and URLs.
- Working end-to-end Sandbox checkout and stock update.
- Frontend and backend Jest coverage each >80%.
- Acceptance checklist completed with evidence.

## Two-repository organization
This repository is independent: frontend React or backend NestJS. The sibling repository is linked via README and API contracts. Never require a monorepo. AWS only; do not deploy to Vercel.

## Backend repo specific
Generate `docs/erd.mmd` and a rendered ERD if possible. Maintain migrations, seeds, Swagger and architecture diagrams. Use Repository/Adapter/Dependency Injection patterns. Strategy only when there are real alternative rules; do not overengineer.


## GitHub Actions CI/CD (project value-add, not an explicit rubric item)
- GitHub organization: `blush-atelier`; independent public repositories: `blush-atelier-web` (frontend) and `blush-atelier-api` (backend).
- On pull requests and pushes to development, staging and production, run npm ci, lint, TypeScript check, Jest with coverage thresholds >80%, and build. Configure commands against actual package.json scripts; never invent passing results.
- Deploy to AWS only after CI passes on production and AWS infrastructure is verified. Frontend: S3/CloudFront. Backend: Lambda/API Gateway.
- Use GitHub Actions OIDC with scoped AWS IAM role; avoid permanent AWS access keys. Never expose payment keys or AWS credentials in frontend, workflows or logs.
- Use minimal permissions, pinned/maintained actions, concurrency controls, and deploy only from protected production.
- Document pipeline behavior and status in README.

## Approved branch and environment policy
- Permanent branches: development (local), staging (validation), production (AWS delivery). Short feature/* branches.
- Promote by PR: feature/* -> development -> staging -> production. Wompi Sandbox in every environment.
- Evaluate costs before adding AWS environments; prioritize one functional production infrastructure.
