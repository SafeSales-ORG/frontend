# Status — frontend checkpoint (2026-06-08)

Point-in-time snapshot of this frontend at the moment it was copied into the
organisation repo. Delete or update this file once the repo has its own history.

## Health (verified 2026-06-08)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx eslint .` | ✅ clean |
| `npx vite build` | ✅ exit 0 |
| Dead refs (cashu / emailjs / bitnob) | ✅ none |
| `.env.example` + `.gitignore` | ✅ correct (`.env` ignored, `.env.example` kept) |

## What this is

The **web frontend only** for SafeSale (Nomba / NGN bank-transfer escrow, Nostr
identity + listings). Backend is a separate repo. All backend access goes through
the seam in `src/lib/api/` — `client.ts` picks `http.ts` (real) or `mocks.ts`
(demo) based on `VITE_DEMO_MODE`.

Screens are complete and wired: seller onboarding, dashboard, listings (create +
edit + out-of-stock), orders (list + detail + ship), earnings, buyer
checkout/order (release + dispute), seller dispute response, and the mediator
admin queue (`/admin`, gated by `VITE_MEDIATOR_NPUB`).

## Run it

```bash
npm install
cp .env.example .env      # set VITE_API_URL + VITE_DEMO_MODE
npm run dev               # http://localhost:8080
```

- **Demo mode** (`VITE_DEMO_MODE=true`): whole app runs on an in-memory mock, no
  backend needed, `/admin` unlocked. Best for UI work and walking the flow.
- **Real backend** (`VITE_DEMO_MODE=false`): set `VITE_API_URL` to the deployed
  backend.

## What's next

- **Backend gaps:** see [`BACKEND_TODO.md`](./BACKEND_TODO.md) — 2 endpoints to
  build (`POST /api/orders/:token/deliver`, `POST /api/upload`), 3 columns to add
  (`Listing.deliveryFee`, `Order.itemNGN`+`deliveryFee`, `Seller.avatarUrl`), and
  the dispute response/evidence shape to align.
- **First real-backend smoke test** (flip `VITE_DEMO_MODE=false`) is the best way
  to surface the dispute-shape mismatch live — it's the gap most likely to break
  silently.

## Notes for the copy

- `.env` is local-only (gitignored) — do **not** commit it; `.env.example` is the
  template.
- `node_modules/` is gitignored — run `npm install` after copying.
