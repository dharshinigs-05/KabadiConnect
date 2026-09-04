\set ON_ERROR_STOP on
begin;

DO $$
DECLARE
  collector uuid := '00000000-0000-4000-8000-000000000001';
  recycler uuid := '10000000-0000-4000-8000-000000000001';
  lot uuid := '20000000-0000-4000-8000-000000000001';
  offer uuid := '40000000-0000-4000-8000-000000000001';
  tx uuid := '50000000-0000-4000-8000-000000000001';
  auth_error boolean := false;
BEGIN
  if not exists (select 1 from pg_constraint where conrelid = 'lots'::regclass and contype = 'f') then raise exception 'FK integrity missing'; end if;
  if (select count(*) from offers where lot_id = lot and status = 'accepted') <> 1 then raise exception 'accepted offer uniqueness failed'; end if;
  if (select count(*) from transactions where offer_id = offer) <> 1 then raise exception 'transaction offer relationship failed'; end if;
  if not exists (select 1 from payments where transaction_id = tx) then raise exception 'payment relationship missing'; end if;
  if not exists (select 1 from trace_events where transaction_id = tx and lot_id = lot) then raise exception 'trace relationship missing'; end if;

  begin
    insert into lots (client_uuid, collector_id, material_category, estimated_weight_kg, condition, source_type, estimated_value_total_inr, location)
    values ('30000000-0000-4000-8000-000000000001', collector, 'pcb', 1, 'good', 'household', 1, '{"lat":0,"lng":0}');
  exception when unique_violation then auth_error := true;
  end;
  if not auth_error then raise exception 'duplicate lot client_uuid was accepted'; end if;

  begin
    update transactions set status = 'recycled' where id = '50000000-0000-4000-8000-000000000002';
    raise exception 'invalid transaction state was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into offers (lot_id, recycler_id, offered_rate_inr_per_kg, offered_total_inr, pickup_available, expires_at)
    values (lot, '10000000-0000-4000-8000-000000000003', 100, 100, true, now() + interval '1 day');
    raise exception 'unauthorized recycler submitted an offer';
  exception when insufficient_privilege then null;
  end;
END $$;

DO $$
BEGIN
  if (select count(*) from prices where source = 'seed') < 30 then raise exception '30 days of seed prices missing'; end if;
  if exists (select 1 from information_schema.columns where table_name in ('lot_images','trace_event_photos') and column_name in ('public_url','image_url')) then raise exception 'permanent public image URL column exists'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'offers_one_accepted_per_lot') then raise exception 'accepted-offer unique index missing'; end if;
END $$;

rollback;
\echo 'database checks passed'
