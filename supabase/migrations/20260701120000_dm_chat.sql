-- ─────────── 1:1 (DM) chat on top of the existing room infra ───────────
alter table public.chat_rooms add column if not exists kind text not null default 'group';
alter table public.chat_rooms add column if not exists dm_a uuid references public.profiles(id) on delete cascade;
alter table public.chat_rooms add column if not exists dm_b uuid references public.profiles(id) on delete cascade;
create unique index if not exists chat_rooms_dm_uniq on public.chat_rooms (dm_a, dm_b) where kind = 'dm';

-- find or create the DM room between the caller and another user
create or replace function public.get_or_create_dm(p_other uuid) returns uuid
  language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a uuid; b uuid; rid uuid; nm text;
begin
  if p_other is null or p_other = me then raise exception 'invalid DM target'; end if;
  a := least(me, p_other); b := greatest(me, p_other);
  select id into rid from public.chat_rooms where kind = 'dm' and dm_a = a and dm_b = b;
  if rid is null then
    select coalesce(name, '대화') into nm from public.profiles where id = p_other;
    insert into public.chat_rooms (name, is_private, created_by, kind, dm_a, dm_b)
    values (nm, true, me, 'dm', a, b) returning id into rid;
  end if;
  insert into public.room_members (room_id, user_id) values (rid, me), (rid, p_other) on conflict do nothing;
  return rid;
end $$;
grant execute on function public.get_or_create_dm(uuid) to authenticated;

-- unread message count per room for the caller (KakaoTalk-style badges)
create or replace function public.room_unread_counts() returns table(room_id uuid, n bigint)
  language sql stable security definer set search_path = public as $$
  select m.room_id, count(*)
  from public.messages m
  join public.room_members rm on rm.room_id = m.room_id and rm.user_id = auth.uid()
  where m.author_id <> auth.uid() and not coalesce(m.deleted, false)
    and m.created_at > coalesce(rm.last_read_at, 'epoch'::timestamptz)
  group by m.room_id;
$$;
grant execute on function public.room_unread_counts() to authenticated;
