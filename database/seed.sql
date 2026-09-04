\set ON_ERROR_STOP on
\if :{?demo_region}
\else
  \set demo_region 'default-demo-region'
\endif

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000004')
on conflict do nothing;

insert into users (id, role, phone_number, preferred_language) values
  ('00000000-0000-4000-8000-000000000001', 'collector', '+910000000001', 'hi'),
  ('00000000-0000-4000-8000-000000000002', 'recycler', '+910000000002', 'mr'),
  ('00000000-0000-4000-8000-000000000003', 'recycler', '+910000000003', 'en'),
  ('00000000-0000-4000-8000-000000000004', 'admin', '+910000000004', 'en')
on conflict do nothing;

insert into collectors (user_id, operating_location) values
  ('00000000-0000-4000-8000-000000000001', jsonb_build_object('lat', 20.5937, 'lng', 78.9629, 'label', :'demo_region'))
on conflict do nothing;

insert into materials (id, label_en, label_hi, label_mr, hazard_flag, icon_asset_key) values
  ('crt', 'CRT display', 'CRT display', 'CRT display', true, 'material-crt'),
  ('lcd_panel', 'LCD panel', 'LCD panel', 'LCD panel', false, 'material-lcd'),
  ('pcb', 'Circuit board', 'Circuit board', 'Circuit board', false, 'material-pcb'),
  ('cable', 'Copper cable', 'Copper cable', 'Copper cable', false, 'material-cable'),
  ('battery', 'Battery', 'Battery', 'Battery', true, 'material-battery'),
  ('motor', 'Electric motor', 'Electric motor', 'Electric motor', false, 'material-motor'),
  ('magnet_assembly', 'Magnet assembly', 'Magnet assembly', 'Magnet assembly', false, 'material-magnet'),
  ('mixed_plastic', 'Mixed plastic', 'Mixed plastic', 'Mixed plastic', false, 'material-plastic'),
  ('other', 'Other e-waste', 'Other e-waste', 'Other e-waste', false, 'material-other')
on conflict do nothing;

insert into recyclers (id, name, facility_location, materials_accepted, authorization_id, authorization_status, contact_phone, typical_rates_inr_per_kg, pickup_available, service_area_radius_km) values
  ('10000000-0000-4000-8000-000000000001', 'Green Loop Recycling', jsonb_build_object('lat', 20.60, 'lng', 78.96, 'address', :'demo_region'), array['pcb','cable','lcd_panel'], 'AUTH-DEMO-001', 'authorized', '+910000001001', '{"pcb":"135.00","cable":"90.00","lcd_panel":"110.00"}', true, 25),
  ('10000000-0000-4000-8000-000000000002', 'Circular Metals Hub', jsonb_build_object('lat', 20.62, 'lng', 78.94, 'address', :'demo_region'), array['pcb','motor','battery'], 'AUTH-DEMO-002', 'authorized', '+910000001002', '{"pcb":"132.00","motor":"105.00","battery":"70.00"}', true, 20),
  ('10000000-0000-4000-8000-000000000003', 'Pending Materials Co', jsonb_build_object('lat', 20.58, 'lng', 78.98, 'address', :'demo_region'), array['pcb','cable'], 'PENDING-DEMO-003', 'pending', '+910000001003', '{"pcb":"140.00"}', false, 10)
on conflict do nothing;

insert into recycler_users (user_id, recycler_id, role_at_facility) values
  ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'staff')
on conflict do nothing;

insert into prices (material_category, material_subcategory, location, date, buying_rate_inr_per_kg, market_range_low_inr_per_kg, market_range_high_inr_per_kg, recycler_id, source)
select 'pcb', 'motherboard', :'demo_region', current_date - offset_day, 130 + (offset_day % 4), 110, 150, null, 'seed'
from generate_series(0, 29) as days(offset_day)
where not exists (select 1 from prices p where p.material_category = 'pcb' and p.location = :'demo_region');

insert into lots (id, client_uuid, collector_id, material_category, material_subcategory, description, estimated_weight_kg, weight_status, condition, source_type, estimated_value_total_inr, location, status, synced_at) values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'pcb', 'motherboard', 'Demo circuit boards', 2.50, 'estimated', 'good', 'household', 337.50, jsonb_build_object('lat',20.59,'lng',78.96), 'open', now()),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'cable', 'copper', 'Demo cable bundle', 5.00, 'verified', 'mixed', 'aggregator', 450.00, jsonb_build_object('lat',20.59,'lng',78.96), 'closed', now())
on conflict do nothing;

insert into lot_images (lot_id, storage_bucket, storage_path) values
  ('20000000-0000-4000-8000-000000000001', 'lot-photos', 'lots/20000000-0000-4000-8000-000000000001/front.jpg')
on conflict do nothing;

insert into offers (id, lot_id, recycler_id, offered_rate_inr_per_kg, offered_total_inr, pickup_available, status, expires_at) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 135.00, 337.50, true, 'accepted', now() + interval '2 days'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 132.00, 330.00, true, 'rejected', now() + interval '2 days')
on conflict do nothing;

insert into offers (id, lot_id, recycler_id, offered_rate_inr_per_kg, offered_total_inr, pickup_available, status, expires_at) values
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 90.00, 450.00, true, 'accepted', now() + interval '2 days')
on conflict do nothing;

update lots set status = 'offer_accepted' where id = '20000000-0000-4000-8000-000000000001';

insert into transactions (id, client_uuid, lot_id, offer_id, collector_id, recycler_id, agreed_rate_inr_per_kg, status) values
  ('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 135.00, 'accepted'),
  ('50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 90.00, 'accepted')
on conflict do nothing;

update transactions set status = 'pickup_scheduled' where id in ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002');
update transactions set status = 'handed_over' where id = '50000000-0000-4000-8000-000000000001';
update transactions set status = 'handed_over' where id = '50000000-0000-4000-8000-000000000002';
update transactions set final_weight_kg = 2.50, final_total_inr = 337.50, status = 'confirmed' where id = '50000000-0000-4000-8000-000000000001';
update transactions set final_weight_kg = 5.00, final_total_inr = 450.00, status = 'confirmed' where id = '50000000-0000-4000-8000-000000000002';

insert into trace_events (id, transaction_id, lot_id, event_type, gps, actor_user_id, recorded_by, handover_reference_code, record_hash) values
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'lot_created', jsonb_build_object('lat',20.59,'lng',78.96), '00000000-0000-4000-8000-000000000001', 'collector', null, null),
  ('70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'offer_accepted', null, '00000000-0000-4000-8000-000000000001', 'collector', null, null),
  ('70000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'pickup_started', null, '00000000-0000-4000-8000-000000000001', 'collector', null, null),
  ('70000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'handover_photo', jsonb_build_object('lat',20.60,'lng',78.96), '00000000-0000-4000-8000-000000000002', 'recycler', 'KC-DEMO01', 'sha256:demo'),
  ('70000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'handover_confirmed', null, '00000000-0000-4000-8000-000000000002', 'recycler', null, null)
on conflict do nothing;

insert into trace_event_photos (trace_event_id, storage_bucket, storage_path) values
  ('70000000-0000-4000-8000-000000000004', 'lot-photos', 'transactions/50000000-0000-4000-8000-000000000001/handover.jpg')
on conflict do nothing;

update transactions set status = 'paid' where id = '50000000-0000-4000-8000-000000000001';
insert into payments (id, transaction_id, amount_inr, method, status, reference, confirmed_by_collector, confirmed_by_recycler) values
  ('80000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 337.50, 'upi', 'upi_paid', 'DEMO-UPI-001', true, true)
on conflict do nothing;
update transactions set status = 'recycled' where id = '50000000-0000-4000-8000-000000000001';
insert into trace_events (id, transaction_id, lot_id, event_type, actor_user_id, recorded_by) values
  ('70000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'payment_recorded', '00000000-0000-4000-8000-000000000002', 'recycler'),
  ('70000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'recycled_confirmed', '00000000-0000-4000-8000-000000000002', 'recycler')
on conflict do nothing;
update lots set status = 'closed' where id = '20000000-0000-4000-8000-000000000001';

insert into safety_guides (title_hi, title_mr, title_en, icon_asset_key, audio_asset_key) values
  ('Battery ko saavdhaani se sambhalein', 'Battery kaalajipurvak haataalaa', 'Handle batteries carefully', 'safety-battery', 'audio-battery');
