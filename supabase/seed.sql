-- Demo seed for Haneul Wellness Lab.
-- Profiles are 1:1 with auth.users, so seed data is attached to an EXISTING
-- account. After signing up, grab your user id and run:
--
--     select public.seed_demo_data(auth.uid());        -- (from the SQL editor while logged in)
--     -- or, with an explicit id:
--     select public.seed_demo_data('00000000-0000-0000-0000-000000000000');
--
-- It populates the 6-month InBody series, latest scan detail, goals, condition
-- logs, and sets the same public/private split as the original mock.

create or replace function public.seed_demo_data(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- clean slate for this user
  delete from metric_readings where user_id = uid;
  delete from measurements    where user_id = uid;
  delete from condition_logs  where user_id = uid;

  -- scan events (segmental/detail only on the latest)
  insert into measurements (user_id, date, segmental, detail, source) values
    (uid, '2026-06-14',
      '{"rightArm":{"kg":3.08,"pct":97.9},"leftArm":{"kg":2.98,"pct":94.8},"trunk":{"kg":24.5,"pct":97.7},"rightLeg":{"kg":8.83,"pct":101.2},"leftLeg":{"kg":8.89,"pct":101.8}}',
      '{"phaseAngle":6.5,"smi":8.1,"protein":11.2,"mineral":3.87,"idealWeight":66.4,"visceralLevel":5,"ecwTbw":0.373}',
      'manual'),
    (uid, '2026-05-10', '{}', '{}', 'manual'),
    (uid, '2026-04-12', '{}', '{}', 'manual'),
    (uid, '2026-03-15', '{}', '{}', 'manual'),
    (uid, '2026-02-09', '{}', '{}', 'manual'),
    (uid, '2026-01-12', '{}', '{}', 'manual');

  -- per-metric time series
  with d(idx, dt) as (values
      (1, date '2026-01-12'), (2, date '2026-02-09'), (3, date '2026-03-15'),
      (4, date '2026-04-12'), (5, date '2026-05-10'), (6, date '2026-06-14')),
  m(metric_key, vals) as (values
      ('score',       array[70,72,74,75,77,78]::numeric[]),
      ('weight',      array[75.8,74.6,73.4,72.4,71.4,70.6]::numeric[]),
      ('smm',         array[29.4,30.0,30.6,31.1,31.5,31.9]::numeric[]),
      ('pbf',         array[26.5,25.1,23.8,22.4,21.1,20.0]::numeric[]),
      ('bodyFatMass', array[20.1,18.7,17.4,16.2,15.1,14.1]::numeric[]),
      ('bmi',         array[25.9,25.5,25.1,24.7,24.4,24.1]::numeric[]),
      ('bmr',         array[1530,1545,1558,1570,1582,1590]::numeric[]),
      ('visceral',    array[8,7,7,6,6,5]::numeric[]),
      ('tbw',         array[39.6,40.0,40.4,40.8,41.1,41.4]::numeric[]))
  insert into metric_readings (user_id, date, metric_key, value)
  select uid, d.dt, m.metric_key, m.vals[d.idx]
  from d cross join m;

  -- goals
  insert into goals (user_id, score, smm, pbf, visceral)
  values (uid, 90, 34, 15, 4)
  on conflict (user_id) do update set score = 90, smm = 34, pbf = 15, visceral = 4;

  -- public/private split matching the original mock
  update metric_privacy set visibility = 'public'
    where user_id = uid and metric_key in ('score','weight','smm','bmi','tbw');
  update metric_privacy set visibility = 'private'
    where user_id = uid and metric_key in ('pbf','bodyFatMass','visceral');

  -- condition log
  insert into condition_logs (user_id, week, sleep, water, mood, workouts) values
    (uid, '6월 2주', 7.4, 2.5, 4, 4),
    (uid, '6월 1주', 6.8, 2.1, 3, 3),
    (uid, '5월 4주', 7.6, 2.6, 5, 4),
    (uid, '5월 3주', 6.1, 1.8, 3, 2);
end; $$;
