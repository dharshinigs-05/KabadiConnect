# KabadiConnect — Master Build Specification (v2)
**PS 26229 | Single Source of Truth for the 4-Person Parallel Build**

> **v2 supersedes v1 entirely.** v1 had a real domain-model bug (offers were never a first-class entity — the transaction lifecycle had the collector picking a recycler directly, which doesn't match how a marketplace with competing offers actually works), a money-precision bug (integer rupees, not paise/numeric), an RLS misunderstanding (`auth.uid()` was assumed to equal `collectors.id` with no `users` table to back it), and a few missing tables (offers, payments, trace_events, safety_guides). All fixed below. Freeze **this** version before any of the four people start writing implementation code.

---

## 0. How to Use This Document

Same rule as before, now stricter: **`/contracts` is the actual law, this document is the explanation of it.** Prose can be misread; a JSON Schema or OpenAPI type cannot. Set up the repo like this before anyone opens their editor:

```
KabadiConnect/
├── contracts/               ← frozen, versioned, read-only to everyone except via change-request
│   ├── openapi.yaml          (Section 2.4 as machine-readable spec)
│   ├── ml-api.yaml            (Section 2.5)
│   ├── schemas/
│   │   ├── lot.schema.json
│   │   ├── offer.schema.json
│   │   ├── transaction.schema.json
│   │   ├── payment.schema.json
│   │   ├── trace_event.schema.json
│   │   └── recycler.schema.json
│   └── enums.ts               (Section 2.2, as actual TypeScript so Frontend/Backend import it, not retype it)
├── docs/
│   └── change-requests/       ← see Section 10 — the ONLY way to modify /contracts
├── database/                  ← Part D
├── backend/                   ← Part B
├── ml/                        ← Part C
├── frontend/                  ← Part A
├── docker-compose.yml
└── SPEC.md                    ← this document
```

**Ownership map (unchanged from v1, still correct):**

| Part | Owns | Never touches |
|---|---|---|
| **D — Database** | Supabase/Postgres schema, migrations, RLS policies, seed data | API logic, app UI, model training, `/contracts` |
| **B — Backend** | Node/Express REST API, business rules, calls to ML service | DB schema (consumes it), model training, `/contracts` |
| **C — ML** | Model training, TFLite export, price + anomaly microservice, audio assets | API routes, UI, DB schema, `/contracts` |
| **A — Frontend** | Collector mobile app + recycler web dashboard | DB schema, model training, backend logic, `/contracts` |

**If any of the four believes `/contracts` is wrong:** they don't edit it. They write `docs/change-requests/{part}-NNN.md` describing the problem and proposed fix, and it gets resolved by whoever owns the integration branch (Section 10) before anyone codes against the old version. This single rule is what prevents "Backend quietly redesigned the schema while Database was still migrating it."

---

## 1. System Architecture (corrected marketplace flow)

The core fix from the review: **an offer is not the same thing as a transaction.** A lot can receive multiple competing offers from multiple recyclers before the collector accepts one. v1 collapsed these into a single step; v2 separates them.

```
COLLECTOR                    BACKEND / DB                    RECYCLER
    │                              │                              │
    │  create lot (offline ok)     │                              │
    ├─────────────────────────────►│  lot.status = open            │
    │                              │                              │
    │                              │◄── recycler browses open lots─┤
    │                              │                              │
    │                              │◄── recycler submits offer ────┤
    │  offer:new (realtime)        │  offers row created           │
    │◄─────────────────────────────┤                              │
    │  (repeat: multiple offers    │                              │
    │   from multiple recyclers)   │                              │
    │                              │                              │
    │  accept one offer            │                              │
    ├─────────────────────────────►│  offer.status = accepted      │
    │                              │  other offers → rejected      │
    │                              │  transaction created           │
    │                              │  status = accepted             │
    │                              │──── transaction:created ──────►│
    │                              │                              │
    │  (pickup happens)            │                              │
    ├──── update: pickup_scheduled►│                              │
    │                              │                              │
    │  handover: photo+GPS+time    │                              │
    ├─────────────────────────────►│  trace_event created          │
    │                              │  transaction.status=handed_over│
    │                              │──── needs confirmation ───────►│
    │                              │◄─── recycler confirms ────────┤
    │                              │  transaction.status=confirmed  │
    │                              │  payment record created        │
    │◄──── payment confirmed ──────┤◄─── recycler marks paid ──────┤
    │                              │  transaction.status=paid       │
    │                              │  ... eventually → recycled     │
```

Everything else from v1's architecture diagram (Frontend never talks to DB/ML directly except the bundled TFLite file; Backend is the single integration point; ML delivers a file + a service) **stays correct and unchanged.**

---

## 2. THE CONTRACT (v2 — frozen)

### 2.1 Global Conventions (one change: money)

| Convention | Rule |
|---|---|
| IDs | UUID v4 strings everywhere |
| Client-generated IDs | `client_uuid` on every record created offline, generated on-device at creation time |
| Timestamps | ISO 8601 UTC |
| **Currency — corrected** | `numeric(12,2)` in Postgres, serialized as a **string** in JSON (`"132.50"`, not a float) to avoid floating-point drift across three different language runtimes (JS, Python, SQL). Never do financial arithmetic in JS floats — parse to a decimal library (`decimal.js` in Node, `Decimal` in Python) before any calculation. |
| **Rate vs. total — corrected** | Every price field must say explicitly whether it's a **rate** (per kg) or a **total** (for the whole lot). No bare `price_inr` fields anywhere in the contract — see 2.3. |
| Language codes | `"hi"`, `"mr"`, `"en"` |
| Auth header | `Authorization: Bearer <access_token>` |
| Error shape | `{ "error": { "code": "STRING_CODE", "message": "..." } }` |
| Success shape | Resource directly; lists as `{ "items": [...], "next_cursor": "..." }` |
| Pagination | Cursor-based |
| Region | Never hardcode a city. Use `DEFAULT_DEMO_REGION` as an env var / seed-config value, not a literal in code. Whatever city your actual field research (Section 8) ends up in, that's what goes in the seed config — don't let "Nagpur" leak into schema, code, or business-model language until it's confirmed. |

### 2.2 Enums (v2 — additions in **bold**)

```
lot_status           = "open" | "offer_accepted" | "in_transaction" | "closed" | "cancelled"
lot_condition        = "good" | "damaged" | "mixed"
lot_source_type      = "household" | "aggregator" | "other"
weight_status        = "estimated" | "verified" | "pending"          -- NEW

offer_status         = "pending" | "accepted" | "rejected" | "expired"   -- NEW entity

transaction_status   = "accepted" | "pickup_scheduled" | "handed_over"
                       | "confirmed" | "paid" | "recycled" | "cancelled"
                       -- NOTE: "created" and "matching" and "offer_made" are REMOVED from
                       -- transaction_status — a transaction now only exists *after* an offer
                       -- is accepted (see Section 1 diagram). The old "offer_made" state was
                       -- the v1 bug; offers now live in their own table/status above.

payment_status       = "pending" | "cash_collected" | "upi_paid" | "bank_transfer"  -- CLARIFIED
payment_method       = "cash" | "upi" | "bank_transfer"               -- NEW

recycler_auth_status = "authorized" | "pending" | "unauthorized"
risk_band            = "allow" | "monitor" | "verify" | "block"
material_category    = "crt" | "lcd_panel" | "pcb" | "cable" | "battery"
                       | "motor" | "magnet_assembly" | "mixed_plastic" | "other"
user_role             = "collector" | "recycler" | "admin"            -- NEW
trace_event_type      = "lot_created" | "offer_accepted" | "pickup_started"
                        | "handover_photo" | "handover_confirmed"
                        | "payment_recorded" | "recycled_confirmed"    -- NEW
```

**Corrected state machine:** `accepted → pickup_scheduled → handed_over → confirmed → paid → recycled`, plus a `cancelled` escape hatch reachable from any pre-`paid` state. Backend rejects any transition that isn't the immediate next state (or `cancelled`), `409 INVALID_STATE_TRANSITION`.

### 2.3 Entity Schemas (v2)

**users** *(new — the actual auth-linked table; both collectors and recyclers reference this)*
```json
{
  "id": "uuid",              // == Supabase auth.users.id, NOT independently generated
  "role": "collector",
  "phone_number": "+91XXXXXXXXXX",
  "preferred_language": "hi",
  "created_at": "iso8601"
}
```

**Collector** *(profile, references users)*
```json
{
  "user_id": "uuid",           // FK → users.id
  "operating_location": { "lat": 21.1458, "lng": 79.0882, "label": "string" },
  "created_at": "iso8601"
}
```

**recycler_users** *(new — links a login to a recycler facility; a facility may have >1 staff login)*
```json
{ "user_id": "uuid", "recycler_id": "uuid", "role_at_facility": "staff | owner" }
```

**Lot** — weight and price fields corrected
```json
{
  "id": "uuid",
  "client_uuid": "uuid",
  "collector_id": "uuid",
  "material_category": "pcb",
  "material_subcategory": "motherboard",
  "description": "string, optional",
  "image_urls": ["storage_path_1", "storage_path_2"],   // CORRECTED: array, and see 2.7 (private storage)
  "estimated_weight_kg": 2.5,
  "verified_weight_kg": null,
  "weight_status": "estimated",
  "condition": "good",
  "source_type": "household",
  "estimated_value_total_inr": "340.00",      // CORRECTED: explicit "_total_", string decimal
  "location": { "lat": 21.14, "lng": 79.08 },
  "status": "open",
  "created_by_actor": "collector",             // NEW — "collector" | "field_facilitator" (assisted-entry mode)
  "created_at": "iso8601",
  "synced_at": "iso8601 | null"
}
```

**Offer** *(new entity — this is the critical fix)*
```json
{
  "id": "uuid",
  "lot_id": "uuid",
  "recycler_id": "uuid",
  "offered_rate_inr_per_kg": "135.00",
  "offered_total_inr": "337.50",
  "pickup_available": true,
  "status": "pending",
  "created_at": "iso8601",
  "expires_at": "iso8601"          // offers should expire — a stale ₹135/kg quote from 3 days ago isn't real
}
```

**Price record** — rate vs. total disambiguated
```json
{
  "id": "uuid",
  "material_category": "pcb",
  "material_subcategory": "motherboard",
  "location": "string",
  "date": "2026-09-01",
  "buying_rate_inr_per_kg": "130.00",
  "market_range_low_inr_per_kg": "110.00",
  "market_range_high_inr_per_kg": "150.00",
  "recycler_id": "uuid | null",
  "source": "seed | live"
}
```

**Recycler**
```json
{
  "id": "uuid",
  "name": "string",
  "facility_location": { "lat": 21.15, "lng": 79.09, "address": "string" },
  "materials_accepted": ["pcb", "cable", "battery"],
  "authorization_id": "string",
  "authorization_status": "authorized",
  "contact_phone": "+91XXXXXXXXXX",
  "typical_rates_inr_per_kg": { "pcb": "135.00", "cable": "90.00" },  // renamed from "offered_rates" — these are indicative, not live offers, which now live in the Offer entity
  "pickup_available": true,
  "service_area_radius_km": 15
}
```

**Transaction** — created only after offer acceptance
```json
{
  "id": "uuid",
  "client_uuid": "uuid",
  "lot_id": "uuid",
  "offer_id": "uuid",              // NEW — the accepted offer this transaction came from
  "collector_id": "uuid",
  "recycler_id": "uuid",
  "agreed_rate_inr_per_kg": "135.00",
  "final_weight_kg": null,
  "final_total_inr": null,          // filled in at handover once verified_weight_kg is known
  "status": "accepted",
  "created_at": "iso8601",
  "updated_at": "iso8601"
}
```

**Payment** *(new entity, split out of the transaction)*
```json
{
  "id": "uuid",
  "transaction_id": "uuid",
  "amount_inr": "337.50",
  "method": "cash",
  "status": "cash_collected",
  "reference": "string | null",     // UPI txn ID / bank ref, null for cash
  "confirmed_by_collector": true,
  "confirmed_by_recycler": true,
  "recorded_at": "iso8601"
}
```

**Trace event** *(new — replaces the single "traceability" row with a timeline)*
```json
{
  "id": "uuid",
  "transaction_id": "uuid",
  "lot_id": "uuid",
  "event_type": "handover_photo",
  "photo_urls": ["storage_path"],
  "gps": { "lat": 21.14, "lng": 79.08 },
  "timestamp": "iso8601",
  "actor_user_id": "uuid",
  "handover_reference_code": "KC-7F3A2B | null",   // only set on the handover_photo event
  "record_hash": "sha256:... | null",
  "recorded_by": "collector | recycler"
}
```

**Safety guide** *(new table, was API-only in v1)*
```json
{ "id": "uuid", "title_hi": "string", "title_mr": "string", "icon_key": "string", "audio_key": "string", "image_url": "string" }
```

### 2.4 REST API — Backend Endpoints (v2)

Base URL: `{{API_BASE_URL}}/v1`. Backend publishes `contracts/openapi.yaml` by end of Day 1.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/otp/request` | `{phone_number}` → `{success}` |
| POST | `/auth/otp/verify` | `{phone_number, otp}` → `{access_token, refresh_token, user_id, role, is_new_user}` |
| GET / PATCH | `/users/me` | Role-aware profile (returns collector or recycler-user profile depending on `role`) |
| POST | `/uploads/signed-upload-url` | `{file_name, content_type}` → `{upload_url, storage_path}` — **no `public_url`**, see 2.7 |
| GET | `/uploads/signed-read-url` | `?storage_path=` → `{read_url, expires_in}` — time-limited, since the bucket is private |
| POST | `/lots` | Create a lot → `Lot` + `estimated_value_total_inr` + `price_breakdown` |
| POST | `/sync/lots` | Batch, idempotent by `client_uuid` → `{results: [{client_uuid, server_id, status}]}` |
| GET | `/lots` / `/lots/:id` | List / fetch |
| GET | `/lots/open` | **New** — recycler-side: browse open lots near the recycler's service area, for offer creation |
| POST | `/lots/:lotId/offers` | **New** — recycler creates an offer → `Offer` |
| GET | `/lots/:lotId/offers` | **New** — collector views offers on their lot → `{items: [Offer]}` |
| PATCH | `/offers/:id/accept` | **New** — collector accepts → creates `Transaction`, sets this offer `accepted`, all other offers on the lot `rejected` |
| PATCH | `/offers/:id/reject` | Collector explicitly declines a single offer without accepting another yet |
| GET | `/prices` / `/prices/history` | Unchanged shape, fields renamed to `*_inr_per_kg` |
| GET | `/recyclers/match` | `?lot_id=` → ranked candidates (Section 4.1, corrected formula) — this still exists for the app's own recommendation UI, separate from recyclers freely browsing `/lots/open` and submitting offers themselves |
| GET | `/recyclers/:id` | — |
| GET | `/transactions/:id` / `GET /transactions` | — |
| PATCH | `/transactions/:id/status` | State machine transition, `409` on invalid |
| GET | `/transactions/:id/risk` | Cached anomaly result |
| POST | `/transactions/:id/trace-events` | **Renamed from `/traceability`** — append an event to the timeline; the `handover_photo` event auto-generates `handover_reference_code` + `record_hash` |
| POST | `/trace-events/:id/confirm` | Recycler confirms a `handover_photo` event via code/QR → creates a `handover_confirmed` event, advances transaction |
| POST | `/transactions/:id/payments` | Record a payment (cash/UPI/bank) → `Payment` |
| GET | `/collectors/me/earnings` | — |
| GET | `/safety-guides` | `?language=hi` |

**Realtime (Socket.IO):**
- `offer:new` → `{lot_id, offer_id}` (to the collector)
- `offer:accepted` / `offer:rejected` → to the relevant recycler
- `transaction:status_changed` → `{transaction_id, status}`

### 2.5 ML Service Contract — unchanged shape, money fields corrected to strings

```
POST /ml/predict-price
  → { predicted_rate_inr_per_kg, predicted_total_inr, confidence: 0-1,
      shap_breakdown: [{factor, contribution}] }
POST /ml/anomaly-check
  → { risk_score: 0-100, risk_band, reasons: [] }
GET  /ml/health
```

### 2.6 On-Device ML Artifact Contract — unchanged from v1, one addition

Add `model_version` and `preprocessing.json` (exact resize/normalize/channel-order spec as a machine-readable file, not just prose in a handoff doc — this is the #1 place v1 relied on a human reading instructions correctly).

### 2.7 Storage — corrected to private bucket

v1 said "signed upload URL → returns a permanent `public_url`." That's wrong for scrap photos with GPS/location context — **use a private bucket.** Store only `storage_bucket` + `storage_path` in Postgres. Any client that needs to *view* an image calls `GET /uploads/signed-read-url` for a short-lived signed URL. Never persist a permanent public URL anywhere in the schema or API responses.

---

## 3. Part D — Database Specification (v2)

**Stack unchanged:** Supabase/Postgres.

### 3.1 Tables (v2 — full corrected set)

```sql
-- users (backs Supabase auth — id must equal auth.users.id, not a separately generated uuid)
id                  uuid primary key references auth.users(id)
role                text not null                    -- user_role enum
phone_number        text unique not null
preferred_language  text not null default 'hi'
created_at          timestamptz default now()

-- collectors (profile only, 1:1 with users where role='collector')
user_id             uuid primary key references users(id)
operating_location  jsonb
created_at          timestamptz default now()

-- recyclers (facility, not a login)
id                    uuid primary key default gen_random_uuid()
name                  text not null
facility_location     jsonb
materials_accepted    text[]
authorization_id      text
authorization_status  text default 'pending'
contact_phone         text
typical_rates_inr_per_kg jsonb
pickup_available      boolean default true
service_area_radius_km numeric default 15

-- recycler_users (login → facility mapping, supports multiple staff per facility)
user_id             uuid references users(id)
recycler_id         uuid references recyclers(id)
role_at_facility    text default 'staff'
primary key (user_id, recycler_id)

-- materials (static catalog)
id                  text primary key
label_en, label_hi, label_mr  text
hazard_flag         boolean default false
icon_asset_key      text

-- lots
id                    uuid primary key default gen_random_uuid()
client_uuid           uuid unique not null
collector_id          uuid references collectors(user_id)
material_category     text references materials(id)
material_subcategory  text
description           text
estimated_weight_kg   numeric(6,2)
verified_weight_kg    numeric(6,2)
weight_status         text default 'estimated'
condition             text
source_type           text
estimated_value_total_inr numeric(12,2)
location              jsonb
status                text default 'open'
created_by_actor      text default 'collector'
created_at            timestamptz default now()
synced_at             timestamptz

-- lot_images (was image_url string on lots — now its own table, supports multiple photos)
id                  uuid primary key default gen_random_uuid()
lot_id              uuid references lots(id)
storage_bucket      text not null
storage_path        text not null
created_at          timestamptz default now()

-- prices
id                       uuid primary key default gen_random_uuid()
material_category        text references materials(id)
material_subcategory     text
location                 text
date                     date
buying_rate_inr_per_kg    numeric(12,2)
market_range_low_inr_per_kg  numeric(12,2)
market_range_high_inr_per_kg numeric(12,2)
recycler_id               uuid references recyclers(id)
source                    text default 'seed'

-- offers
id                    uuid primary key default gen_random_uuid()
lot_id                uuid references lots(id)
recycler_id           uuid references recyclers(id)
offered_rate_inr_per_kg numeric(12,2)
offered_total_inr      numeric(12,2)
pickup_available       boolean
status                 text default 'pending'
created_at             timestamptz default now()
expires_at             timestamptz

-- transactions
id                     uuid primary key default gen_random_uuid()
client_uuid            uuid unique
lot_id                 uuid references lots(id)
offer_id               uuid references offers(id)
collector_id           uuid references collectors(user_id)
recycler_id            uuid references recyclers(id)
agreed_rate_inr_per_kg  numeric(12,2)
final_weight_kg         numeric(6,2)
final_total_inr         numeric(12,2)
status                  text default 'accepted'
created_at              timestamptz default now()
updated_at              timestamptz default now()

-- payments
id                      uuid primary key default gen_random_uuid()
transaction_id          uuid references transactions(id)
amount_inr              numeric(12,2)
method                  text
status                  text default 'pending'
reference                text
confirmed_by_collector   boolean default false
confirmed_by_recycler    boolean default false
recorded_at              timestamptz default now()

-- trace_events (was a single "traceability" row — now a timeline)
id                        uuid primary key default gen_random_uuid()
transaction_id            uuid references transactions(id)
lot_id                    uuid references lots(id)
event_type                text
gps                       jsonb
timestamp                 timestamptz
actor_user_id             uuid references users(id)
handover_reference_code    text unique
record_hash                text
recorded_by                text

-- trace_event_photos (photos belonging to a trace event, mirrors lot_images pattern)
id                  uuid primary key default gen_random_uuid()
trace_event_id      uuid references trace_events(id)
storage_bucket      text
storage_path        text

-- safety_guides
id                  uuid primary key default gen_random_uuid()
title_hi, title_mr, title_en  text
icon_asset_key       text
audio_asset_key      text
image_url            text

-- ml_predictions (optional for hackathon scope, cheap to add, useful for the "explainability" story)
id                  uuid primary key default gen_random_uuid()
lot_id              uuid references lots(id)
model_version        text
predicted_rate_inr_per_kg numeric(12,2)
confidence           numeric(3,2)
shap_breakdown        jsonb
created_at            timestamptz default now()
```

### 3.2 Row-Level Security (corrected)

**Critical correction from the review, stated plainly:** the Supabase **service-role key bypasses RLS entirely.** RLS is not a security boundary for anything Backend does with the service-role key — it only matters for requests made with a user-bound `anon`/`authenticated` token. Since this architecture routes all writes through Backend (which holds the service-role key), **RLS here is a defense-in-depth safety net, and Backend's own authorization checks are the real security boundary.** Don't tell judges or a security reviewer that RLS is "the" access control layer — it isn't, in this design.

RLS policies (still worth having, as the safety net):
- `users`: row visible/editable only where `id = auth.uid()`.
- `collectors`: visible/editable only where `user_id = auth.uid()`.
- `lots`, `offers` (collector's own), `transactions`: readable by the owning `collector_id` (via `auth.uid() = collector_id`) or the counterpart `recycler_id` via a `recycler_users` join.
- `prices`, `recyclers`, `materials`, `safety_guides`: public read, service-role write only.

### 3.3 Seed Data — region made configurable

Same seeding approach as v1 (30 days of price history, 3–5 recyclers, materials catalog), but **parameterize the region.** Seed script takes `DEFAULT_DEMO_REGION` from env/config rather than hardcoding a city — decide the real demo region once field research (Section 8) is locked, then seed accordingly. Price grounding references (for plausible starting INR/kg values, general market context only — not an India-specific e-waste dataset, see Section 5.2 honesty note): `https://www.recycleinme.com/scrapresources/india_scrap_prices` and `https://www.recycleinme.com/scrapresources/india_metal_prices`.

---

## 4. Part B — Backend Specification (v2)

### 4.1 Recycler Matching — corrected: authorization is a hard gate, not a weight

```
Step 1 — HARD FILTER (not scored):
  authorization_status == "authorized"  AND
  material_category in materials_accepted  AND
  distance_km <= service_area_radius_km

Step 2 — SCORE remaining candidates:
  score = 0.35 × net_value_score + 0.25 × distance_score
        + 0.20 × material_compatibility_score + 0.20 × pickup_service_fit_score

  net_value_score = typical_rates_inr_per_kg[material] normalized 0-1 against candidates'
                     min/max (prefer "net collector value" over raw rate if you can factor in
                     travel cost/time, but raw rate is an acceptable v1 proxy)
  distance_score   = 1 - (distance_km / service_area_radius_km), clamped [0,1]
  material_compatibility_score = 1 if exact subcategory match else 0.7 if category-only match
  pickup_service_fit_score = 1 if pickup_available else 0.4
```

This still returns a `breakdown` object for the "explainable, not a black box" demo point — that part of v1 was right, only the authorization handling was wrong.

### 4.2 Offers → Transaction Flow (new, replaces v1's direct lot→transaction path)

1. `POST /lots/:lotId/offers` — any recycler (via `recycler_users` auth) with `lot.status == "open"` can submit an offer. Multiple recyclers can offer on the same lot.
2. `PATCH /offers/:id/accept` — only the lot's owning collector can call this. On accept: set this offer `accepted`, set all sibling offers on the lot `rejected`, set `lot.status = "offer_accepted"`, create the `Transaction` row referencing `offer_id`, emit `offer:accepted`/`offer:rejected` events.
3. From here the existing state machine (Section 2.2) takes over.

### 4.3 Money handling rule (new — apply everywhere)

Every financial calculation happens server-side using a decimal library, never raw JS floats. `final_total_inr = agreed_rate_inr_per_kg × final_weight_kg`, computed with `decimal.js` (or equivalent), rounded to 2 decimal places, stored as `numeric(12,2)`. Never let a client submit a total that Backend doesn't independently recompute and verify against the rate × weight — this is also your anomaly-detection input (Section 5.3).

### 4.4 Offline Sync — unchanged, still correct

`client_uuid` idempotency logic from v1 stands as-is; extend the same pattern to `transactions` and `trace_events` if offline creation is in scope for those too, not just lots.

### 4.5 Mock-First Development — unchanged, still correct

---

## 5. Part C — ML Specification (v2)

### 5.1 Material Classification — unchanged approach, one addition

Add a `preprocessing.json` machine-readable artifact (Section 2.6) instead of relying on a written handoff note — this was flagged as the most likely silent-failure point in v1 and it's a five-minute fix.

**Datasets — unchanged from v1, still the right list (verified public sources):**

| Dataset | Link |
|---|---|
| E-Waste Image Dataset (Akshat Tamrakar) | https://www.kaggle.com/datasets/akshat103/e-waste-image-dataset |
| TrashNet | https://github.com/garythung/trashnet |
| Waste Classification Data (techsash) | https://www.kaggle.com/datasets/techsash/waste-classification-data |
| PCB Defects Dataset | https://www.kaggle.com/datasets/akhatova/pcb-defects |
| PCB Electronic Components Dataset | https://www.kaggle.com/datasets/rahul14112003/pcb-electronic-components-dataset |
| Recycling Metals | https://www.kaggle.com/datasets/ayanbanerjee905/recycling-metals |
| Curated waste-dataset index | https://github.com/AgaMiko/waste-datasets-review |

### 5.2 Price Prediction — language correction (important)

**Corrected claim, use exactly this framing with judges:** *"AI-assisted indicative valuation"* — not "AI determines the current fair market price." The review is right that the price-reference sources (recycleinme.com) cover broad ferrous/metal/copper/aluminium market rates, **not** an India-specific dataset for e-waste-specific items like motherboard PCBs, CRTs, LCD panels, or magnet assemblies. Present the model honestly as: *prototype valuation trained on documented synthetic data grounded in available public market references, architected to transition to verified field/platform transaction data once collected.* This is both more defensible and, per the earlier PayTelemetry-discipline instinct your team already has, more credible than an overclaim.

### 5.3 Anomaly Detection — unchanged, this was already correct

Keep the deterministic rule-based approach exactly as in v1 (median deviation, repeated-inconsistent-quote pattern, weight-to-value ratio). The review confirms this is the right call — no change needed.

### 5.4 Vernacular Audio — simplified from v1

The review's point is right: don't build a full compositional TTS pipeline for a hackathon. Bundle these **fixed, pre-recorded categories** only:
- Safety warnings (fixed set, per material hazard)
- Material category names (8–9 items × 2 languages)
- Navigation/UI instructions (fixed set)
- Common price phrases ("price increased," "price decreased," material + rate spoken as a short template)

For genuinely dynamic values (an arbitrary price number), either (a) keep the earlier segment-concatenation approach from v1 for numbers only — it's a small, bounded piece of scope (digits 0–9 + "rupaye" + "kilo"), or (b) if device TTS (Android's built-in TTS engine, which does support Hindi/Marathi) is available and acceptable for the demo environment, use it for dynamic numbers and reserve bundled audio for the fixed phrases. Don't build both — pick one and move on; this is UX polish, not your core differentiator.

### 5.5 Mock-First Development — unchanged

---

## 6. Part A — Frontend Specification (v2)

### 6.1 Critical correction: Expo Development Build, not Expo Go

v1 said "React Native (Expo)" without qualification. **On-device TFLite inference requires native modules and will not run in standard Expo Go.** Set this up correctly from the start:

- Use **Expo with a Development Build** (`expo-dev-client`), not Expo Go, from day one — don't discover this at integration time.
- If using `react-native-fast-tflite` or similar, it supports Expo via a **config plugin**, but still requires a native prebuild step.
- **Action item, do this before deep frontend work starts:** get one successful Expo development build running with the TFLite plugin installed (even with a placeholder/dummy model) as the very first frontend milestone — this de-risks the one part of the stack most likely to have an environment surprise.

### 6.2 Corrected screen contracts (offers, not direct recycler pick)

| Screen | Calls |
|---|---|
| Login (phone OTP) | `POST /auth/otp/request`, `/verify` |
| Create Lot | On-device classify → local save with `client_uuid` → `lot.status = open` once synced |
| Sync | `POST /sync/lots` |
| Price Board | `GET /prices` |
| **Offers on my lot** *(new — replaces v1's "Recycler Match" as the collector-facing decision screen)* | `GET /lots/:lotId/offers` (realtime via `offer:new`), `PATCH /offers/:id/accept` |
| Handover | `POST /transactions/:id/trace-events` |
| Earnings | `GET /collectors/me/earnings` |
| Safety Guides | `GET /safety-guides` |

**Weight entry — simplified from v1:** drop Vosk offline STT from MVP scope per the review — voice *input* in noisy scrapyard conditions is materially harder to get reliable than voice *output*, and it's not worth the integration risk on a hackathon timeline. Use a **large numeric keypad with big touch targets** plus spoken audio confirmation of what was entered (TTS reading back "teen kilo" after the collector taps 3). Note Vosk as an explicit "future enhancement" on the roadmap slide, not a demo claim.

### 6.3 Recycler Web Dashboard — corrected for the offer flow

| Screen | Calls |
|---|---|
| Browse open lots | `GET /lots/open` |
| Submit an offer | `POST /lots/:lotId/offers` |
| My offers / their status | track via `offer:accepted`/`offer:rejected` events |
| Active transactions | `GET /transactions?recycler_id=` |
| Confirm handover | `POST /trace-events/:id/confirm` |
| Record payment | `POST /transactions/:id/payments` |

### 6.4 Storage — read via signed URL, not a stored public link

Per Section 2.7, Frontend never stores or hardcodes a permanent image URL. Every time a photo needs to be displayed, call `GET /uploads/signed-read-url?storage_path=...` and use the short-lived URL returned.

---

## 7. Cross-Cutting Setup

Same as v1 (env vars, image upload flow, OpenAPI-first, standalone-runnable mocks), with these v2 additions:

| Item | v2 addition |
|---|---|
| Ports | `Backend 4000`, `ML 8000`, `Recycler Vite 5173`, `Expo Metro 8081`, `Postgres 54322` (Supabase local default) — fixed and documented so nothing collides when all four are running on one network |
| Storage bucket | Private, not public — `STORAGE_BUCKET_LOTS=lot-photos` (private ACL) |
| Money handling | All four parts must use a decimal-safe type/library for any money field they touch — JS floats are banned for financial values anywhere in the stack |
| `/contracts` | The actual frozen artifact; this document explains it, doesn't replace it |

---

## 8. Open Items (unchanged, still open)

1. Field research with ≥2 real scrap collectors/aggregators — **and this is also what determines `DEFAULT_DEMO_REGION`, don't assume a city before this happens.**
2. Unit-economics assessment.
3. Revenue/sustainability model — recommended default unchanged (recycler-side transaction fee, EPR-linked grant fallback), still **not validated**, say so if asked.
4. Price-model training data provenance — now explicitly framed as "AI-assisted indicative valuation" per Section 5.2, not "AI determines fair price."
5. Material classification training set — bootstrap + field-research fine-tune, unchanged.

---

## 9. Vertical Integration Order (new — replaces "build all 4 parts to completion, then integrate")

Don't wait for all four parts to be "done." Integrate a thin vertical slice first, then widen it:

```
DB migration live
   → Backend health check passes
   → Frontend login works end to end
   → Collector creates a lot (price fallback, no ML yet — USE_MOCK_ML=true)
   → Recycler sees it on /lots/open, submits an offer
   → Collector accepts the offer → transaction created
   → Handover trace-event + recycler confirmation
   → Payment recorded
   → Status reaches "recycled"
   → THEN swap in real ML (classification, price prediction, anomaly) behind the existing mock interface
   → THEN layer in audio, safety guides, earnings polish
```

If the eight-step core loop above works end-to-end through the real DB and API before anything else is built, the platform fundamentally exists — everything after that is enhancement, not risk.

---

## 10. Change-Request Process (new — formalizes what was implicit in v1)

Any of the four people who thinks `/contracts` needs to change:
1. Writes `docs/change-requests/{part}-NNN.md`: what's wrong, proposed new shape, what it breaks downstream.
2. Does **not** implement against their proposed version until it's actually merged into `/contracts`.
3. Whoever owns the integration branch/session resolves it, updates `/contracts`, and pings all four parts that a contract version changed.

This is what "integration should be boring" (the closing principle from the review) actually requires in practice — not a wish, a process.

---

## 11. Production-Readiness Gate (new — separate from "hackathon demo ready")

The team's earlier project overview already separated "demonstrated" vs. "prototype" vs. "roadmap." This table makes that concrete for anyone asking "is this actually production-ready":

| Area | Required for production (not required for demo) |
|---|---|
| Security | JWT validation, RBAC beyond RLS, rate limiting, secret management |
| Database | Migration discipline, constraints, indexes, backup/restore tested |
| Reliability | Retries, health checks (idempotency you already have) |
| Observability | Structured logs, error tracking, request IDs |
| Payments | Real PSP integration if UPI is claimed as live, not just a status field |
| Privacy | Minimized personal data collection, private-bucket photo access (already in v2) |
| CI/CD | Lint + unit + integration tests + deploy gates |
| Mobile | Signed Android release build (EAS), not just a dev build |
| Ops | Separate staging/production environments |

Be explicit in the pitch about which of these exist today vs. roadmap — this is the same honesty discipline the team has already applied to XGBoost and the classifier training data, applied consistently to the whole system.

---

*v1 is retained for history but is no longer authoritative. This document (v2) plus `/contracts` is the source of truth. Any further contract change goes through Section 10, not a silent edit.*
