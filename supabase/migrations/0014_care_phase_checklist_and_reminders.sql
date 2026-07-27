-- Fase (pré/pós-operatório) no agendamento + checklist marcável por fase + dicas diárias
-- + job pg_cron que envia um lembrete diário (in-app; vira push quando o FCM for configurado).

-- 1) Fase no agendamento
create type care_phase as enum ('preop', 'postop');

alter table appointments
  add column phase       care_phase,
  add column phase_start date,
  add column phase_end   date;

-- 2) Itens de checklist por clínica + fase (marcáveis pelo paciente a cada dia)
create table checklist_items (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  phase      care_phase not null,
  sort_order int not null default 0,
  text       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index on checklist_items(clinic_id, phase);

-- 3) Dicas diárias (rotacionadas pelo job) por clínica + fase
create table care_tips (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  phase      care_phase not null,
  sort_order int not null default 0,
  body       text not null,
  created_at timestamptz not null default now()
);
create index on care_tips(clinic_id, phase);

-- 4) Marcação diária do paciente (presença = feito naquele dia)
create table checklist_completions (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  item_id    uuid not null references checklist_items(id) on delete cascade,
  check_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  created_at timestamptz not null default now(),
  unique (patient_id, item_id, check_date)
);
create index on checklist_completions(patient_id, check_date);

-- 5) RLS
alter table checklist_items       enable row level security;
alter table care_tips             enable row level security;
alter table checklist_completions enable row level security;

-- Conteúdo (itens/dicas): leitura por toda a clínica (staff e paciente); escrita só staff.
create policy checklist_items_read on checklist_items
  for select using (clinic_id = current_clinic_id());
create policy checklist_items_write on checklist_items
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

create policy care_tips_read on care_tips
  for select using (clinic_id = current_clinic_id());
create policy care_tips_write on care_tips
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

-- Marcações: paciente gerencia as próprias; staff lê as da clínica.
create policy completions_patient_all on checklist_completions
  for all using (patient_id = current_patient_id())
  with check (patient_id = current_patient_id());
create policy completions_staff_read on checklist_completions
  for select using (
    current_role_pc() = 'staff'
    and exists (
      select 1 from patients p
      where p.id = checklist_completions.patient_id
        and p.clinic_id = current_clinic_id()
    )
  );

-- 6) Job diário: um lembrete por paciente com fase ativa hoje (dedupe por dia).
create extension if not exists pg_cron;

create or replace function send_daily_care_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare
  rec         record;
  v_today     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_tip       text;
  v_ntips     int;
  v_idx       int;
  v_label     text;
begin
  for rec in
    select distinct on (a.patient_id)
           a.patient_id, a.clinic_id, a.phase, a.phase_start
    from appointments a
    where a.phase is not null
      and a.patient_id is not null
      and a.phase_start is not null
      and a.phase_end   is not null
      and v_today between a.phase_start and a.phase_end
    order by a.patient_id, a.phase_start desc
  loop
    -- já enviado hoje? então pula (dedupe)
    if exists (
      select 1 from notifications n
      where n.patient_id = rec.patient_id
        and n.type = 'care_reminder'
        and (n.created_at at time zone 'America/Sao_Paulo')::date = v_today
    ) then
      continue;
    end if;

    -- dica do dia: rotaciona pelas care_tips da fase
    select count(*) into v_ntips
      from care_tips where clinic_id = rec.clinic_id and phase = rec.phase;
    v_tip := null;
    if v_ntips > 0 then
      v_idx := (v_today - rec.phase_start) % v_ntips;
      select body into v_tip
        from care_tips
       where clinic_id = rec.clinic_id and phase = rec.phase
       order by sort_order, created_at
       offset v_idx limit 1;
    end if;

    v_label := case rec.phase when 'preop' then 'pré-operatório' else 'pós-operatório' end;

    insert into notifications (clinic_id, patient_id, type, title, description, severity)
    values (
      rec.clinic_id, rec.patient_id, 'care_reminder',
      'Checklist do ' || v_label,
      coalesce(v_tip, 'Não esqueça de completar o checklist de hoje.'),
      'info'
    );
  end loop;
end $$;

revoke execute on function send_daily_care_reminders() from public, anon, authenticated;

-- 12:00 UTC ≈ 09:00 America/Sao_Paulo
select cron.schedule('daily-care-reminders', '0 12 * * *', $$select send_daily_care_reminders()$$);
