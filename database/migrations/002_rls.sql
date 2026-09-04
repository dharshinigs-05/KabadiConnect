alter table users enable row level security;
alter table collectors enable row level security;
alter table recyclers enable row level security;
alter table recycler_users enable row level security;
alter table materials enable row level security;
alter table lots enable row level security;
alter table lot_images enable row level security;
alter table prices enable row level security;
alter table offers enable row level security;
alter table transactions enable row level security;
alter table payments enable row level security;
alter table trace_events enable row level security;
alter table trace_event_photos enable row level security;
alter table safety_guides enable row level security;
alter table ml_predictions enable row level security;

create or replace function public.is_recycler_member(target_recycler_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from recycler_users where recycler_id = target_recycler_id and user_id = auth.uid()) $$;

create policy users_self on users for all using (id = auth.uid()) with check (id = auth.uid());
create policy collectors_self on collectors for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recycler_users_self on recycler_users for select using (user_id = auth.uid());
create policy recyclers_public_read on recyclers for select using (true);
create policy materials_public_read on materials for select using (true);
create policy prices_public_read on prices for select using (true);
create policy safety_guides_public_read on safety_guides for select using (true);

create policy lots_participant_read on lots for select using (
  collector_id = auth.uid() or exists (
    select 1 from recycler_users ru join offers o on o.recycler_id = ru.recycler_id
    where ru.user_id = auth.uid() and o.lot_id = lots.id
  )
);
create policy lots_collector_write on lots for insert with check (collector_id = auth.uid());
create policy lots_collector_update on lots for update using (collector_id = auth.uid()) with check (collector_id = auth.uid());

create policy lot_images_participant on lot_images for select using (exists (select 1 from lots l where l.id = lot_id and (l.collector_id = auth.uid() or exists (select 1 from recycler_users ru join offers o on o.recycler_id = ru.recycler_id where ru.user_id = auth.uid() and o.lot_id = l.id))));
create policy offers_participant_read on offers for select using (exists (select 1 from lots l where l.id = lot_id and l.collector_id = auth.uid()) or public.is_recycler_member(recycler_id));
create policy offers_recycler_create on offers for insert with check (public.is_recycler_member(recycler_id));
create policy offers_collector_update on offers for update using (exists (select 1 from lots l where l.id = lot_id and l.collector_id = auth.uid()));

create policy transactions_participant_read on transactions for select using (collector_id = auth.uid() or public.is_recycler_member(recycler_id));
create policy transactions_collector_update on transactions for update using (collector_id = auth.uid()) with check (collector_id = auth.uid());
create policy payments_participant on payments for select using (exists (select 1 from transactions t where t.id = transaction_id and (t.collector_id = auth.uid() or public.is_recycler_member(t.recycler_id))));
create policy trace_events_participant on trace_events for select using (exists (select 1 from transactions t where t.id = transaction_id and (t.collector_id = auth.uid() or public.is_recycler_member(t.recycler_id))));
create policy trace_events_participant_insert on trace_events for insert with check (exists (select 1 from transactions t where t.id = transaction_id and (t.collector_id = auth.uid() or public.is_recycler_member(t.recycler_id))));
create policy trace_event_photos_participant on trace_event_photos for select using (exists (select 1 from trace_events e join transactions t on t.id = e.transaction_id where e.id = trace_event_id and (t.collector_id = auth.uid() or public.is_recycler_member(t.recycler_id))));
create policy ml_predictions_lot_owner on ml_predictions for select using (exists (select 1 from lots l where l.id = lot_id and l.collector_id = auth.uid()));
