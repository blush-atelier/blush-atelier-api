# Requirements extracted from the FullStack Development Test

This document separates explicit requirements from optional improvements. The assessment PDF is the authority.

## A. Explicit functional requirements
1. Show a product with description, price, and available stock.
2. Provide a "Pay with credit card" action.
3. Open a modal to collect credit-card information.
4. Validate card data. Visa/Mastercard detection logos are a plus.
5. Collect delivery information.
6. Show a payment summary containing product amount, always-added base fee, and delivery fee.
7. Show the payment action in a backdrop component.
8. On payment:
   - Create a PENDING transaction in the backend and obtain its transaction number.
   - Call Wompi to complete payment.
   - Update the backend transaction with verified payment result.
   - Assign the product for delivery.
   - Update product stock.
9. Show final transaction result and return to product page with updated stock.
10. Recover customer progress after refresh.
11. API must manage stock, transactions, customers, and deliveries with different request types.
12. Seed database with dummy products. No product creation endpoint is required.

## B. Explicit frontend requirements
- SPA built with React or Vue only (selected: React).
- Mobile-oriented responsive design; minimum reference is iPhone SE (2020), 1334 x 750 pixels as stated in PDF.
- Redux or Vuex mandatory (selected: Redux Toolkit).
- Securely retain payment transaction progress in application state or localStorage.
- UI interactions must work and stay within screen boundaries.
- CSS framework is optional; Flexbox/Grid are encouraged.

## C. Explicit backend requirements
- API in JavaScript/TypeScript or Ruby using NestJS, Grappe, or Sinatra (selected: NestJS + TypeScript).
- No Rails or other backend frameworks.
- Business logic must not live in routes/controllers.
- Try Hexagonal Architecture / Ports & Adapters.
- Try Railway Oriented Programming for use cases.
- Any DB/ORM allowed; PostgreSQL or DynamoDB recommended (selected: PostgreSQL + TypeORM).
- Include data model design in README.

## D. Explicit quality and delivery requirements
- Jest unit tests in frontend and backend.
- More than 80% coverage in both frontend and backend.
- Add measured test results to README.
- Publish app using a cloud provider; AWS is recommended.
- Add public Swagger URL or Postman collection to README.
- Public GitHub repository; do not include the company name in repository name.
- Deliver frontend app, backend API, public GitHub repository with README, and deployed working app connected to backend API.
- Minimum score to continue: 100 points.

## E. Scoring
### Base (100 points)
- README completed correctly: 5
- Fast-loading images and no UI/UX overflow: 5
- Full credit-card checkout onboarding: 20
- API works correctly: 20
- More than 80% Jest coverage across frontend and backend: 30
- App and API deployed through a cloud provider: 20

### Bonus (up to 50 points)
- OWASP alignment, HTTPS, security headers: 5
- Fully responsive and works in different browsers: 5
- CSS skills: 10
- Clean code: 10
- Hexagonal Architecture with Ports & Adapters: 10
- ROP: 10

## F. Chosen implementation decisions (not extra assessment requirements)
- Single public monorepo: `smart-checkout-platform` (or another neutral name).
- Frontend: React + TypeScript + Vite + Redux Toolkit + React Router.
- Backend: NestJS + TypeScript.
- PostgreSQL + TypeORM; Docker Compose locally.
- Jest in both apps (do not leave Vite's default Vitest as the only test runner).
- AWS: S3 + CloudFront for frontend; Lambda + API Gateway for backend; evaluate RDS PostgreSQL for database.
- Wompi Sandbox only.
- Premium cosmetics storefront visual style: beige/blush/rose/cocoa. Product and inventory content should make the stock requirement obvious.

## G. Valuable additions, only after all required flows work
- Product mini-cart/checkout basket (keep scope small; one product is enough if the test's single-product story is preserved).
- Inventory availability indicator and low-stock state.
- Transaction reference/status timeline.
- Order/delivery tracking summary.
- Admin-style inventory view only if it does not delay checkout, tests, or deployment.
- Interview notes and architecture decision records.
