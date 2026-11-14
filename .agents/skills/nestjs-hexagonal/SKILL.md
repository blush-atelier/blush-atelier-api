# Skill: NestJS + strict Hexagonal Architecture

Use this skill for backend design and implementation.

## Required structure
Organize by business capability, then by layer. Example:
- `products/domain`
- `products/application`
- `products/infrastructure`
- `transactions/domain`
- `transactions/application`
- `transactions/infrastructure`
- `customers/...`
- `deliveries/...`
- `payments/...`
Shared kernel only for genuinely shared concepts.

## Rules
1. Domain defines entities, value objects, domain errors, policies, and ports.
2. Application defines use cases and orchestration. It imports domain abstractions only.
3. Infrastructure contains NestJS controllers/modules, TypeORM repositories/entities, provider clients, and configuration.
4. Controllers must not calculate totals, change stock, call TypeORM repositories directly, or call Wompi directly.
5. Use injection tokens for ports. Bind implementations in Nest modules.
6. Keep ORM entities separate from domain entities; map explicitly.
7. Validate HTTP DTOs at the boundary. Revalidate invariants in domain/application where needed.
8. Use database transactions and appropriate locking/conditional updates for stock consistency.
9. Use migrations; do not rely on schema synchronization in production.
10. Add tests for each use case and adapter boundary.

## Example request flow
HTTP Controller → Input DTO validation → Application Use Case → Domain Port → Infrastructure Adapter → PostgreSQL/Wompi → Result → HTTP response.

## Deliverables
- Explain folder responsibilities in README.
- Include an architecture diagram.
- Include one sequence diagram for checkout/payment.
- Add an interview note explaining one complete request flow.
