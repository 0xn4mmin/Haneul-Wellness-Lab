-- ─────────── member groups (studios) ───────────
-- The trainer assigns each member a group. The three location groups
-- (래미안그레이튼 · 선릉 핏허브 · 청담 쉐어필라테스) share member visibility with one
-- another; BigDaS is fully isolated (bidirectional). Unassigned (null) defaults
-- to the shared cluster.
alter table public.profiles add column if not exists studio text;

create or replace function public.set_member_studio(p_member uuid, p_studio text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer() then
    raise exception '트레이너만 변경할 수 있어요.' using errcode = '42501';
  end if;
  if p_studio is not null and p_studio not in ('BigDaS', '래미안그레이튼', '선릉 핏허브', '청담 쉐어필라테스') then
    raise exception 'invalid studio';
  end if;
  update public.profiles set studio = p_studio where id = p_member;
end $$;
grant execute on function public.set_member_studio(uuid, text) to authenticated;
