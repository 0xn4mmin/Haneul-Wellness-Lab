-- Optional demo seed: creates the supporting cast (코치 하늘 · 이민서 · 조다온 ·
-- 김아리) as REAL auth users with profiles, metric series, a shared chat room +
-- conversation, community posts, a coach chart comment, and a cheer — so the
-- Members / Chat / Community / Trainer views are populated with real data.
--
-- Run this whole file once in the SQL Editor (it defines the functions), then:
--     select public.seed_community('<YOUR-MAIN-USER-UUID>');
-- (Authentication → Users → copy your demo account's UID.)
--
-- Safe to re-run. Supporting accounts use password 'Demo1234!' (you don't need
-- to log in as them). Direct auth.users inserts bypass the API email check.

-- ── helper: create a confirmed auth user + profile ──
create or replace function public._seed_user(
  p_id uuid, p_email text, p_name text, p_initials text, p_color text,
  p_role user_role, p_bio text, p_bio2 text
) returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, crypt('Demo1234!', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name', p_name, 'initials', p_initials),
    '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email), 'email', now(), now(), now())
  on conflict (provider, provider_id) do nothing;

  -- ensure profile (trigger creates it on insert; upsert covers re-runs)
  insert into public.profiles (id, name, initials, avatar_color, role, bio, bio2)
  values (p_id, p_name, p_initials, p_color, p_role, p_bio, p_bio2)
  on conflict (id) do update set
    name = excluded.name, initials = excluded.initials, avatar_color = excluded.avatar_color,
    role = excluded.role, bio = excluded.bio, bio2 = excluded.bio2;

  insert into public.metric_privacy (user_id, metric_key, visibility)
  select p_id, k, 'private' from unnest(array['score','weight','smm','pbf','bodyFatMass','bmi','bmr','visceral','tbw']) k
  on conflict do nothing;
end $$;

-- ── helper: synthesize a 6-month improving series from latest values ──
create or replace function public._seed_series(
  uid uuid, sc numeric, pbf numeric, smm numeric, wt numeric, bmi numeric, tbw numeric
) returns void language plpgsql security definer set search_path = public as $$
declare
  dts date[] := array[date '2026-01-12', date '2026-02-09', date '2026-03-15', date '2026-04-12', date '2026-05-10', date '2026-06-14'];
  i int;
begin
  delete from metric_readings where user_id = uid;
  for i in 0..5 loop
    insert into metric_readings (user_id, date, metric_key, value) values
      (uid, dts[i + 1], 'score',  round(sc - (5 - i) * 1.4)),
      (uid, dts[i + 1], 'pbf',    round((pbf + (5 - i) * 1.2)::numeric, 1)),
      (uid, dts[i + 1], 'smm',    round((smm - (5 - i) * 0.45)::numeric, 1)),
      (uid, dts[i + 1], 'weight', round((wt + (5 - i) * 0.9)::numeric, 1)),
      (uid, dts[i + 1], 'bmi',    round((bmi + (5 - i) * 0.28)::numeric, 1)),
      (uid, dts[i + 1], 'tbw',    round((tbw - (5 - i) * 0.35)::numeric, 1));
  end loop;
end $$;

-- ── main: build the community around the given user ──
create or replace function public.seed_community(main_uid uuid)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  coach  uuid := '11111111-1111-1111-1111-111111111111';
  minseo uuid := '22222222-2222-2222-2222-222222222222';
  daon   uuid := '33333333-3333-3333-3333-333333333333';
  ari    uuid := '44444444-4444-4444-4444-444444444444';
  rid    uuid;
begin
  perform public._seed_user(coach,  'coach@haneul.demo',  '코치 하늘', '하늘', '#234B47', 'trainer', '회원 전담 코치', '퍼스널 트레이닝 8년차');
  perform public._seed_user(minseo, 'minseo@haneul.demo', '이민서',   '민서', '#BE7A57', 'client',  '체지방 감량 여정', '주 4회 트레이닝 · 사이클 러버');
  perform public._seed_user(daon,   'daon@haneul.demo',   '조다온',   '다온', '#C29A4B', 'client',  '리컴포지션 · 오픈북', '입문 3개월 · 식물성 식단');
  perform public._seed_user(ari,    'ari@haneul.demo',    '김아리',   '아리', '#5E97A0', 'client',  '대부분 비공개', '마라토너 · 모빌리티 집중');

  perform public._seed_series(minseo, 88, 18.4, 33.2, 61.0, 22.1, 36.5);
  perform public._seed_series(daon,   79, 21.0, 30.1, 70.5, 24.0, 38.2);
  perform public._seed_series(ari,    82, 19.5, 28.4, 55.2, 20.8, 33.1);

  -- per-member public/private split (RLS hides the rest)
  update metric_privacy set visibility = 'public' where user_id = minseo and metric_key in ('score','weight','pbf','smm');
  update metric_privacy set visibility = 'public' where user_id = daon   and metric_key in ('score','weight','smm','pbf','bmi','tbw');
  update metric_privacy set visibility = 'public' where user_id = ari    and metric_key in ('score');

  -- shared chat room + conversation
  select id into rid from chat_rooms where name = '하늘 라운지' limit 1;
  if rid is null then insert into chat_rooms (name, is_private) values ('하늘 라운지', false) returning id into rid; end if;
  insert into room_members (room_id, user_id) values (rid, main_uid), (rid, coach), (rid, minseo), (rid, daon), (rid, ari) on conflict do nothing;
  delete from messages where room_id = rid;
  insert into messages (room_id, author_id, text, created_at) values
    (rid, coach,    '좋은 아침이에요, 여러분 🌱 이번 주 측정 주간이에요. 오늘 오시는 분?', now() - interval '40 min'),
    (rid, minseo,   '저요! 11시 슬롯이에요. 떨리고 설레요.', now() - interval '37 min'),
    (rid, daon,     '바로 다음 11시 반이요. 가보자고요 💪', now() - interval '35 min'),
    (rid, main_uid, '저는 2시 예약했어요. 코치님, 측정 전에 존2 걷기 하고 갈까요?', now() - interval '30 min'),
    (rid, coach,    '측정 전에는 걷기 건너뛰는 게 좋아요. 수분 수치가 깔끔하게 나오게 측정 후에 하세요 👍', now() - interval '28 min'),
    (rid, ari,      '조용히 보고 있지만 다들 응원해요 💚', now() - interval '22 min');

  -- community feed
  delete from posts where author_id in (coach, minseo, daon);
  insert into posts (author_id, text, shared_metric, created_at) values
    (coach,  '측정 팁 하나 드려요 🌿 인바디 당일 아침엔 물을 충분히 마시고, 측정 2시간 전에는 과식을 피해주세요. 같은 조건에서 재야 데이터가 정직해집니다.', null, now() - interval '3 hour'),
    (minseo, '3개월 차, 드디어 이 과정을 믿게 됐어요. 체지방 한 단계가 통째로 빠졌고 오후에 늘어지던 컨디션이 완전히 달라졌어요.', '{"val":"-4.2%","label":"체지방률","sub":"3월 → 6월 · 전체 공개"}', now() - interval '6 hour'),
    (daon,   '질문 하나! 운동 후에 든든한 식물성 간식 추천받아요. 오후에 당 떨어지는 거 잡고 싶어요.', null, now() - interval '1 day');
  insert into post_comments (post_id, author_id, text) select id, daon, '저장했어요! 물 마시는 거 항상 까먹네요.' from posts where author_id = coach;
  insert into post_comments (post_id, author_id, text) select id, main_uid, '진짜 동기부여 돼요, 축하해요!' from posts where author_id = minseo;
  insert into post_likes (post_id, user_id) select id, main_uid from posts where author_id in (coach, minseo) on conflict do nothing;
  insert into post_likes (post_id, user_id) select id, ari from posts where author_id = minseo on conflict do nothing;

  -- coach note on the main user's 골격근 chart
  delete from chart_comments where owner_id = main_uid and author_id = coach;
  insert into chart_comments (owner_id, metric_key, author_id, text) values
    (main_uid, 'smm', coach, '꾸준히 우상향이에요 — 운동 일관성이 그대로 보입니다. 다음 사이클엔 몸통 근력을 더 끌어올려봐요.');

  -- cheer on 이민서
  delete from member_cheers where target_user_id = minseo and author_id = coach;
  insert into member_cheers (target_user_id, author_id, text) values (minseo, coach, '교과서 같은 성장이에요, 민서님. 자랑스러워요.');
end $$;
