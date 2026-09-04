# KabadiConnect Backend (v2)

Node.js/Express API implementing the frozen `/contracts` specification.

## Setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in DATABASE_URL and Supabase credentials (or enable mock modes for local dev)
```

## Environment

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default `4000`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key (OTP auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (storage, token verify) |
| `ML_SERVICE_URL` | ML microservice base URL |
| `USE_MOCK_ML` | `true` to use deterministic price/anomaly fallback |
| `USE_MOCK_AUTH` | `true` for dev OTP (`MOCK_OTP`, default `123456`) |
| `DEFAULT_DEMO_REGION` | Region label for price seed lookup (never hardcode a city in code) |
| `CORS_ORIGIN` | Allowed origins (`*` or comma-separated) |

## Run

```bash
npm run dev     # watch mode
npm run build && npm start
npm test
npm run lint
```

## Health

- `GET /health` — process liveness
- `GET /ready` — database (+ ML degraded) readiness

## API

All routes are under `/v1` per `contracts/openapi.yaml`.

Authentication: `Authorization: Bearer <access_token>`

## Business rules (summary)

- **RBAC**: Backend enforces role and resource ownership; RLS is defense-in-depth only.
- **Recyclers**: Only `authorization_status = authorized` may submit offers (DB trigger + API gate).
- **Offers**: Server validates `offered_total_inr = rate × weight` using `decimal.js`.
- **Accept offer**: Transactional `FOR UPDATE` + unique partial index prevents double acceptance.
- **Transactions**: `accepted → pickup_scheduled → handed_over → confirmed → paid → recycled` (+ `cancelled`).
- **Offline sync**: `client_uuid` idempotency on lots (and transactions at creation).
- **Storage**: Private buckets; responses expose `storage_path`, not permanent public URLs.
- **ML**: Adapter with fallback when service unavailable; never blocks core marketplace flow.

See root `SPEC.md` and `/contracts` for the full specification.

## Testing

Tests use Vitest. Set `NODE_ENV=test`, `USE_MOCK_AUTH=true`, `USE_MOCK_ML=true`, and provide `DATABASE_URL` for integration tests against a migrated database.

Mock auth flow for manual testing:

1. `POST /v1/auth/otp/request` `{ "phone_number": "+919999999999" }`
2. `POST /v1/auth/otp/verify` `{ "phone_number": "+919999999999", "otp": "123456" }`

## Socket.IO

Connect with `{ auth: { token: "<access_token>" } }`.

Events: `offer:new`, `offer:accepted`, `offer:rejected`, `transaction:status_changed`
