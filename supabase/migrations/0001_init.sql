-- PostCare Pro — schema inicial do MVP
-- Fonte da verdade: docs/PRD.md (§7 regras, §9 modelo de dados) e docs/PROJECT_STANDARDS.md.
-- Multi-tenant por clinic_id via RLS. Regras determinísticas (D+n, alertas) em trigger/SQL.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Tipos (enums)
-- ============================================================================
create type patient_status  as enum ('active', 'finished');
create type surgery_status  as enum ('scheduled', 'active', 'finished');
create type user_role       as enum ('staff', 'patient');
create type alert_severity  as enum ('medium', 'high', 'critical');
create type alert_status    as enum ('open', 'resolved');
create type message_sender  as enum ('staff', 'patient');

-- ============================================================================
-- Tabelas
-- ============================================================================

-- Clínicas (tenant)
create table clinics (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  logo_url              text,
  plan                  text not null default 'starter',
  active_patient_limit  int  not null default 100,
  created_at            timestamptz not null default now()
);

-- Protocolos por especialidade (orientações por dia vêm em protocol_steps)
create table protocols (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  name          text not null,
  specialty     text,
  duration_days int  not null default 30,
  color         text,
  created_at    timestamptz not null default now()
);

-- Orientação de cada dia do pós (D+n)
create table protocol_steps (
  id           uuid primary key default gen_random_uuid(),
  protocol_id  uuid not null references protocols(id) on delete cascade,
  day_offset   int  not null,               -- n em D+n
  title        text not null,
  instructions text,
  created_at   timestamptz not null default now(),
  unique (protocol_id, day_offset)
);

-- Pacientes
create table patients (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  full_name   text not null,
  cpf         text,
  birth_date  date,
  phone       text,
  email       text,
  photo_url   text,
  status      patient_status not null default 'active',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Perfis (liga auth.users ao tenant e ao papel)
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  clinic_id   uuid not null references clinics(id) on delete cascade,
  role        user_role not null,
  full_name   text,
  patient_id  uuid references patients(id) on delete set null, -- preenchido quando role = patient
  created_at  timestamptz not null default now()
);

-- Cirurgias: ligam paciente + protocolo + data (base do D+n)
create table surgeries (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete cascade,
  protocol_id  uuid references protocols(id) on delete set null,
  surgery_type text not null,
  date         date not null,               -- base do cálculo D+n
  hospital     text,
  surgeon      text,
  status       surgery_status not null default 'active',
  created_at   timestamptz not null default now()
);

-- Check-ins diários do paciente
create table checkins (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  surgery_id  uuid not null references surgeries(id) on delete cascade,
  day_number  int,                          -- D+n calculado no trigger
  pain        int check (pain between 0 and 10),
  fever       boolean not null default false,
  bleeding    boolean not null default false,
  swelling    boolean not null default false,
  feeling     text,                         -- 'bem' | 'regular' | 'mal'
  notes       text,
  created_at  timestamptz not null default now()
);

-- Alertas de triagem (gerados por regra, nunca diagnóstico)
create table alerts (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  checkin_id  uuid references checkins(id) on delete cascade,
  severity    alert_severity not null,
  reason      text not null,
  status      alert_status not null default 'open',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- Mensagens clínica <-> paciente
create table messages (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  sender      message_sender not null,
  body        text not null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Índices úteis
create index on protocols(clinic_id);
create index on protocol_steps(protocol_id);
create index on patients(clinic_id);
create index on surgeries(clinic_id);
create index on surgeries(patient_id);
create index on checkins(clinic_id);
create index on checkins(patient_id);
create index on alerts(clinic_id);
create index on alerts(patient_id);
create index on alerts(status);
create index on messages(clinic_id);
create index on messages(patient_id);

-- ============================================================================
-- Helpers de autenticação (SECURITY DEFINER p/ não recursar na RLS de profiles)
-- ============================================================================
create or replace function current_clinic_id()
returns uuid language sql stable security definer set search_path = public as $$
  select clinic_id from profiles where id = auth.uid()
$$;

create or replace function current_role_pc()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function current_patient_id()
returns uuid language sql stable security definer set search_path = public as $$
  select patient_id from profiles where id = auth.uid()
$$;

-- ============================================================================
-- Regra de negócio: D+n e triagem de alertas (determinístico, no banco)
-- ============================================================================

-- Calcula day_number (D+n) e herda clinic_id/patient_id da cirurgia
create or replace function checkin_set_day_number()
returns trigger language plpgsql set search_path = public as $$
declare s surgeries;
begin
  select * into s from surgeries where id = new.surgery_id;
  if s.id is null then
    raise exception 'Cirurgia % não encontrada', new.surgery_id;
  end if;
  new.clinic_id  := s.clinic_id;
  new.patient_id := s.patient_id;
  new.day_number := (new.created_at::date - s.date);
  return new;
end;
$$;

create trigger trg_checkin_day_number
  before insert on checkins
  for each row execute function checkin_set_day_number();

-- Triagem: gera no máximo 1 alerta pela maior severidade
-- febre OU sangramento -> critical | dor >= 8 -> high | dor >= 6 ou 'mal' -> medium
create or replace function checkin_triage()
returns trigger language plpgsql set search_path = public as $$
declare
  sev    alert_severity;
  reason text;
begin
  if new.fever or new.bleeding then
    sev := 'critical';
    reason := 'Sinais de risco no check-in: '
      || case when new.fever then 'febre ' else '' end
      || case when new.bleeding then 'sangramento ' else '' end;
  elsif new.pain is not null and new.pain >= 8 then
    sev := 'high';
    reason := 'Dor intensa relatada (nível ' || new.pain || ').';
  elsif (new.pain is not null and new.pain >= 6) or new.feeling = 'mal' then
    sev := 'medium';
    reason := 'Paciente relata desconforto (dor '
      || coalesce(new.pain::text, 's/ nota') || ', estado: '
      || coalesce(new.feeling, 'n/i') || ').';
  else
    return new;
  end if;

  insert into alerts (clinic_id, patient_id, checkin_id, severity, reason)
  values (new.clinic_id, new.patient_id, new.id, sev, trim(reason));
  return new;
end;
$$;

create trigger trg_checkin_triage
  after insert on checkins
  for each row execute function checkin_triage();

-- ============================================================================
-- RLS: staff enxerga a própria clínica; paciente enxerga o próprio prontuário
-- ============================================================================
alter table clinics        enable row level security;
alter table protocols      enable row level security;
alter table protocol_steps enable row level security;
alter table patients       enable row level security;
alter table profiles       enable row level security;
alter table surgeries      enable row level security;
alter table checkins       enable row level security;
alter table alerts         enable row level security;
alter table messages       enable row level security;

-- clinics: membros da clínica leem a própria
create policy clinics_select on clinics
  for select using (id = current_clinic_id());

-- profiles: cada um lê o próprio; staff lê perfis da própria clínica
create policy profiles_select on profiles
  for select using (id = auth.uid()
    or (current_role_pc() = 'staff' and clinic_id = current_clinic_id()));

-- protocolos / passos: leitura por clínica; escrita só staff
create policy protocols_select on protocols
  for select using (clinic_id = current_clinic_id());
create policy protocols_write on protocols
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

create policy steps_select on protocol_steps
  for select using (exists (
    select 1 from protocols p where p.id = protocol_id and p.clinic_id = current_clinic_id()));
create policy steps_write on protocol_steps
  for all using (current_role_pc() = 'staff' and exists (
    select 1 from protocols p where p.id = protocol_id and p.clinic_id = current_clinic_id()))
  with check (current_role_pc() = 'staff' and exists (
    select 1 from protocols p where p.id = protocol_id and p.clinic_id = current_clinic_id()));

-- Macro de acesso "staff da clínica OU o próprio paciente" replicada nas tabelas de dados
create policy patients_read on patients
  for select using (clinic_id = current_clinic_id()
    and (current_role_pc() = 'staff' or id = current_patient_id()));
create policy patients_write on patients
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

create policy surgeries_read on surgeries
  for select using (clinic_id = current_clinic_id()
    and (current_role_pc() = 'staff' or patient_id = current_patient_id()));
create policy surgeries_write on surgeries
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

-- checkins: paciente insere/lê os próprios; staff lê os da clínica
create policy checkins_read on checkins
  for select using (clinic_id = current_clinic_id()
    and (current_role_pc() = 'staff' or patient_id = current_patient_id()));
create policy checkins_insert on checkins
  for insert with check (current_role_pc() = 'patient'
    and exists (select 1 from surgeries s
      where s.id = surgery_id and s.patient_id = current_patient_id()));

-- alerts: leitura por clínica/paciente; staff resolve (update)
create policy alerts_read on alerts
  for select using (clinic_id = current_clinic_id()
    and (current_role_pc() = 'staff' or patient_id = current_patient_id()));
create policy alerts_update on alerts
  for update using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

-- messages: leitura por clínica/paciente; cada lado insere como si mesmo
create policy messages_read on messages
  for select using (clinic_id = current_clinic_id()
    and (current_role_pc() = 'staff' or patient_id = current_patient_id()));
create policy messages_staff_insert on messages
  for insert with check (current_role_pc() = 'staff'
    and clinic_id = current_clinic_id() and sender = 'staff');
create policy messages_patient_insert on messages
  for insert with check (current_role_pc() = 'patient'
    and patient_id = current_patient_id() and sender = 'patient');
create policy messages_update on messages
  for update using (clinic_id = current_clinic_id());
