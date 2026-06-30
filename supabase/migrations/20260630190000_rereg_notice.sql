-- Trainer-initiated re-registration notice to a member (in-app notification).
create or replace function public.send_rereg_notice(p_member uuid, p_text text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trainer() then
    raise exception '트레이너만 보낼 수 있어요.' using errcode = '42501';
  end if;
  insert into public.notifications (user_id, actor_id, type, text)
  values (p_member, auth.uid(), 'class', p_text);
end $$;
grant execute on function public.send_rereg_notice(uuid, text) to authenticated;
