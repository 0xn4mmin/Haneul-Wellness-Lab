-- Room owner (or a trainer/admin) can rename a chat room.
create policy "rooms update" on public.chat_rooms for update to authenticated
  using (created_by = auth.uid() or public.is_trainer())
  with check (created_by = auth.uid() or public.is_trainer());
