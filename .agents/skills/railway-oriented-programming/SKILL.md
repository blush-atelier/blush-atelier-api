# Skill: Railway Oriented Programming (ROP)

## Purpose
Make expected success/failure paths explicit and composable in application use cases.

## Standard
Use:
`type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };`

- Define meaningful error unions per use case (e.g. ProductNotFound, InsufficientStock, InvalidPaymentState, ProviderDeclined).
- Return `Result` from use cases for expected business outcomes.
- Keep exceptions for unexpected failures (network outage, database unavailable, programming defect).
- Convert infrastructure exceptions into controlled application errors at a deliberate boundary.
- Do not use `any`, null-as-error, magic strings, or empty catch blocks.
- Avoid nesting; use small helpers or explicit early returns.
- Controller maps each error case to a suitable HTTP status and safe response body.
- Log diagnostic context without card data, credentials, or secrets.

## Testing
Test success and each expected failure branch. Verify no stock mutation or duplicate side effect on failed paths.
Document a concrete example in interview notes.
