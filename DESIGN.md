---
version: 1
name: SafeSale
description: Naira escrow for social-commerce. Wise-inspired — high-contrast forest green and mint, heavy display headlines, tabular money figures, flat surfaces — with purposeful motion that shows money moving through escrow.
references:
  - ../design-refs/wise.DESIGN.md — structure: single accent, tinted canvas, heavy display type, generous radius, surface-contrast elevation
  - ../design-refs/stripe.DESIGN.md — money typography (tabular figures), checkout + dashboard density, hairline tables

colors:
  # Wise-style pairing in SafeSale's emerald family (Wise uses #163300 / #9fe870;
  # we keep our own hues so SafeSale doesn't read as a Wise clone).
  forest: "#0B3A2A"           # primary buttons, headings on mint, dark bands, footer
  forest-hover: "#0F4A36"
  mint: "#9DF2C0"             # hero field, text on forest buttons, highlights
  mint-soft: "#C9F7DC"        # soft mint cards
  # Emerald — links, icons, status, "funds secured" panels.
  brand: "#0E6B4E"
  brand-hover: "#0B5A41"
  brand-active: "#08472F"
  brand-pale: "#E4F2EA"
  brand-ink: "#0A3F2D"        # text on brand-pale
  on-brand: "#FFFFFF"

  # Neutrals — sage-tinted, never pure grey
  ink: "#111613"              # headings, primary text
  body: "#3D4540"             # paragraph text
  mute: "#6A736D"             # captions, helper text, placeholders
  canvas: "#FFFFFF"           # cards, inputs, app content
  canvas-soft: "#F3F5F2"      # page background, secondary buttons, table headers
  canvas-sunken: "#E9EDE8"    # hover rows, skeletons, segmented controls
  line: "#E1E6E1"             # hairline borders, dividers
  line-strong: "#C7CEC8"      # input borders

  # Semantic — status only, never decoration
  info: "#1D5FD1"
  info-pale: "#E8F0FD"
  warning: "#9A5B00"
  warning-pale: "#FDF3DC"
  negative: "#C2312F"
  negative-pale: "#FCEBEA"
  # Positive reuses brand (brand-ink on brand-pale). In an escrow product,
  # "money is safe" and "success" are the same message.

colors-dark:
  brand: "#3DBB8A"
  brand-hover: "#5ACB9E"
  brand-active: "#2FA176"
  brand-pale: "#12291F"
  brand-ink: "#9BE3C3"
  on-brand: "#06140E"
  ink: "#ECF1ED"
  body: "#C3CBC5"
  mute: "#8B948E"
  canvas: "#151A17"
  canvas-soft: "#0D110F"
  canvas-sunken: "#1D2420"
  line: "#252D28"
  line-strong: "#36403A"
  info: "#7FA8F5"
  info-pale: "#14213A"
  warning: "#F0B54A"
  warning-pale: "#2E2310"
  negative: "#F07571"
  negative-pale: "#341716"

typography:
  display: Manrope 700–800 for h1/h2 (stand-in for Wise Sans — chunky, geometric).
  family: Inter (Google Fonts) for everything else.
  features: '"cv11", "ss01"' globally; '"tnum"' on every money/number.
  display-2xl: { size: 72px, line: 72px, weight: 800, tracking: -0.04em }   # landing hero at xl widths
  display-xl: { size: 56px, line: 60px, weight: 800, tracking: -0.035em }   # landing hero only
  display-lg: { size: 44px, line: 48px, weight: 800, tracking: -0.03em }    # landing section heads
  h1:         { size: 32px, line: 38px, weight: 700, tracking: -0.02em }    # page titles
  h2:         { size: 24px, line: 30px, weight: 650, tracking: -0.015em }   # section titles
  h3:         { size: 18px, line: 26px, weight: 600, tracking: -0.01em }    # card titles
  body-lg:    { size: 18px, line: 28px, weight: 400 }                       # lead paragraphs
  body:       { size: 16px, line: 24px, weight: 400 }
  body-sm:    { size: 14px, line: 20px, weight: 400 }
  label:      { size: 14px, line: 20px, weight: 550 }                       # form labels, buttons-sm, nav
  caption:    { size: 12px, line: 16px, weight: 500 }                       # meta, table headers (uppercase +0.04em)
  money-xl:   { size: 40px, line: 44px, weight: 700, tracking: -0.02em, features: tnum }  # order total, balance
  money:      { size: inherit, weight: 600, features: tnum }

rounded:
  sm: 6px      # badges, checkboxes, small chips
  md: 10px     # inputs, selects, small buttons
  lg: 14px     # cards, panels, dialogs
  xl: 20px     # landing feature panels, checkout summary
  pill: 9999px # primary/secondary buttons, status badges, avatars

spacing:       # 4px base. Use Tailwind steps only: 1 2 3 4 6 8 12 16 24
  page-x: 16px mobile / 24px tablet / 32px desktop
  section-y: 64px mobile / 96px desktop (marketing); 32px (app)
  card-padding: 20px mobile / 24px desktop
  stack-gap: 16px between related items, 32px between groups

layout:
  marketing-max: 1200px
  app-max: 1120px
  reading-max: 640px   # checkout, buyer order page, forms
  breakpoints: { sm: 640px, md: 768px, lg: 1024px, xl: 1280px }

elevation:
  0: flat — default. Elevation comes from canvas (white) on canvas-soft (sage).
  1: 1px solid line — cards on white backgrounds, tables, inputs.
  2: "0 1px 2px rgb(17 22 19 / 0.06), 0 8px 24px rgb(17 22 19 / 0.08)" — ONLY floating layers: dialogs, popovers, dropdowns, toasts, sticky mobile pay bar.

motion:
  library: motion (motion/react). MotionConfig reducedMotion="user" wraps the app.
  duration: 150ms (press), 200–250ms (popovers, accordions, step swaps), 450ms (scroll reveal)
  easing: cubic-bezier(0.2, 0, 0, 1)
  rule: motion explains the product — money moving into escrow and out to the seller — or confirms an action. It never decorates.
---

# SafeSale design system

SafeSale holds other people's money. Every screen should feel like a bank
statement written by a friendly person: **calm, exact, and honest**. When in
doubt, remove decoration and make the numbers clearer.

## Principles

1. **Money is the hero.** Amounts are the largest, boldest, tabular-figure
   element on any transactional screen. Always `₦` + thousands separators
   (`₦125,000`), never `NGN 125000`. Kobo only when non-zero.
2. **Status is always visible.** Every order shows *where the money is right
   now* (Awaiting payment → Held in escrow → Shipped → Released) using the
   same badge + timeline everywhere.
3. **One accent.** Emerald is for the primary action and "your money is
   safe". If two things on screen are emerald, one of them is wrong.
4. **Surface contrast, not shadows.** White cards on sage canvas. Borders
   are hairlines. Shadows only on things that float.
5. **Say what happens next.** Every state ends with one clear next step and
   who is responsible for it (buyer, seller, SafeSale).
6. **Honest copy.** No invented testimonials, user counts, logos or
   licences. If a claim isn't true today, it doesn't ship.

## Colour usage

| Use | Token |
|---|---|
| Page background (marketing + app) | `canvas-soft` |
| Cards, inputs, dialogs | `canvas` |
| Headings / primary text | `ink` |
| Paragraphs | `body` |
| Helper text, captions, placeholders | `mute` |
| Primary button, links, focus ring, active nav | `brand` |
| Selected rows, "funds held" panel, positive badges | `brand-pale` + `brand-ink` |
| Dividers, card borders | `line` |
| Input borders | `line-strong` → `brand` on focus |

Never use raw Tailwind palette classes (`emerald-600`, `rose-50`,
`bg-white`, `text-gray-500`) in components. Only tokens.

## Escrow status language

One mapping, used by `EscrowStatus`, timelines, tables and emails:

| Backend status | Label | Badge | Next step copy |
|---|---|---|---|
| `pending_payment` | Awaiting payment | neutral (`canvas-sunken` / `body`) | Buyer: "Pay ₦X to the account below" |
| `funded` | Held in escrow | brand (`brand-pale` / `brand-ink`) | Seller: "Ship the item and add tracking" |
| `shipped` | Shipped | info | Buyer: "Confirm when it arrives" |
| `delivered` | Delivered | info | Buyer: "Release payment or report a problem" |
| `released` | Paid out | brand, solid icon | — |
| `disputed` | In dispute | warning | "A mediator is reviewing" |
| `refunded` | Refunded | neutral | — |
| `expired` *(planned — unpaid past the payment window)* | Expired | neutral, muted text | — |

Badge: pill, `caption` weight 550, 4px 10px padding, 6px leading dot in the
foreground colour. No icons-plus-dots, no gradients.

## Components

**Buttons** — height 44px (default), 36px (sm), 52px (lg, checkout pay
button only). `pill` radius. Label `label` (14px/550), lg uses 16px.
- *Primary*: `forest` bg, `mint` text; hover `forest-hover`. Max one per view region.
- *Mint*: `mint` bg, `forest` text — only on `forest` surfaces.
- *Secondary*: `canvas` bg, 1px `line-strong` border, `ink` text; hover `canvas-soft`.
- *Ghost*: transparent, `body` text; hover `canvas-sunken`.
- *Destructive*: `negative` text on `canvas` with `line-strong` border; filled `negative` only inside a confirm dialog.
- Loading: keep width, replace label with spinner + verb ("Paying…"). Disabled: 50% opacity, no hover.

**Inputs** — height 44px, `md` radius, 1px `line-strong`, `canvas` bg,
`body` 16px text (prevents iOS zoom). Label above (`label`, `ink`), helper
below (`body-sm`, `mute`), error below (`body-sm`, `negative`) replacing
helper. Focus: 2px `brand` ring at 2px offset. Money inputs: `₦` prefix
inside the field, tabular figures, right-aligned not required.

**Cards** — `canvas`, `lg` radius, 20/24px padding, no shadow. On a white
page add 1px `line`. Card header: `h3` + optional action link on the right.
Don't nest cards; use dividers inside one card instead.

**Money summary** (checkout, order page) — rows of label (`body-sm`, `mute`)
and value (`money`, right-aligned), hairline between groups, total row in
`h3`/`money`. The escrow-held amount sits in a `brand-pale` panel with a
lock icon and one sentence: "Held by SafeSale until you confirm delivery."

**Timeline** — vertical, 2px `line` rail, 10px dots; completed = `brand`
filled, current = `brand` ring, upcoming = `line-strong` hollow. Each step:
title (`label`), timestamp (`caption`, `mute`).

**Tables** (dashboard) — no outer card shadow; 1px `line` border, `lg`
radius. Header row `canvas-soft`, `caption` uppercase `mute`. Rows 56px,
`body-sm`, hover `canvas-soft`, whole row clickable. Money columns
right-aligned tabular. On mobile, rows collapse to stacked list items —
never horizontal scroll.

**Empty states** — `mute` 24px icon, one `h3` line, one `body-sm` sentence,
one secondary button. No illustrations, no emoji.

**Toasts** — bottom-center on mobile, bottom-right on desktop, elevation 2,
`body-sm`. Success toasts are rare — prefer inline state changes.

**Icons** — lucide, 1.75 stroke, 16px inline / 20px in buttons and nav.
Icons support text; they never stand alone without an `aria-label`.

## Motion

Use motion only where it explains something or confirms an action:

- **Live order card** (landing hero): an example order plays through Awaiting
  payment → Held → Shipped → Paid out. Pauses on hover; one still frame
  under reduced motion.
- **How it works stepper**: steps auto-advance with a progress bar, a click
  stops autoplay, and the preview swipes left/right on touch.
- **Scroll reveal**: sections fade up 16px once, the first time they enter
  the viewport (`<Reveal>`). Never on transactional pages.
- **Accordions and step changes**: height/opacity, 250ms.
- **Buttons**: press scale 0.97. **Success moments** (payment received,
  paid out): one spring on the check icon.
- Never: parallax, infinite pulses, animated gradients, motion on page load
  of checkout/order pages beyond a simple fade.

## Page patterns

**Marketing (Landing, How it works, For sellers)** — sticky white nav
(64px, hairline bottom). Hero on a full-width `mint` field with `forest`
headline and a `forest` pill CTA (mint text), Wise-style. Hero on the landing page: `display-xl` headline (≤ 8
words, says what it is), `body-lg` subline, one primary + one secondary
button, and a real product visual on the right (the checkout card or order
status card rendered with real components — not a stock image). Sections
alternate `canvas-soft` / `canvas`. Section head: `display-lg` + `body-lg`.
Closing CTA band and footer on `forest`. No gradient blobs, marquees,
sparkle pills, floating badges or scroll animations.

**Checkout & buyer order page** — single column, `reading-max` 640px.
Order: seller identity (name, handle, verified state) → item → money summary
→ escrow explainer panel → payment step. On mobile, the pay button is a
sticky bottom bar (elevation 2) showing the total.

**Seller app** — left sidebar (240px, `canvas`, hairline right) on desktop;
top bar + bottom tab bar on mobile. Page = `h1` + one-line description +
primary action top-right. Dashboard home: 3 stat tiles (In escrow, Paid out
this month, Orders needing action) then an "Needs your action" table.

**Mediator/admin** — same shell as seller app; denser tables, no marketing
copy.

## Voice

- Plain Nigerian English, second person. "You'll get paid when the buyer
  confirms delivery." not "Seamlessly unlock trust-powered commerce."
- Short sentences. Verbs on buttons ("Pay ₦25,000", "Mark as shipped",
  "Release payment"), never "Submit" / "Continue" when a specific verb exists.
- No emoji, no exclamation marks in product UI.
- Errors say what happened and what to do: "We couldn't verify that account
  number. Check it and try again."

## Do / Don't

**Do**
- Use tokens for every colour, radius and font size.
- Use tabular figures for all money and counts.
- Show the next step and its owner on every order screen.
- Keep pages under ~300 lines; extract sections into components.

**Don't**
- Arbitrary values: `text-[11px]`, `rounded-[18px]`, `shadow-[...]`.
- Gradients, glows, blurred blobs, glassmorphism, animated pulses.
- Emoji or decorative icons in headings.
- More than one primary button per region.
- Fake social proof or unverifiable claims ("licensed", "10,000+ sellers").
