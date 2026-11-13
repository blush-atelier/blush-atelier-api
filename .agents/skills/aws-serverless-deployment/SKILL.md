# Skill: AWS deployment with cost control

## Target architecture
- React static build: S3 private origin + CloudFront public HTTPS distribution.
- NestJS API: Lambda + API Gateway.
- PostgreSQL: evaluate RDS PostgreSQL only after checking account Free Tier/credits, current regional pricing, instance/storage/backup costs and network requirements.
- Never promise RDS is free. A database may incur charges even when app compute is within a free allowance.
- If RDS is not cost-safe or practical for the deadline, propose a low-cost managed PostgreSQL alternative transparently, but ask before changing the selected AWS database target.
- Do not deploy to Vercel or another frontend host; assessment target is AWS.

## Safety and operations
- Use separate local and production environment variables.
- Store production secrets in AWS Secrets Manager or encrypted Lambda environment configuration with least privilege; never in frontend bundle.
- Restrict database network access to backend only. Do not expose PostgreSQL publicly.
- Enable HTTPS, CORS allowlist, security headers and safe logs.
- Configure AWS budget alert before creating billable resources.
- Use migrations and seed scripts; never run destructive schema sync in production.
- Document deploy, rollback, URLs and approximate cost assumptions.
- Verify deployed frontend calls deployed API and complete a Sandbox checkout.
