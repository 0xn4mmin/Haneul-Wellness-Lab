-- Trainers/admins can create/update/delete ANY member's challenge goal
-- (so they can fix baselines for everyone without each member re-entering).
drop policy if exists "cgoals write" on public.challenge_goals;
create policy "cgoals write" on public.challenge_goals for all to authenticated
  using (user_id = auth.uid() or public.is_trainer())
  with check ((user_id = auth.uid() and public.is_challenge_member(challenge_id)) or public.is_trainer());
