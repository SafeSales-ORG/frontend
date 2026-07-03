# Backend TODO — what the frontend needs that the backend doesn't have yet

**Verified 2026-06-08** by diffing the frontend's real HTTP calls
(`src/lib/api/http.ts` + `src/hooks/useUploadFile.ts`) against the live backend
routes + Prisma schema in `Fejo/safe-sales-backend`.

> **Good news first:** the backend already implements almost the entire contract.
> The older `API_CONTRACT.md` / `FOR_BACKEND.md` in this repo are now **stale** —
> ship / release / dispute / respond / admin-resolve / PATCH-listings / GET-order /
> seller-orders / simulate-payment all exist. This file is the *current* short list
> of real gaps.

---

## A. Missing endpoints (need to be built)

### 1. `POST /api/orders/:token/deliver`
- **Frontend call:** `apiClient.deliverOrder(token)` → no body, expects `{ order }`.
- **What it does:** seller (or buyer) marks the order **delivered** — the
  intermediate step between `shipped` and `completed`.
- **Backend status:** the `delivered` enum value **already exists** in
  `EscrowStatus`, and `release`/`dispute` already accept `delivered` as a valid
  prior state — there's just **no route that writes it**. So this is a thin
  handler: guard `status === 'shipped'`, set `status = 'delivered'`, return `{ order }`.

### 2. `POST /api/upload`
- **Frontend call:** `useUploadFile` → `POST /api/upload` with JSON
  `{ dataUrl: "<base64 data URL>", filename: string }`, expects `{ url: string }`.
- **Used for:** listing images, seller shop avatar, dispute evidence photos.
- **Backend status:** **no route at all.** In demo mode the frontend returns a
  local `data:` URL so images work offline; against the real backend the call
  404s and image upload is dead. Needs a route that stores the image (S3 /
  Cloudinary / Blossom / disk) and returns a permanent `https` URL.

---

## B. Missing DB columns / fields (schema + response changes)

### 3. `Listing.deliveryFee` (Int, whole NGN)
- Frontend sends `deliveryFee` in `POST /api/listings` **and** `PATCH /api/listings/:id`,
  and reads `listing.deliveryFee` to show the buyer a delivery line before payment.
- Backend `Listing` model has **no `deliveryFee` column** → the value is silently dropped.

### 4. `Order.itemNGN` + `Order.deliveryFee` (Int, whole NGN)
- Frontend reads `order.itemNGN` (item subtotal) and `order.deliveryFee` to show
  the buyer/seller an itemised breakdown (item + delivery = total).
- Backend `Order` stores only `amountNGN` (the total). Either:
  - **(preferred)** add `itemNGN` + `deliveryFee` columns and set
    `amountNGN = itemNGN + deliveryFee` at order creation, **or**
  - accept that the UI can only ever show the combined total.

### 5. `Seller.avatarUrl` (String?, https)
- Frontend sends `avatarUrl` in `POST /api/sellers` and reads `seller.avatarUrl`
  for the shop avatar across the app.
- Backend `Seller` model has **no `avatarUrl` column** → avatar never persists.
  (Depends on #2 to actually get a URL to store.)

---

## C. Shape mismatches (align serialization, no new endpoint)

### 6. Dispute: seller response + evidence shape
- **Frontend reads:** `dispute.sellerResponse` (a single string) and
  `dispute.evidence` (array of `{ url, by: "buyer"|"seller", at }`).
- **Backend stores:** `responses` (Json **array** of `{ stance, message, at }`)
  and `returnEvidence` (Json). The `sellerResponse` / `evidence[]` fields the
  frontend reads are **never produced**.
- **Two sub-issues:**
  1. On `GET /api/orders/:token` and `GET /api/admin/disputes`, the backend
     should surface `sellerResponse` (e.g. the latest seller `message`) and a
     normalised `evidence[]` array — **or** we point the frontend at
     `responses` / `returnEvidence` instead. Pick one and make both sides agree.
  2. `POST /api/disputes/:id/respond` accepts `evidence?: string[]` from the
     frontend but currently stores only `stance` + `message` + `at` — **seller
     evidence photos are dropped.** Persist them too.

### 7. `Seller.bankCode` on signup
- MavaPay payouts need `bankCode`; the backend `Seller` has a `bankCode` column.
- Frontend `POST /api/sellers` currently sends `bankName` / `bankAccount` /
  `bankHolder` but **not** `bankCode`. Either the frontend adds a bank picker
  that sends the code, or the backend derives `bankCode` from `bankName`.

---

## D. Already on the backend — frontend just isn't using it yet (reverse gaps)

Not backend work — noting so we don't duplicate. These routes exist but the
frontend currently uses client-side aggregation / different surfaces:

- `GET /api/sellers/:npub/earnings` — Earnings page aggregates client-side off
  seller-orders instead. Could be wired to this for real payout history.
- `PATCH /api/sellers/:id/payout` — payout/bank update.
- `GET /api/sellers/:handle` — public storefront (frontend storefront deferred).
- `GET /api/admin/disputes/:id` — single-dispute fetch (frontend uses the list).

---

## Endpoint-by-endpoint status (frontend call → backend)

| Frontend call (`http.ts`) | Backend route | Status |
|---|---|---|
| `createSeller` | `POST /api/sellers` | ✅ (add `avatarUrl`, `bankCode`) |
| `createListing` | `POST /api/listings` | ✅ (add `deliveryFee`) |
| `updateListing` | `PATCH /api/listings/:id` | ✅ (add `deliveryFee`) |
| `getListing` | `GET /api/listings/:id` | ✅ |
| `getSellerOrders` | `GET /api/orders/seller/:npub` | ✅ |
| `createOrder` | `POST /api/orders` | ✅ (item/delivery split — see B4) |
| `confirmPayment` | `POST /api/orders/:token/simulate-payment` | ✅ (demo only) |
| `getOrder` | `GET /api/orders/:token` | ✅ (dispute shape — see C6) |
| `deliverOrder` | `POST /api/orders/:token/deliver` | ❌ **build (A1)** |
| `releaseOrder` | `POST /api/orders/:token/release` | ✅ |
| `openDispute` | `POST /api/orders/:token/dispute` | ✅ |
| `shipOrder` | `POST /api/orders/:token/ship` | ✅ |
| `respondToDispute` | `POST /api/disputes/:id/respond` | ✅ (drops evidence — see C6) |
| `getDisputes` | `GET /api/admin/disputes` | ✅ |
| `resolveDispute` | `POST /api/admin/disputes/:id/resolve` | ✅ |
| `useUploadFile` | `POST /api/upload` | ❌ **build (A2)** |

**Net: 2 endpoints to build (`/deliver`, `/upload`), 3 columns to add
(`Listing.deliveryFee`, `Order.itemNGN`+`deliveryFee`, `Seller.avatarUrl`),
and the dispute response/evidence serialization to align.**
