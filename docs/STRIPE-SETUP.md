# LETTO.LIVE — Stripe Setup

**Arhitektura (v7, 2026-04-25):** 1 produkt LETTO Premium — **€29 recurring every 3 months** + 1 coupon za Beta popust (€10 off = €19/3mo za prvih 100 korisnika). Beta/Full dugmeta oba idu na isti produkt; Beta dugme automatski primenjuje coupon. Kada coupon istekne ili dostigne 100 redemptions, deaktiviraš ga u dashboard-u bez code izmene — ostaje samo puna cena.

v7 landing (`public/index.html`) već prikazuje "€29 / 3 months" i "€19 / 3 months" copy — UI je usklađen sa ovim planom.

---

## 1. Kreiraj jedan produkt (Miroslav, u Dashboard-u)

[dashboard.stripe.com](https://dashboard.stripe.com) → prebaci na **Live mode** (prekidač gore desno). Ili ostani u **Test mode** za prvu E2E verifikaciju (preporuka).

1. **Products** (levi menu) → **+ Add product**
2. Popuni:
   - **Name:** `LETTO Premium`
   - **Description:** `Godišnja pretplata na LETTO.LIVE kurirane dealove`
3. **Pricing** sekcija:
   - Model: **Standard pricing**
   - Price: `29.00` **EUR** (važno — EUR, ne USD)
   - **Recurring** → Billing period: **Custom** → `3` `months` *(ili u newer dashboard-u: Billing period "Monthly" + Billing cycle "Every 3 months")*
4. **Save product**
5. Kopiraj `price_xxxxxxxxxxxxx` ID → daj mi za `STRIPE_PREMIUM_PRICE_ID`

Stripe CLI ekvivalent (ako preferiraš):
```bash
~/bin/stripe products create --name "LETTO Premium" --description "3-month access to full package details — airline, hotel, booking links"
# kopiraj prod_xxx
~/bin/stripe prices create --product prod_XXX --unit-amount 2900 --currency eur --recurring "interval=month,interval_count=3" --nickname "Premium 3-month"
# kopiraj price_xxx
```

---

## 2. Kreiraj Beta coupon (Miroslav)

**Products (levi menu) → Coupons** *(ili: More → Coupons u novijem dashboard-u)* → **+ New coupon**

1. **Type:** **Amount off** → `10.00 EUR` (ne Percentage, da ne zavisi od FX kurseva)
2. **Duration:** **Forever** (primeni se na svaki naredni 3-mesečni ciklus plaćanja) — tako da korisnik plaća €19 zauvek dok ne otkaže. Ako želiš samo prvi 3mo popust: **Once**.
3. **Redemption limits:**
   - **Limit the number of times this coupon can be redeemed in total:** ✓ → `100`
   - (opcionalno: `Limit the date range during which customers can redeem this coupon` → postavi end date npr. 2026-12-31)
4. **ID** (dole, optional): postavi čitljiv ID, npr. `FIRST100` (default je random alfanumerički niz)
5. **Save**
6. Kopiraj coupon ID → daj mi za `STRIPE_BETA_COUPON_ID`

Stripe CLI ekvivalent:
```bash
~/bin/stripe coupons create --amount-off 1000 --currency eur --duration forever --max-redemptions 100 --id FIRST100
```

---

## 3. API ključevi (Miroslav kopira, Claude zalepi u Vercel)

U Stripe dashboard-u: **Developers → API keys**

Postoji **Live mode** i **Test mode** prekidač. Za produkciju nam treba Live.

| Vercel env var | Izvor u Stripe-u | Format |
|---|---|---|
| `STRIPE_SECRET_KEY` | Live secret key ("Reveal live key") | `sk_live_...` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Live publishable key | `pk_live_...` |

**Napomena o test mode-u:** Ako želiš prvo testirati sve end-to-end bez pravog naplaćivanja, koristi `sk_test_...` i `pk_test_...`. Tada Stripe čekout prihvata test karticu `4242 4242 4242 4242`. Miroslav može da lako prebaci na live posle uspešnog testa.

---

## 4. Webhook endpoint (Miroslav)

U Stripe dashboard-u: **Developers → Webhooks → + Add endpoint**

- **Endpoint URL:** `https://letto.live/api/stripe-webhook`
- **Description:** `LETTO prod webhook`
- **Listen to:** `Events on your account`
- **Events to send:** klikni **+ Select events** i odaberi **tačno ova 3**:
  - `checkout.session.completed`
  - `invoice.paid`
  - `customer.subscription.deleted`
- **Add endpoint**

Nakon kreiranja, klikni na taj webhook, nađi sekciju "Signing secret" (obično ispod endpoint URL-a), klikni **Reveal** i kopiraj `whsec_...`. To ide u `STRIPE_WEBHOOK_SECRET` env var.

---

## 5. Customer portal (opcionalno, za subscription management)

**Settings → Customer portal → Configure**
- Allow customers to: Update payment method, Cancel subscriptions, View invoice history
- Business information: popuni (pojavljuje se u Customer portal stranici)
- Redirect link nakon exit-a: `https://letto.live` (ili `/account` ako napraviš tu stranicu)
- **Activate test link → Save**

Ovo nije kritično za v0.1 — Stripe šalje email-ove sa invoice-ima automatski.

---

## 6. Env vars u Vercel (Claude radi posle koraka 1–4)

Kad Miroslav pošalje sve vrednosti, Claude upisuje:

```
STRIPE_SECRET_KEY           = sk_live_...   (ili sk_test_... za test mode)
STRIPE_WEBHOOK_SECRET       = whsec_...
STRIPE_PREMIUM_PRICE_ID     = price_...
STRIPE_BETA_COUPON_ID       = FIRST100     (ili whatever ID si koristio)
VITE_STRIPE_PUBLISHABLE_KEY = pk_live_...   (ili pk_test_...)
```

Sve se pišu na **production + preview** scope. Nakon toga: **Claude pokreće `vercel --prod`** (traži allow).

---

## 7. Verifikacija (Claude pokreće, nakon deploy-a)

```bash
cd ~/letto-ai
node scripts/stripe-verify.mjs
```

Script proverava:
- Svih 5 env vars postoje
- `STRIPE_SECRET_KEY` je validan (ping Stripe account)
- `STRIPE_PREMIUM_PRICE_ID` postoji, aktivan, EUR, yearly recurring
- `STRIPE_BETA_COUPON_ID` postoji, valid, prikazuje redemption count
- Webhook endpoint na `https://letto.live/api/stripe-webhook` je registrovan i status `enabled`
- Webhook ima tačno 3 required events (`checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`)
- `POST /api/stripe-checkout` sa `tier: 'beta'` vraća Stripe Checkout URL (coupon applied)

---

## 8. End-to-end plaćanja test (Miroslav + Claude)

### Opcija A: Live test sa pravom karticom (~€1, refund immediately)
1. Otvori https://letto.live#cena
2. Unesi pravi email, klikni **Beta €19/god** (najjeftinije za test)
3. Unesi pravu karticu → plati
4. **Claude verifikuje:**
   - Firestore `letto_subscribers/<email>` ima `tier: 'premium'`, `stripeCustomerId`, `stripeSubscriptionId`
   - Vercel Functions log za `/api/stripe-webhook` ima 200 OK
5. Stripe Dashboard → Payments → nađi plaćanje → klikni **Refund** (full). Subscription se može zadržati ili `customer.subscription.deleted` trigger-om obrisati.

### Opcija B: Stripe CLI trigger (lokalno, bez prave naplate)
```bash
# Stripe CLI je na /home/zlfzr/bin/stripe
~/bin/stripe login   # jednokratno, otvara browser za auth

# Terminal 1: forward-uj webhook-e iz Stripe u localhost
~/bin/stripe listen --forward-to http://localhost:3000/api/stripe-webhook

# Terminal 2: pokreni vercel dev
cd ~/letto-ai && vercel dev

# Terminal 3: triggeruj event
~/bin/stripe trigger checkout.session.completed
```

Poruka u Stripe CLI output-u treba da kaže **200 OK** na forward.

---

## 9. Kada nešto krene loše

### Webhook vraća 400 "No signatures found"
- `STRIPE_WEBHOOK_SECRET` ne odgovara endpoint-u. Proveri da si kopirao secret iz ISTOG moda (live ili test) kao secret key.

### Checkout session "Price ID not configured"
- `STRIPE_PREMIUM_PRICE_ID` env nije set.

### Stripe vraća "No such price" ili "No such coupon"
- ID-jevi su iz test mode-a, a `sk_live_...` key je iz live mode-a (ili obrnuto). Mora da se poklope.

### Checkout radi ali Firestore ne piše `tier: 'premium'`
- Webhook ne stiže do Vercel funkcije. Stripe Dashboard → Webhooks → endpoint → **Webhook attempts** tab. "Failed" sa 400/500 → proveri Vercel Functions log za `/api/stripe-webhook`.

### Beta dugme ne daje popust
- `STRIPE_BETA_COUPON_ID` nije set ili je ID pogrešan. Ako nije set, kod fallback-uje na `allow_promotion_codes: true` (user može ručno ukucati promo kod) što radi ali nije automatski.

---

## Arhitekturne napomene

- `api/stripe-checkout.js` — `mode: 'subscription'`, `trial_period_days: 14` hardcoded. Kad `tier === 'beta'` i `STRIPE_BETA_COUPON_ID` je set: `discounts: [{ coupon }]` umesto `allow_promotion_codes` (njih dvoje su mutually exclusive u Stripe API-ju).
- `api/stripe-webhook.js` ne razlikuje tier — svi plaćeni (i Beta i Full) postaju `tier: 'premium'` u Firestore. Beta je samo cenovni popust, ne različita usluga.
- Webhook generiše Telegram invite link pri `checkout.session.completed` i čuva u `letto_subscribers/<email>/telegramInviteLink`. `/dobrodosao` strana trenutno ne fetch-uje taj link po `session_id` — oslanja se na welcome email koji još nije implementiran. To je TODO van scope-a v0.1.
