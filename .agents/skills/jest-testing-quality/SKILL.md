# Skill: Jest testing and quality gates

## Mandatory
Jest in frontend and backend. Each coverage report must exceed 80%. Do not replace Jest with Vitest.

## Approach
- Write tests alongside each vertical slice.
- Prioritize domain policies and application use cases, then adapter/controller contracts and UI state/flows.
- Mock external Wompi calls; never charge real money.
- Test happy path and failure paths.
- Include duplicate webhook/idempotency, insufficient stock, concurrent/duplicate checkout, provider decline, refresh recovery, and invalid input.
- Use deterministic fixtures and clean database state between integration tests.
- Avoid tests that merely execute lines without asserting behavior.
- Configure meaningful coverage thresholds and include exact commands in README.
- Report actual coverage output; never claim >80% until both reports confirm it.
