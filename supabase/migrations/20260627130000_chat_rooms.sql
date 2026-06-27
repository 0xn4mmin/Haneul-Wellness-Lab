-- Multi-room chat: room creation, public/private rooms, and join-by-code.
-- Tightens room visibility so private rooms are only visible to their members,
-- and adds a SECURITY DEFINER join function so a code holder can join a private
-- room they can't yet see.

-- members see their rooms; public rooms are discoverable by everyone
drop policy if exists "rooms read" on public.chat_rooms;
create policy "rooms read" on public.chat_rooms for select to authenticated using (
  not is_private
  or exists (select 1 from public.room_members rm where rm.room_id = chat_rooms.id and rm.user_id = auth.uid())
);

-- join a room by its code (definer: finds a private room you're not in yet)
create or replace function public.join_room_by_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rid uuid; rname text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;
  select id, name into rid, rname from chat_rooms where join_code = upper(trim(p_code)) limit 1;
  if rid is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  insert into room_members (room_id, user_id) values (rid, auth.uid()) on conflict do nothing;
  return jsonb_build_object('ok', true, 'room_id', rid, 'name', rname);
end $$;
grant execute on function public.join_room_by_code(text) to authenticated;
