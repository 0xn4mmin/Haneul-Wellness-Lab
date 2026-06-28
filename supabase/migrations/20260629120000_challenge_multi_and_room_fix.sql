-- 1) Private chat room creation failed: the "rooms read" policy only let
--    members see a private room, but createRoom does insert().select() to read
--    the new row back before the creator is a member, so the select returned
--    nothing. Let the creator always read their own room.
drop policy if exists "rooms read" on public.chat_rooms;
create policy "rooms read" on public.chat_rooms for select to authenticated using (
  not is_private
  or created_by = auth.uid()
  or exists (select 1 from public.room_members rm where rm.room_id = chat_rooms.id and rm.user_id = auth.uid())
);

-- 2) Challenges now target multiple metrics, and per-challenge goal is gone
--    (each member sets their own goal). Period is an explicit date range.
alter table public.challenges add column if not exists metric_keys jsonb;
alter table public.challenges alter column metric_key drop not null;
alter table public.challenges alter column goal drop not null;
