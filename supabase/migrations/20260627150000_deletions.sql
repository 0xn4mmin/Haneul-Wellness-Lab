-- Let users delete their own content: posts (already), comments, the chat
-- rooms they created, and the challenges they created.

-- comments: author can delete their own
create policy "post comments delete" on public.post_comments
  for delete to authenticated using (author_id = auth.uid());

-- chat rooms: track the creator, and let them delete the room (cascades
-- messages + room_members via existing FKs)
alter table public.chat_rooms
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
create policy "rooms delete" on public.chat_rooms
  for delete to authenticated using (created_by = auth.uid());

-- challenges: creator can delete their own
create policy "challenges delete" on public.challenges
  for delete to authenticated using (created_by = auth.uid());

-- so the community can react to created/removed challenges live
alter publication supabase_realtime add table public.challenges;
