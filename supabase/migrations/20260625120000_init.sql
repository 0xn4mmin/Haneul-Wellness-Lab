-- Haneul Wellness Lab — initial schema + RLS
-- Per-metric privacy is enforced at the row level via the metric_readings
-- (long) table, which also matches the frontend's per-metric time-series model.

-- ───────────────────────── enums ─────────────────────────
create type user_role as enum ('client', 'trainer');
create type visibility as enum ('public', 'private');
create type measurement_source as enum ('manual', 'ocr');

-- ──────────────────────── profiles ───────────────────────
-- 1:1 with auth.users
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text not null,
  initials     text not null,
  avatar_color text not null default '#6E9B8E',
  role         user_role not null default 'client',
  bio          text,
  bio2         text,
  height_cm    numeric,
  birth        date,
  gender       text,
  phone        text,
  photo_path   text,
  joined_at    timestamptz not null default now()
);

-- current user is a trainer? (security definer → bypasses RLS, no recursion)
create or replace function public.is_trainer() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'trainer');
$$;

-- ─────────────────── measurements (scan events) ──────────
create table public.measurements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  date              date not null,
  segmental         jsonb not null default '{}',  -- {rightArm:{kg,pct}, leftArm, trunk, rightLeg, leftLeg}
  detail            jsonb not null default '{}',  -- {phaseAngle, smi, protein, mineral, idealWeight, visceralLevel, ecwTbw}
  result_sheet_path text,
  source            measurement_source not null default 'manual',
  created_at        timestamptz not null default now(),
  unique (user_id, date)
);

-- ───────────── metric_readings (per-metric series; privacy unit) ─────────
create table public.metric_readings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  measurement_id uuid references public.measurements(id) on delete cascade,
  metric_key     text not null,   -- score|weight|smm|pbf|bodyFatMass|bmi|bmr|visceral|tbw
  date           date not null,
  value          numeric not null,
  created_at     timestamptz not null default now()
);
create index metric_readings_series_idx on public.metric_readings (user_id, metric_key, date);

create table public.metric_privacy (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  metric_key text not null,
  visibility visibility not null default 'private',
  primary key (user_id, metric_key)
);

create table public.goals (
  user_id  uuid primary key references public.profiles(id) on delete cascade,
  score    int,
  smm      numeric,
  pbf      numeric,
  visceral int
);

create table public.condition_logs (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.profiles(id) on delete cascade,
  week     text not null,
  sleep    numeric,
  water    numeric,
  mood     int,
  workouts int
);

-- ──────────────────────── social ─────────────────────────
create table public.chart_comments (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,  -- chart owner
  metric_key text not null,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);
create index chart_comments_idx on public.chart_comments (owner_id, metric_key, created_at);

create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles(id) on delete cascade,
  text          text not null,
  shared_metric jsonb,
  created_at    timestamptz not null default now()
);
create table public.post_likes (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);
create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);

create table public.member_cheers (
  id             uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  author_id      uuid not null references public.profiles(id) on delete cascade,
  text           text not null,
  created_at     timestamptz not null default now()
);

create table public.coach_notes (
  id         uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  member_id  uuid not null references public.profiles(id) on delete cascade,
  metric_key text not null,
  text       text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────── chat ────────────────────────────
create table public.chat_rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_private boolean not null default false,
  join_code  text,
  created_at timestamptz not null default now()
);
create table public.room_members (
  room_id uuid references public.chat_rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (room_id, user_id)
);
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.chat_rooms(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);
create index messages_room_idx on public.messages (room_id, created_at);

create table public.challenges (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  metric_key text not null,
  goal       text not null,
  starts_at  date not null,
  ends_at    date not null,
  scope      visibility not null default 'public',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────── auto-create profile + default privacy on signup ──────────
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, initials, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', '회원'),
    coalesce(new.raw_user_meta_data->>'initials', '회원'),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#6E9B8E')
  );
  insert into public.metric_privacy (user_id, metric_key, visibility)
  select new.id, k, 'private'
  from unnest(array['score','weight','smm','pbf','bodyFatMass','bmi','bmr','visceral','tbw']) as k;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════ Row Level Security ═══════════════════════
alter table public.profiles        enable row level security;
alter table public.measurements    enable row level security;
alter table public.metric_readings enable row level security;
alter table public.metric_privacy  enable row level security;
alter table public.goals           enable row level security;
alter table public.condition_logs  enable row level security;
alter table public.chart_comments  enable row level security;
alter table public.posts           enable row level security;
alter table public.post_likes      enable row level security;
alter table public.post_comments   enable row level security;
alter table public.member_cheers   enable row level security;
alter table public.coach_notes     enable row level security;
alter table public.chat_rooms      enable row level security;
alter table public.room_members    enable row level security;
alter table public.messages        enable row level security;
alter table public.challenges      enable row level security;

-- profiles: everyone authenticated can read (member discovery); self can write
create policy "profiles read"   on public.profiles for select to authenticated using (true);
create policy "profiles insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update" on public.profiles for update to authenticated using (id = auth.uid());

-- measurements (segmental/detail/result sheet are sensitive): owner or trainer
create policy "measurements read"  on public.measurements for select to authenticated
  using (user_id = auth.uid() or public.is_trainer());
create policy "measurements write" on public.measurements for all to authenticated
  using (user_id = auth.uid() or public.is_trainer())
  with check (user_id = auth.uid() or public.is_trainer());

-- metric_privacy: visibility flags are not secret → readable; only owner edits
create policy "privacy read"  on public.metric_privacy for select to authenticated using (true);
create policy "privacy write" on public.metric_privacy for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- metric_readings: owner, OR public-for-that-metric, OR trainer  ← the privacy core
create policy "readings read" on public.metric_readings for select to authenticated using (
  user_id = auth.uid()
  or public.is_trainer()
  or exists (
    select 1 from public.metric_privacy mp
    where mp.user_id = metric_readings.user_id
      and mp.metric_key = metric_readings.metric_key
      and mp.visibility = 'public'
  )
);
create policy "readings write" on public.metric_readings for all to authenticated
  using (user_id = auth.uid() or public.is_trainer())
  with check (user_id = auth.uid() or public.is_trainer());

-- goals / condition: owner or trainer
create policy "goals read"  on public.goals for select to authenticated using (user_id = auth.uid() or public.is_trainer());
create policy "goals write" on public.goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "condition read"  on public.condition_logs for select to authenticated using (user_id = auth.uid() or public.is_trainer());
create policy "condition write" on public.condition_logs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- chart comments: visible if the metric is public, or owner/trainer; any member can author
create policy "chart comments read" on public.chart_comments for select to authenticated using (
  owner_id = auth.uid()
  or author_id = auth.uid()
  or public.is_trainer()
  or exists (select 1 from public.metric_privacy mp
             where mp.user_id = chart_comments.owner_id and mp.metric_key = chart_comments.metric_key and mp.visibility = 'public')
);
create policy "chart comments insert" on public.chart_comments for insert to authenticated with check (author_id = auth.uid());

-- community feed: all authenticated read; author writes own
create policy "posts read"   on public.posts for select to authenticated using (true);
create policy "posts insert" on public.posts for insert to authenticated with check (author_id = auth.uid());
create policy "posts delete" on public.posts for delete to authenticated using (author_id = auth.uid());
create policy "post likes read"   on public.post_likes for select to authenticated using (true);
create policy "post likes write"  on public.post_likes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "post comments read"   on public.post_comments for select to authenticated using (true);
create policy "post comments insert" on public.post_comments for insert to authenticated with check (author_id = auth.uid());

-- cheers: readable by all (encouragement); author writes own
create policy "cheers read"   on public.member_cheers for select to authenticated using (true);
create policy "cheers insert" on public.member_cheers for insert to authenticated with check (author_id = auth.uid());

-- coach notes: only the trainer who wrote it or the member it's about
create policy "coach notes read"   on public.coach_notes for select to authenticated using (trainer_id = auth.uid() or member_id = auth.uid());
create policy "coach notes insert" on public.coach_notes for insert to authenticated with check (trainer_id = auth.uid() and public.is_trainer());

-- challenges: all read; author creates
create policy "challenges read"   on public.challenges for select to authenticated using (true);
create policy "challenges insert" on public.challenges for insert to authenticated with check (created_by = auth.uid());

-- chat: room members read/write; rooms list readable
create policy "rooms read"   on public.chat_rooms for select to authenticated using (true);
create policy "rooms insert" on public.chat_rooms for insert to authenticated with check (true);
create policy "room members read"  on public.room_members for select to authenticated using (true);
create policy "room members write" on public.room_members for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "messages read" on public.messages for select to authenticated using (
  exists (select 1 from public.room_members rm where rm.room_id = messages.room_id and rm.user_id = auth.uid())
);
create policy "messages insert" on public.messages for insert to authenticated with check (
  author_id = auth.uid()
  and exists (select 1 from public.room_members rm where rm.room_id = messages.room_id and rm.user_id = auth.uid())
);

-- ───────────────────── storage buckets ───────────────────
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('inbody-results', 'inbody-results', false)
  on conflict (id) do nothing;

-- avatars: public read; user writes into a folder named by their uid
create policy "avatars read"   on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- inbody result sheets: owner or trainer read; owner writes
create policy "inbody read" on storage.objects for select to authenticated
  using (bucket_id = 'inbody-results' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_trainer()));
create policy "inbody insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'inbody-results' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────── realtime (chat) ───────────────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.posts;
