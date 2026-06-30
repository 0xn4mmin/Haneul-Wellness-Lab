-- ─────────── Scheduler hardening: status check, re-reg alert, reminders ───────────

-- 1) valid status values only
alter table public.class_sessions drop constraint if exists class_sessions_status_chk;
alter table public.class_sessions add constraint class_sessions_status_chk
  check (status in ('scheduled', 'attended', 'sameday_cancel', 'cancelled'));

-- 2) re-registration alert: when a session is consumed (출석/당일취소) and the
--    linked package drops to 2 or 1 sessions left, notify the trainer.
create or replace function public.notify_pkg_low() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_total int; v_used int; v_remaining int; v_member text;
begin
  if new.package_id is null or new.member_id is null then return new; end if;
  if new.status not in ('attended', 'sameday_cancel') then return new; end if;
  if tg_op = 'UPDATE' and old.status = new.status then return new; end if;
  select total_sessions into v_total from public.class_packages where id = new.package_id;
  select count(*) into v_used from public.class_sessions
    where package_id = new.package_id and status in ('attended', 'sameday_cancel');
  v_remaining := coalesce(v_total, 0) - v_used;
  if v_remaining in (1, 2) then
    select name into v_member from public.profiles where id = new.member_id;
    insert into public.notifications (user_id, actor_id, type, text)
    values (new.trainer_id, new.member_id, 'class',
            coalesce(v_member, '회원') || '님 재등록 임박 — ' || v_remaining || '회 남았어요.');
  end if;
  return new;
end $$;
drop trigger if exists on_session_consume on public.class_sessions;
create trigger on_session_consume after insert or update of status on public.class_sessions
  for each row execute function public.notify_pkg_low();

-- 3) scheduled in-app reminders: today's classes + tomorrow's classes.
--    Delivered as notifications (bell + realtime + best-effort popup).
create or replace function public.send_class_reminders() returns void
  language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select cs.member_id, cs.trainer_id, cs.title,
           to_char(cs.starts_at at time zone 'Asia/Seoul', 'HH24:MI') as t,
           case when (cs.starts_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
                then '오늘' else '내일' end as day
    from public.class_sessions cs
    where cs.member_id is not null and cs.status = 'scheduled'
      and (cs.starts_at at time zone 'Asia/Seoul')::date
          in ((now() at time zone 'Asia/Seoul')::date, (now() at time zone 'Asia/Seoul')::date + 1)
  loop
    insert into public.notifications (user_id, actor_id, type, text)
    values (r.member_id, r.trainer_id, 'class', r.day || ' ' || r.t || ' ' || r.title || ' 수업이 있어요.');
  end loop;
end $$;

-- run daily at 10:00 KST (01:00 UTC). Needs the pg_cron extension.
create extension if not exists pg_cron;
select cron.unschedule('class-reminders') where exists (select 1 from cron.job where jobname = 'class-reminders');
select cron.schedule('class-reminders', '0 1 * * *', $$select public.send_class_reminders();$$);
