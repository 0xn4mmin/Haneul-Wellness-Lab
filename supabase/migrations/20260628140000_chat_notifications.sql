-- Group-chat message notifications. To avoid one notification per message,
-- we keep a single unread 'chat' notification per room per recipient and bump
-- it on each new message (collapsed). A `ref` column holds the room id for the
-- dedupe. Once read, the next message creates a fresh unread one.

alter table public.notifications add column if not exists ref text;

create or replace function public.notify_message() returns trigger
  language plpgsql security definer set search_path = public as $$
declare actor text := public._actor_name(new.author_id); rname text; rec record; msg text;
begin
  select name into rname from public.chat_rooms where id = new.room_id;
  msg := actor || '님이 ‘' || coalesce(rname, '그룹 채팅') || '’에 메시지를 보냈어요.';
  for rec in
    select user_id from public.room_members where room_id = new.room_id and user_id <> new.author_id
  loop
    update public.notifications
      set text = msg, actor_id = new.author_id, created_at = now()
      where user_id = rec.user_id and type = 'chat' and ref = new.room_id::text and read = false;
    if not found then
      insert into public.notifications (user_id, actor_id, type, text, ref)
      values (rec.user_id, new.author_id, 'chat', msg, new.room_id::text);
    end if;
  end loop;
  return new;
end $$;

create trigger on_message after insert on public.messages
  for each row execute function public.notify_message();
