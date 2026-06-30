-- ─────────── Phase 3: coach → member class-time requests ───────────
-- The coach asks a member when they can train (optionally with candidate
-- times); the member replies with their available time; the coach then
-- creates the session.

create table if not exists public.schedule_requests (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.profiles(id) on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  message     text,
  options     jsonb not null default '[]',   -- candidate ISO datetimes (optional)
  status      text  not null default 'pending', -- pending | replied | closed
  reply       text,                            -- member's chosen/typed time
  created_at  timestamptz not null default now(),
  replied_at  timestamptz
);
alter table public.schedule_requests enable row level security;
create policy "req read" on public.schedule_requests for select to authenticated
  using (trainer_id = auth.uid() or member_id = auth.uid() or public.is_trainer());
create policy "req insert" on public.schedule_requests for insert to authenticated
  with check (public.is_trainer() or trainer_id = auth.uid());
-- member can reply to their own request; trainer/owner can close/edit
create policy "req update" on public.schedule_requests for update to authenticated
  using (member_id = auth.uid() or trainer_id = auth.uid() or public.is_trainer())
  with check (member_id = auth.uid() or trainer_id = auth.uid() or public.is_trainer());
create policy "req delete" on public.schedule_requests for delete to authenticated
  using (trainer_id = auth.uid() or public.is_trainer());

-- notify the member when a request is created
create or replace function public.notify_req_created() returns trigger
  language plpgsql security definer set search_path = public as $$
declare actor text := public._actor_name(new.trainer_id);
begin
  insert into public.notifications (user_id, actor_id, type, text)
  values (new.member_id, new.trainer_id, 'class', actor || ' 코치가 수업 시간을 요청했어요.');
  return new;
end $$;
drop trigger if exists on_req_created on public.schedule_requests;
create trigger on_req_created after insert on public.schedule_requests
  for each row execute function public.notify_req_created();

-- notify the trainer when the member replies
create or replace function public.notify_req_replied() returns trigger
  language plpgsql security definer set search_path = public as $$
declare actor text := public._actor_name(new.member_id);
begin
  if new.status = 'replied' and (old.status is distinct from 'replied') then
    insert into public.notifications (user_id, actor_id, type, text)
    values (new.trainer_id, new.member_id, 'class', actor || '님이 수업 가능 시간을 보냈어요.');
  end if;
  return new;
end $$;
drop trigger if exists on_req_replied on public.schedule_requests;
create trigger on_req_replied after update on public.schedule_requests
  for each row execute function public.notify_req_replied();

create index if not exists schedule_requests_member_idx on public.schedule_requests (member_id);
create index if not exists schedule_requests_trainer_idx on public.schedule_requests (trainer_id);
