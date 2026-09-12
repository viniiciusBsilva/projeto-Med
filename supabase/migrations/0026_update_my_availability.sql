-- Recuperada de supabase_migrations.schema_migrations (20260911183718_update_my_availability).
-- Foi aplicada direto no banco e nunca chegou ao repositório; este é o SQL
-- original, não uma reconstrução a partir do schema.

-- Disponibilidade da agenda, configurada pela equipe na Agenda do painel e lida
-- pelo agente do WhatsApp. A RLS de clinics só deixa o admin geral editar
-- direto; como em update_my_clinic, a equipe da clínica grava por esta função.
create or replace function public.update_my_availability(p_availability jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_clinic uuid;
  v_role   user_role;
  v_slot   int;
begin
  select clinic_id, role into v_clinic, v_role from profiles where id = auth.uid();
  if v_clinic is null or v_role <> 'staff' then
    raise exception 'Sem permissão para editar a disponibilidade.';
  end if;

  if jsonb_typeof(p_availability) <> 'object'
     or jsonb_typeof(p_availability -> 'weekly') <> 'object' then
    raise exception 'Formato de disponibilidade inválido.';
  end if;

  v_slot := (p_availability ->> 'slot_minutes')::int;
  if v_slot is null or v_slot < 5 or v_slot > 240 then
    raise exception 'Duração do atendimento inválida.';
  end if;

  update clinics set business_hours = p_availability where id = v_clinic;
end $function$;

revoke all on function public.update_my_availability(jsonb) from public, anon;
grant execute on function public.update_my_availability(jsonb) to authenticated;
