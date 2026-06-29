-- Class scheduling: trainers post class slots, members book them.
create table if not exists public.class_slots (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references public.profiles(id) on delete cascade,
  title        text not null default 'PT 세션',
  starts_at    timestamptz not null,
  duration_min int  not null default 50,
  capacity     int  not null default 1,
  note         text,
  created_at   timestamptz not null default now()
);
alter table public.class_slots enable row level security;
create policy "slots read"  on public.class_slots for select to authenticated using (true);
create policy "slots write" on public.class_slots for all to authenticated
  using (trainer_id = auth.uid() or public.is_trainer())
  with check (trainer_id = auth.uid() or public.is_trainer());

create table if not exists public.class_bookings (
  id         uuid primary key default gen_random_uuid(),
  slot_id    uuid not null references public.class_slots(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (slot_id, user_id)
);
alter table public.class_bookings enable row level security;
create policy "bookings read"   on public.class_bookings for select to authenticated using (true);
create policy "bookings insert" on public.class_bookings for insert to authenticated with check (user_id = auth.uid());
create policy "bookings delete" on public.class_bookings for delete to authenticated using (user_id = auth.uid() or public.is_trainer());

create index if not exists class_slots_starts_idx on public.class_slots (starts_at);
create index if not exists class_bookings_slot_idx on public.class_bookings (slot_id);
