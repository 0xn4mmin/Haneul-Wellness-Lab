-- Challenge progress baseline = the member's measurement ON the challenge's
-- start date (not the value captured when the goal was set). If there's no
-- reading on the start date, baseline is null and the app prompts an upload.
create or replace function public.get_challenge_progress(p_challenge uuid)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb; v_start date;
begin
  if not (public.is_challenge_member(p_challenge) or public.is_trainer()) then return '[]'::jsonb; end if;
  select starts_at into v_start from public.challenges where id = p_challenge;
  select coalesce(jsonb_agg(r), '[]'::jsonb) into result from (
    select jsonb_build_object(
      'user_id', g.user_id, 'name', p.name, 'initials', p.initials,
      'color', p.avatar_color, 'photo_path', p.photo_path,
      'metric_key', g.metric_key, 'mode', g.mode, 'target', g.target,
      -- baseline = the reading on the challenge start date (null if missing)
      'baseline', (select value from public.metric_readings mb
                    where mb.user_id = g.user_id and mb.metric_key = g.metric_key and mb.date = v_start limit 1),
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
