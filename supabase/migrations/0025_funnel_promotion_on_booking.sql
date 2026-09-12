-- Recuperada de supabase_migrations.schema_migrations (20260911181114_funnel_promotion_on_booking).
-- Foi aplicada direto no banco e nunca chegou ao repositório; este é o SQL
-- original, não uma reconstrução a partir do schema.

-- Contato do WhatsApp só vira paciente quando confirma um agendamento ou tem
-- procedimento marcado. Vale para qualquer origem: agente, painel ou app.

create or replace function public.promote_funnel_on_appointment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.patient_id is null then
    return new;
  end if;

  if new.type = 'consultation' then
    update patients set funnel_status = 'evaluation_scheduled'
     where id = new.patient_id and funnel_status = 'lead';
  elsif new.type = 'surgery' then
    update patients set funnel_status = 'surgery_scheduled'
     where id = new.patient_id and funnel_status in ('lead', 'evaluation_scheduled', 'quote_sent');
  elsif new.type = 'return' then
    update patients set funnel_status = 'in_followup'
     where id = new.patient_id
       and funnel_status in ('lead', 'evaluation_scheduled', 'quote_sent', 'surgery_scheduled', 'operated');
  end if;
  return new;
end $function$;

drop trigger if exists trg_appt_promote_funnel on public.appointments;
create trigger trg_appt_promote_funnel
  after insert on public.appointments
  for each row execute function public.promote_funnel_on_appointment();

create or replace function public.promote_funnel_on_surgery()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update patients set funnel_status = 'surgery_scheduled'
   where id = new.patient_id and funnel_status in ('lead', 'evaluation_scheduled', 'quote_sent');
  return new;
end $function$;

drop trigger if exists trg_surgery_promote_funnel on public.surgeries;
create trigger trg_surgery_promote_funnel
  after insert or update of date on public.surgeries
  for each row execute function public.promote_funnel_on_surgery();
