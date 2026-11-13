# Skill: React + Redux Toolkit checkout

## Stack
React + TypeScript + Vite, React Router, Redux Toolkit, typed API client, CSS Grid/Flexbox, Jest + React Testing Library.

## UI flow
Product → card/delivery modal or screen → payment summary/backdrop → result → refreshed product/stock.

## State rules
- Redux stores safe progress: product ID, current step, backend transaction ID/reference, delivery progress if non-sensitive, and verified status.
- Never persist PAN, CVV/CVC, PIN, private keys, integrity secrets, or raw provider credentials.
- Prefer provider tokenization/hosted card fields per official Wompi documentation. Keep any short-lived token handling minimal.
- Use typed async thunks or RTK Query only if justified; keep API concerns out of presentational components.
- Components render state and dispatch actions; they do not calculate authoritative totals or decide payment success.
- Backend owns price, fees, delivery fee, stock and transaction state.

## UX
- Premium cosmetics store: beige, blush pink, rose, cocoa, subtle metallic accents.
- Mobile-first; test iPhone SE reference viewport and larger breakpoints.
- Clear field errors, loading, disabled submit, pending, declined, failed and success states.
- Accessible labels, keyboard flow, focus states, contrast, and no horizontal overflow.
- Optimize product images and provide fallback.

## Testing
Jest + React Testing Library. Test validation, step navigation, Redux transitions, API pending/success/error, refresh recovery, and stock refresh.
