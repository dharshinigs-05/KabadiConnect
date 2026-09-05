create extension if not exists pgcrypto;

-- Supabase supplies auth.users and auth.uid(). These compatibility objects make the
-- migration reproducible in a plain PostgreSQL database used by CI.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('collector', 'recycler', 'admin')),
  phone_number text not null unique,
  preferred_language text not null default 'hi' check (preferred_language in ('hi', 'mr', 'en')),
  created_at timestamptz not null default now()
);

create table collectors (
  user_id uuid primary key references users(id) on delete cascade,
  operating_location jsonb,
  created_at timestamptz not null default now(),
  check (operating_location is null or (
    jsonb_typeof(operating_location) = 'object'
    and (operating_location->>'lat')::numeric between -90 and 90
    and (operating_location->>'lng')::numeric between -180 and 180
  ))
);

create table recyclers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  facility_location jsonb,
  materials_accepted text[] not null default '{}',
  authorization_id text,
  authorization_status text not null default 'pending' check (authorization_status in ('authorized', 'pending', 'unauthorized')),
  contact_phone text,
  typical_rates_inr_per_kg jsonb not null default '{}',
  pickup_available boolean not null default true,
  service_area_radius_km numeric(8,2) not null default 15 check (service_area_radius_km >= 0),
  check (facility_location is null or (
    jsonb_typeof(facility_location) = 'object'
    and (facility_location->>'lat')::numeric between -90 and 90
    and (facility_location->>'lng')::numeric between -180 and 180
  ))
);

create table recycler_users (
  user_id uuid not null references users(id) on delete cascade,
  recycler_id uuid not null references recyclers(id) on delete cascade,
  role_at_facility text not null default 'staff' check (role_at_facility in ('staff', 'owner')),
  primary key (user_id, recycler_id),
  unique (user_id)
);

create table materials (
  id text primary key check (id in ('crt', 'lcd_panel', 'pcb', 'cable', 'battery', 'motor', 'magnet_assembly', 'mixed_plastic', 'other')),
  label_en text not null,
  label_hi text not null,
  label_mr text not null,
  hazard_flag boolean not null default false,
  icon_asset_key text
);

create table lots (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  collector_id uuid not null references collectors(user_id),
  material_category text not null references materials(id),
  material_subcategory text,
  description text,
  estimated_weight_kg numeric(6,2) not null check (estimated_weight_kg >= 0),
  verified_weight_kg numeric(6,2) check (verified_weight_kg is null or verified_weight_kg >= 0),
  weight_status text not null default 'estimated' check (weight_status in ('estimated', 'verified', 'pending')),
  condition text not null check (condition in ('good', 'damaged', 'mixed')),
  source_type text not null check (source_type in ('household', 'aggregator', 'other')),
  estimated_value_total_inr numeric(12,2) not null check (estimated_value_total_inr >= 0),
  location jsonb not null check (
    jsonb_typeof(location) = 'object'
    and (location->>'lat')::numeric between -90 and 90
    and (location->>'lng')::numeric between -180 and 180
  ),
  status text not null default 'open' check (status in ('open', 'offer_accepted', 'in_transaction', 'closed', 'cancelled')),
  created_by_actor text not null default 'collector' check (created_by_actor in ('collector', 'field_facilitator')),
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create table lot_images (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  storage_bucket text not null check (length(storage_bucket) > 0),
  storage_path text not null check (length(storage_path) > 0),
  created_at timestamptz not null default now(),
  unique (lot_id, storage_bucket, storage_path)
);

create table prices (
  id uuid primary key default gen_random_uuid(),
  material_category text not null references materials(id),
  material_subcategory text,
  location text not null,
  date date not null,
  buying_rate_inr_per_kg numeric(12,2) not null check (buying_rate_inr_per_kg >= 0),
  market_range_low_inr_per_kg numeric(12,2) not null check (market_range_low_inr_per_kg >= 0),
  market_range_high_inr_per_kg numeric(12,2) not null check (market_range_high_inr_per_kg >= market_range_low_inr_per_kg),
  recycler_id uuid references recyclers(id) on delete set null,
  source text not null default 'seed' check (source in ('seed', 'live'))
);

create table offers (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  recycler_id uuid not null references recyclers(id),
  offered_rate_inr_per_kg numeric(12,2) not null check (offered_rate_inr_per_kg >= 0),
  offered_total_inr numeric(12,2) not null check (offered_total_inr >= 0),
  pickup_available boolean not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (lot_id, id)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  lot_id uuid not null,
  offer_id uuid not null,
  collector_id uuid not null references collectors(user_id),
  recycler_id uuid not null references recyclers(id),
  agreed_rate_inr_per_kg numeric(12,2) not null check (agreed_rate_inr_per_kg >= 0),
  final_weight_kg numeric(6,2) check (final_weight_kg is null or final_weight_kg >= 0),
  final_total_inr numeric(12,2) check (final_total_inr is null or final_total_inr >= 0),
  status text not null default 'accepted' check (status in ('accepted', 'pickup_scheduled', 'handed_over', 'confirmed', 'paid', 'recycled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lot_id, offer_id) references offers(lot_id, id),
  unique (offer_id),
  unique (lot_id, recycler_id),
  unique (lot_id, id)
);

create table pickup_schedules (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references transactions(id) on delete cascade,
  client_uuid uuid not null unique,
  scheduled_date date not null,
  scheduled_time_window text not null check (length(trim(scheduled_time_window)) > 0),
  pickup_location jsonb not null check (
    jsonb_typeof(pickup_location) = 'object'
    and (pickup_location->>'lat')::numeric between -90 and 90
    and (pickup_location->>'lng')::numeric between -180 and 180
    and length(trim(pickup_location->>'label')) > 0
  ),
  collector_note text,
  recycler_note text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  client_uuid uuid,
  amount_inr numeric(12,2) not null check (amount_inr > 0),
  method text not null check (method in ('cash', 'upi', 'bank_transfer')),
  status text not null default 'pending' check (status in ('pending', 'cash_collected', 'upi_paid', 'bank_transfer')),
  reference text,
  confirmed_by_collector boolean not null default false,
  confirmed_by_recycler boolean not null default false,
  recorded_at timestamptz not null default now(),
  check (method = 'cash' or reference is not null),
  check ((method = 'cash' and status in ('pending', 'cash_collected')) or (method = 'upi' and status in ('pending', 'upi_paid')) or (method = 'bank_transfer' and status in ('pending', 'bank_transfer')))
);

create table trace_events (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null default gen_random_uuid() unique,
  transaction_id uuid not null references transactions(id) on delete cascade,
  lot_id uuid not null references lots(id),
  event_type text not null check (event_type in ('lot_created', 'offer_accepted', 'pickup_scheduled', 'pickup_started', 'handover_photo', 'handover_confirmed', 'payment_recorded', 'recycled_confirmed')),
  gps jsonb,
  timestamp timestamptz not null default now(),
  actor_user_id uuid not null references users(id),
  handover_reference_code text unique,
  record_hash text,
  recorded_by text not null check (recorded_by in ('collector', 'recycler')),
  foreign key (lot_id, transaction_id) references transactions(lot_id, id),
  check (event_type = 'handover_photo' or handover_reference_code is null),
  check (gps is null or (jsonb_typeof(gps) = 'object' and (gps->>'lat')::numeric between -90 and 90 and (gps->>'lng')::numeric between -180 and 180))
);

create table trace_event_photos (
  id uuid primary key default gen_random_uuid(),
  trace_event_id uuid not null references trace_events(id) on delete cascade,
  storage_bucket text not null check (length(storage_bucket) > 0),
  storage_path text not null check (length(storage_path) > 0),
  unique (trace_event_id, storage_bucket, storage_path)
);

create table safety_guides (
  id uuid primary key default gen_random_uuid(),
  title_hi text not null,
  title_mr text not null,
  title_en text not null,
  icon_asset_key text,
  audio_asset_key text,
  storage_bucket text,
  storage_path text,
  check ((storage_bucket is null) = (storage_path is null))
);

create table ml_predictions (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id) on delete cascade,
  model_version text not null,
  predicted_rate_inr_per_kg numeric(12,2) not null check (predicted_rate_inr_per_kg >= 0),
  confidence numeric(3,2) not null check (confidence between 0 and 1),
  shap_breakdown jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create unique index offers_one_accepted_per_lot on offers(lot_id) where status = 'accepted';
create index lots_collector_status_idx on lots(collector_id, status, created_at desc);
create index lots_open_idx on lots(created_at desc) where status = 'open';
create index lot_images_lot_idx on lot_images(lot_id);
create index prices_lookup_idx on prices(material_category, location, date desc);
create index offers_lot_status_idx on offers(lot_id, status, expires_at);
create index offers_recycler_idx on offers(recycler_id, status, created_at desc);
create index transactions_collector_idx on transactions(collector_id, status, updated_at desc);
create index transactions_recycler_idx on transactions(recycler_id, status, updated_at desc);
create index pickup_schedules_date_idx on pickup_schedules(scheduled_date, updated_at desc);
create index payments_transaction_idx on payments(transaction_id, recorded_at desc);
create unique index payments_client_uuid_idx on payments(client_uuid) where client_uuid is not null;
create index trace_events_transaction_idx on trace_events(transaction_id, timestamp);
create index trace_event_photos_event_idx on trace_event_photos(trace_event_id);
create index ml_predictions_lot_idx on ml_predictions(lot_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger transactions_touch_updated_at before update on transactions for each row execute function public.touch_updated_at();

create or replace function public.enforce_transaction_lifecycle()
returns trigger language plpgsql as $$
declare
  allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'accepted' then raise exception 'transaction must start in accepted state' using errcode = '23514'; end if;
    if not exists (select 1 from offers where id = new.offer_id and lot_id = new.lot_id and status = 'accepted' and recycler_id = new.recycler_id) then
      raise exception 'transaction requires its accepted offer' using errcode = '23514';
    end if;
    return new;
  end if;
  if old.status = 'cancelled' or old.status = 'recycled' then
    allowed := new.status = old.status;
  elsif new.status = 'cancelled' then
    allowed := true;
  else
    allowed := (old.status, new.status) in (('accepted','pickup_scheduled'), ('pickup_scheduled','handed_over'), ('handed_over','confirmed'), ('confirmed','paid'), ('paid','recycled'));
  end if;
  if not allowed then raise exception 'invalid transaction state transition: % -> %', old.status, new.status using errcode = '23514'; end if;
  return new;
end $$;
create trigger transactions_lifecycle before insert or update on transactions for each row execute function public.enforce_transaction_lifecycle();

create or replace function public.enforce_authorized_recycler_offer()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from recyclers where id = new.recycler_id and authorization_status = 'authorized') then
    raise exception 'recycler is not authorized to submit offers' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger offers_authorization before insert or update on offers for each row execute function public.enforce_authorized_recycler_offer();

create or replace function public.enforce_payment_relationship()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from transactions where id = new.transaction_id and status in ('confirmed', 'paid', 'recycled')) then
    raise exception 'payment requires a confirmed transaction' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger payments_relationship before insert or update on payments for each row execute function public.enforce_payment_relationship();

create or replace function public.enforce_trace_actor()
returns trigger language plpgsql as $$
begin
  if new.recorded_by = 'collector' and not exists (select 1 from transactions where id = new.transaction_id and collector_id = new.actor_user_id) then
    raise exception 'collector trace actor does not own transaction' using errcode = '23514';
  end if;
  if new.recorded_by = 'recycler' and not exists (select 1 from recycler_users ru join transactions t on t.recycler_id = ru.recycler_id where t.id = new.transaction_id and ru.user_id = new.actor_user_id) then
    raise exception 'recycler trace actor is not authorized for transaction' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trace_actor_relationship before insert or update on trace_events for each row execute function public.enforce_trace_actor();
