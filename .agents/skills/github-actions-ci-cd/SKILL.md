# GitHub Actions CI/CD — Blush Atelier

This is a voluntary value-add, not an explicit requirement or separately scored item in the assessment.

## CI
- Implement `.github/workflows/ci.yml` in each repository after project scaffold and npm scripts exist.
- Trigger on PR and push to main. Use `npm ci`, lint, TypeScript check, `npm test -- --coverage --watch=false` or correct Jest CLI for actual scripts, and production build.
- Require >80% measured coverage in each repository. Use realistic tests and upload coverage as artifact if useful.
- Prefer minimal workflow permissions (`contents: read`), dependency caching and cancel-in-progress for PRs.

## CD (only once AWS is provisioned)
- Deploy on successful main CI, with explicit approval/guard for production if practical.
- Frontend: upload built assets to S3 and invalidate CloudFront.
- Backend: package/deploy NestJS Lambda and verify API Gateway health.
- Use GitHub OIDC federated role with restricted trust policy for org/repo/branch; no long-lived AWS access keys.
- Avoid exposing database/payment secrets to GitHub Actions unless absolutely necessary; prefer protected AWS runtime config.
- Do not hardcode account IDs, bucket names, ARNs, domains or claim deployment works before verification.
