-- Recuperada de supabase_migrations.schema_migrations (20260911175113_service_alerts_and_overview).
-- Foi aplicada direto no banco e nunca chegou ao repositório; este é o SQL
-- original, não uma reconstrução a partir do schema.

-- Alertas de atendimento (o que a IA não resolveu) separados dos clínicos.
alter table public.alerts add column if not exists kind text not null default 'clinical';
alter table public.alerts drop constraint if exists alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check
  check (kind in ('clinical', 'question', 'scheduling', 'handoff', 'technical'));

-- Um alerta de atendimento aberto por paciente e tipo: o segundo caso entra no mesmo.
create unique index if not exists alerts_one_open_service_per_kind
  on public.alerts (patient_id, kind)
  where status = 'open' and kind <> 'clinical';

-- Horário de atendimento lido pelo agente: {"days":[1,2,3,4,5],"start":9,"end":18,"slot_minutes":30}.
alter table public.clinics add column if not exists business_hours jsonb;

-- Risco e "em alerta" contam só o clínico; atendimento ganha coluna própria.
-- security_invoker mantém a RLS das tabelas de base (isolamento por clínica).
create or replace view public.patient_overview with (security_invoker = true) as
 SELECT p.id,
    p.clinic_id,
    p.full_name,
    p.cpf,
    p.birth_date,
    p.phone,
    p.email,
    p.photo_url,
    p.notes,
    p.status AS patient_status,
    p.created_at,
    p.updated_at,
    s.id AS surgery_id,
    s.surgery_type,
    s.date AS surgery_date,
    s.hospital,
    s.surgeon,
    s.protocol_id,
    s.status AS surgery_status,
    pr.name AS protocol_name,
        CASE
            WHEN s.date IS NOT NULL THEN CURRENT_DATE - s.date
            ELSE NULL::integer
        END AS current_day,
    ( SELECT count(*) AS count
           FROM alerts a
          WHERE a.patient_id = p.id AND a.status = 'open'::alert_status AND a.kind = 'clinical') AS open_alerts,
    ( SELECT max(
                CASE a.severity
                    WHEN 'critical'::alert_severity THEN 3
                    WHEN 'high'::alert_severity THEN 2
                    ELSE 1
                END) AS max
           FROM alerts a
          WHERE a.patient_id = p.id AND a.status = 'open'::alert_status AND a.kind = 'clinical') AS max_open_severity,
    GREATEST(p.updated_at, COALESCE(( SELECT max(c.created_at) AS max
           FROM checkins c
          WHERE c.patient_id = p.id), p.created_at), COALESCE(( SELECT max(m.created_at) AS max
           FROM messages m
          WHERE m.patient_id = p.id), p.created_at)) AS last_activity,
    p.funnel_status,
    ( SELECT count(*) AS count
           FROM alerts a
          WHERE a.patient_id = p.id AND a.status = 'open'::alert_status AND a.kind <> 'clinical') AS open_service_alerts
   FROM patients p
     LEFT JOIN LATERAL ( SELECT s2.id,
            s2.clinic_id,
            s2.patient_id,
            s2.protocol_id,
            s2.surgery_type,
            s2.date,
            s2.hospital,
            s2.surgeon,
            s2.status,
            s2.created_at
           FROM surgeries s2
          WHERE s2.patient_id = p.id
          ORDER BY (s2.status = 'active'::surgery_status) DESC, s2.date DESC
         LIMIT 1) s ON true
     LEFT JOIN protocols pr ON pr.id = s.protocol_id;

-- Avisos para a equipe (whatsapp_alert) carregam patient_id para o painel ligar
-- ao paciente, mas não podem ir para o push nem para o app do próprio paciente.
create or replace function public.notify_push_on_notification()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.patient_id is not null and new.type <> 'whatsapp_alert' then
    perform net.http_post(
      url := 'https://ktfhmrgwbclewlwbqtag.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-push-secret', coalesce(current_setting('app.push_hook_secret', true), '')
      ),
      body := jsonb_build_object(
        'patientId', new.patient_id,
        'title', new.title,
        'body', coalesce(new.description, '')
      )
    );
  end if;
  return new;
end $function$;

alter policy notifications_patient_read on public.notifications
  using (patient_id = current_patient_id() and type <> 'whatsapp_alert');
alter policy notifications_patient_update on public.notifications
  using (patient_id = current_patient_id() and type <> 'whatsapp_alert')
  with check (patient_id = current_patient_id() and type <> 'whatsapp_alert');
