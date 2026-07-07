# SafeSale — Frontend

> **Secure Naira escrow for social-commerce sellers — works wherever you can paste a link.**

Instagram, WhatsApp, TikTok, X, Telegram, Threads, Linktree — anywhere a Nigerian
seller can share a URL, SafeSale lets buyers pay safely. The buyer's Naira is held
in escrow and only released to the seller once the buyer confirms delivery. If
something goes wrong, a mediator resolves the dispute.

This repository is the **web frontend only**. The backend (payments, escrow,
orders, disputes) lives in a separate repository.

---

## The problem

Millions of social-commerce transactions happen weekly between parties who don't
know each other. Buyers fear "pay-before-delivery" scams; sellers fear
"ship-before-payment" theft. SafeSale sits in the middle as a neutral escrow:

1. **Buyer pays** into a bank account via **Nomba** (Naira bank transfer).
2. **Funds are held in escrow** — neither party can move them unilaterally.
3. **Seller ships**, buyer marks delivered, buyer **releases** → seller is paid out.
4. **Dispute?** A mediator reviews both sides' evidence and resolves
   (refund buyer / release seller / split).

Sellers sign up with **email/password or Google** — a normal account, no wallet
or keys to manage. The buyer needs no account at all: the order-link URL itself
is their credential. (Internally the backend mints a messaging keypair per seller
that users never see or handle.)

Built for the **DevCareer × Nomba** hackathon.

---

## Tech stack

- **React + TypeScript** (Vite)
- **Tailwind CSS 4** + **shadcn/ui** components, **lucide-react** icons
- **TanStack Query** for server state
- **JWT auth** (email/password + Google) via `useAuth` — see `src/lib/auth/`
- Listing images are downscaled/compressed to `data:` URLs client-side (no
  external image host)
- All backend access goes through a single API seam in
  [`src/lib/api/`](./src/lib/api/) (`client.ts` → `http.ts` real / `mocks.ts` demo).

---

## Getting started

```bash
npm install
cp .env.example .env   # then fill in the values below
npm run dev            # http://localhost:8080
```

### Build / check

```bash
npm run build          # production build → dist/
npx tsc --noEmit       # type-check
npx eslint .           # lint
npm test               # vitest
```

---

## Environment

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL (e.g. the deployed backend, or `http://localhost:3000`). |
| `VITE_DEMO_MODE` | `true` runs the whole app on an in-memory mock (no backend) and unlocks `/admin` — useful for UI work and demos. `false` uses the real backend. |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID (for "Continue with Google"). |
| `VITE_GOOGLE_ENABLED` | `true` shows the Google sign-in button. Leave unset/`false` to hide it (until the OAuth origins are configured). |
| `VITE_MEDIATOR_EMAIL` | The mediator account's email; only this account can access `/admin`. |
| `VITE_APP_URL` | Public app URL, used in shared links. |
| `VITE_SUPPORT_EMAIL` / `VITE_SUPPORT_WHATSAPP` | Shown in the Help dialog (optional). |

> **Demo mode** is the fastest way to click through the whole flow with no backend.
> Set `VITE_DEMO_MODE=true` and run `npm run dev`.

---

## Backend contract

The frontend and backend talk over a fixed HTTP contract. The single source of
truth for request/response shapes is [`src/lib/api/types.ts`](./src/lib/api/types.ts)
and the calls in [`src/lib/api/http.ts`](./src/lib/api/http.ts).

[`BACKEND_TODO.md`](./BACKEND_TODO.md) tracks the endpoints/fields the frontend
needs that the backend hasn't implemented yet — hand it to whoever owns the
backend.

---

## Project structure

```
src/
  components/        UI — shadcn primitives (ui/), app shell + SafeSale-specific (safesale/), auth/
  hooks/             data hooks (useSellerOrders, useListing, useUploadFile, …)
  lib/
    api/             the backend seam: client.ts, http.ts, mocks.ts, types.ts
    auth/            JWT session store (session.ts)
    store/           local demo store (marketStore)
  pages/             routes — buyer flow (Checkout, BuyerOrder), Onboarding, Admin
    app/             seller dashboard (DashboardHome, ListingsPage, Orders, Earnings, Dispute)
NIP.md               internal messaging-event spec (legacy; users never touch it)
BACKEND_TODO.md      what the backend still needs to implement
```
