# KabadiConnect database

PostgreSQL/Supabase migrations for v2. Apply files in `migrations/` in lexical order, then run `seed.sql`.

## Configuration

`DEFAULT_DEMO_REGION` is required by the seed runner and is passed to `psql` as `demo_region`; no city is embedded in the SQL.

```powershell
$env:DEFAULT_DEMO_REGION = 'your-demo-region'
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 --set demo_region=$env:DEFAULT_DEMO_REGION -f database/seed.sql
```

The migration uses Supabase `auth.users` as the identity authority. The compatibility `auth.users` table and `auth.uid()` function are only for plain PostgreSQL recreation tests; on Supabase the existing objects remain the authority.

All photo records use `storage_bucket` and `storage_path`. No permanent public image URL is stored.
