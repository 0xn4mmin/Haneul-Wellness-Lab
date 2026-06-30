-- ─────────── Scheduler v2: location, package start date, overlap guard, request threads ───────────

-- 1) class location + package 시작일
alter table public.class_sessions add column if not exists location text;
alter table public.class_packages add column if not exists started_on date;

-- 2) prevent overlapping sessions for the same trainer (non-cancelled)
create or replace function public.check_session_overlap() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.status = 'cancelled' then return new; end if;
  if exists (
    select 1 from public.class_sessions s
    where s.trainer_id = new.trainer_id and s.id <> new.id and s.status <> 'cancelled'
      and tstzrange(new.starts_at, new.starts_at + (new.duration_min || ' minutes')::interval)
       && tstzrange(s.starts_at,  s.starts_at  + (s.duration_min  || ' minutes')::interval)
  ) then
    raise exception '시간이 겹치는 수업이 이미 있어요.' using errcode = '23P01';
  end if;
  return new;
end $$;
drop trigger if exists session_no_overlap on public.class_sessions;
create trigger session_no_overlap before insert or update on public.class_sessions
  for each row execute function public.check_session_overlap();

-- 3) request conversation: keep schedule_requests as the thread, add a messages
--    table so trainer and member can keep replying, with full history.
create table if not exists public.schedule_request_messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.schedule_requests(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);
alter table public.schedule_request_messages enable row level security;
create policy "reqmsg read" on public.schedule_request_messages for select to authenticated
  using (exists (select 1 from public.schedule_requests r where r.id = request_id
                 and (r.trainer_id = auth.uid() or r.member_id = auth.uid() or public.is_trainer())));
create policy "reqmsg insert" on public.schedule_request_messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (select 1 from public.schedule_requests r where r.id = request_id
              and (r.trainer_id = auth.uid() or r.member_id = auth.uid() or public.is_trainer())));

-- notify the OTHER party on each message
create or replace function public.notify_req_message() returns trigger
  language plpgsql security definer set search_path = public as $$
declare r record; actor text := public._actor_name(new.sender_id); recipient uuid;
begin
  select trainer_id, member_id into r from public.schedule_requests where id = new.request_id;
  recipient := case when new.sender_id = r.trainer_id then r.member_id else r.trainer_id end;
  update public.schedule_requests set status = 'open' where id = new.request_id;
  insert into public.notifications (user_id, actor_id, type, text)
  values (recipient, new.sender_id, 'class', actor || '님의 수업 시간 메시지: ' || left(new.text, 28));
  return new;
end $$;
drop trigger if exists on_reqmsg on public.schedule_request_messages;
create trigger on_reqmsg after insert on public.schedule_request_messages
  for each row execute function public.notify_req_message();

-- retire the single message/reply notify triggers (superseded by the thread)
drop trigger if exists on_req_created on public.schedule_requests;
drop trigger if exists on_req_replied on public.schedule_requests;

create index if not exists reqmsg_request_idx on public.schedule_request_messages (request_id, created_at);
alter publication supabase_realtime add table public.schedule_request_messages;
