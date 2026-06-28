-- Full-featured chat: soft delete, reply, reactions, read receipts, and
-- per-room anonymous alias (nickname + photo).

alter table public.messages add column if not exists deleted  boolean not null default false;
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;

alter table public.room_members add column if not exists alias_name   text;
alter table public.room_members add column if not exists alias_photo  text;   -- post-media path, or null
alter table public.room_members add column if not exists anonymous    boolean not null default false;
alter table public.room_members add column if not exists last_read_at timestamptz;

-- author can edit their own message (used for soft delete)
create policy "messages update own" on public.messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- reactions: any member of the message's room can react / read reactions
create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  primary key (message_id, user_id, emoji)
);
alter table public.message_reactions enable row level security;
create policy "reactions read" on public.message_reactions for select to authenticated using (
  exists (select 1 from public.messages m join public.room_members rm on rm.room_id = m.room_id
          where m.id = message_id and rm.user_id = auth.uid())
);
create policy "reactions write" on public.message_reactions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.messages m join public.room_members rm on rm.room_id = m.room_id
    where m.id = message_id and rm.user_id = auth.uid()));

alter publication supabase_realtime add table public.message_reactions;
