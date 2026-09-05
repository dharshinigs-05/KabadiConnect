create table if not exists pickup_schedules (
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

create index if not exists pickup_schedules_date_idx on pickup_schedules(scheduled_date, updated_at desc);

alter table payments add column if not exists client_uuid uuid;
create unique index if not exists payments_client_uuid_idx on payments(client_uuid) where client_uuid is not null;

alter table trace_events drop constraint if exists trace_events_event_type_check;
alter table trace_events add constraint trace_events_event_type_check check (
  event_type in ('lot_created', 'offer_accepted', 'pickup_scheduled', 'pickup_started', 'handover_photo', 'handover_confirmed', 'payment_recorded', 'recycled_confirmed')
);
