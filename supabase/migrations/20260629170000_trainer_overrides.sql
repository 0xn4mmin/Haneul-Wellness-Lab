-- Trainers/admins can see and manage ALL challenges and group chats,
-- regardless of public/private. Layered on top of the existing policies by
-- adding `or public.is_trainer()`.

-- ── challenges ──────────────────────────────────────────
drop policy if exists "challenges read" on public.challenges;
create policy "challenges read" on public.challenges for select to authenticated using (
  scope = 'public' or created_by = auth.uid() or public.is_challenge_member(id) or public.is_trainer()
);
drop policy if exists "challenges update" on public.challenges;
create policy "challenges update" on public.challenges for update to authenticated
  using (created_by = auth.uid() or public.is_trainer()) with check (created_by = auth.uid() or public.is_trainer());
drop policy if exists "challenges delete" on public.challenges;
create policy "challenges delete" on public.challenges for delete to authenticated
  using (created_by = auth.uid() or public.is_trainer());

drop policy if exists "cmembers read" on public.challenge_members;
create policy "cmembers read" on public.challenge_members for select to authenticated
  using (public.is_challenge_member(challenge_id) or public.is_trainer());
drop policy if exists "cmembers insert" on public.challenge_members;
create policy "cmembers insert" on public.challenge_members for insert to authenticated
  with check (user_id = auth.uid() or public.is_trainer()
    or exists(select 1 from public.challenges c where c.id = challenge_id and c.created_by = auth.uid()));
drop policy if exists "cmembers delete" on public.challenge_members;
create policy "cmembers delete" on public.challenge_members for delete to authenticated
  using (user_id = auth.uid() or public.is_trainer()
    or exists(select 1 from public.challenges c where c.id = challenge_id and c.created_by = auth.uid()));

drop policy if exists "cgoals read" on public.challenge_goals;
create policy "cgoals read" on public.challenge_goals for select to authenticated
  using (public.is_challenge_member(challenge_id) or public.is_trainer());

-- progress visible to members OR any trainer
create or replace function public.get_challenge_progress(p_challenge uuid)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not (public.is_challenge_member(p_challenge) or public.is_trainer()) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(r), '[]'::jsonb) into result from (
    select jsonb_build_object(
      'user_id', g.user_id, 'name', p.name, 'initials', p.initials,
      'color', p.avatar_color, 'photo_path', p.photo_path,
      'metric_key', g.metric_key, 'mode', g.mode, 'target', g.target, 'baseline', g.baseline,
      'current', (select value from public.metric_readings mr
                   where mr.user_id = g.user_id and mr.metric_key = g.metric_key order by mr.date desc limit 1),
      'prev', (select value from public.metric_readings mr2
                where mr2.user_id = g.user_id and mr2.metric_key = g.metric_key order by mr2.date desc offset 1 limit 1)
    ) as r
    from public.challenge_goals g join public.profiles p on p.id = g.user_id
    where g.challenge_id = p_challenge order by g.created_at
  ) sub;
  return result;
end $$;

-- ── chat ────────────────────────────────────────────────
drop policy if exists "rooms read" on public.chat_rooms;
create policy "rooms read" on public.chat_rooms for select to authenticated using (
  not is_private or created_by = auth.uid() or public.is_trainer()
  or exists (select 1 from public.room_members rm where rm.room_id = chat_rooms.id and rm.user_id = auth.uid())
);
drop policy if exists "rooms delete" on public.chat_rooms;
create policy "rooms delete" on public.chat_rooms for delete to authenticated
  using (created_by = auth.uid() or public.is_trainer());

drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select to authenticated using (
  public.is_trainer() or exists (select 1 from public.room_members rm where rm.room_id = messages.room_id and rm.user_id = auth.uid())
);
drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages for insert to authenticated with check (
  author_id = auth.uid()
  and (public.is_trainer() or exists (select 1 from public.room_members rm where rm.room_id = messages.room_id and rm.user_id = auth.uid()))
);
drop policy if exists "messages update own" on public.messages;
create policy "messages update own" on public.messages for update to authenticated
  using (author_id = auth.uid() or public.is_trainer()) with check (author_id = auth.uid() or public.is_trainer());

drop policy if exists "reactions read" on public.message_reactions;
create policy "reactions read" on public.message_reactions for select to authenticated using (
  public.is_trainer() or exists (select 1 from public.messages m join public.room_members rm on rm.room_id = m.room_id
    where m.id = message_id and rm.user_id = auth.uid())
);
