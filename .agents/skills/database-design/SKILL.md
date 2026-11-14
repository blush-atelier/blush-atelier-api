# Skill: PostgreSQL data modeling and ERD

## Core entities
Model at least Products/Inventory, Customers, Deliveries and Transactions. Add PaymentAttempt/WebhookEvent only when they materially support payment traceability and idempotency.

## Modeling rules
- Define primary keys, foreign keys, unique constraints, indexes and timestamps.
- Store money as integer minor units (or a precise decimal strategy); never use floating-point for currency.
- Define transaction status transitions and constraints.
- Decide stock reservation strategy and ensure concurrent purchases cannot oversell.
- Avoid storing card PAN/CVV or provider secrets.
- Keep customer/delivery data limited to what fulfillment requires.
- Use migrations and deterministic seed data.

## Required artifacts
- `docs/erd.mmd`: Mermaid ER diagram source.
- `docs/erd.png` or SVG if a renderer is available; if not, retain Mermaid source and ensure README renders it.
- Data dictionary describing fields, relations, indexes and status meanings.
- Keep ERD synchronized with actual migrations and ORM mappings.
