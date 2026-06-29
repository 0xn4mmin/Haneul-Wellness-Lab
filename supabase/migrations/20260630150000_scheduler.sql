-- ─────────────── Coach scheduler: packages + sessions ───────────────
-- A member buys an N-session package; the coach schedules individual
-- sessions against it. Attendance and same-day cancels both consume a
-- session (시수 차감); advance cancels do not.

create table if not exists public.class_packages (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.profiles(id) on delete cascade,
  trainer_id    uuid not null references public.profiles(id) on delete cascade,
  total_sessions int  not null default 10,
  registered_on date not null default current_date,
  note          text,
  created_at    timestamptz not null default now()
);
alter table public.class_packages enable row level security;
create policy "pkg read"  on public.class_packages for select to authenticated
  using (member_id = auth.uid() or trainer_id = auth.uid() or public.is_trainer());
create policy "pkg write" on public.class_packages for all to authenticated
  using (public.is_trainer() or trainer_id = auth.uid())
  with check (public.is_trainer() or trainer_id = auth.uid());

create table if not exists public.class_sessions (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references public.profiles(id) on delete cascade,
  member_id    uuid references public.profiles(id) on delete set null,
  package_id   uuid references public.class_packages(id) on delete set null,
  title        text not null default 'PT',
  color        text not null default '#2E9BA6',
  starts_at    timestamptz not null,
  duration_min int  not null default 50,
  -- scheduled | attended | sameday_cancel | cancelled
  status       text not null default 'scheduled',
  created_at   timestamptz not null default now()
);
alter table public.class_sessions enable row level security;
create policy "sess read"  on public.class_sessions for select to authenticated
  using (member_id = auth.uid() or trainer_id = auth.uid() or public.is_trainer());
-- trainers (or the owning trainer) have full control; members are read-only
create policy "sess write" on public.class_sessions for all to authenticated
  using (public.is_trainer() or trainer_id = auth.uid())
  with check (public.is_trainer() or trainer_id = auth.uid());

create index if not exists class_sessions_starts_idx on public.class_sessions (starts_at);
create index if not exists class_sessions_member_idx on public.class_sessions (member_id);
create index if not exists class_packages_member_idx on public.class_packages (member_id);
