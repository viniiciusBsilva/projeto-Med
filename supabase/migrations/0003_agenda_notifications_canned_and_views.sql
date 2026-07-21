-- Fase 2 usada pelo painel: agenda, notificações, respostas prontas + visão consolidada do paciente.

create type appointment_type      as enum ('return', 'consultation', 'surgery', 'alert');
create type notification_severity as enum ('info', 'warning', 'critical');

create table appointments (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  patient_id   uuid references patients(id) on delete set null,
  title        text not null,
  type         appointment_type not null default 'consultation',
  scheduled_at timestamptz not null,
  professional text,
  created_at   timestamptz not null default now()
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid references patients(id) on delete set null,
  type        text not null,
  title       text not null,
  description text,
  severity    notification_severity not null default 'info',
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table canned_responses (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  title      text not null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index on appointments(clinic_id);
create index on appointments(scheduled_at);
create index on notifications(clinic_id);
create index on notifications(read);
create index on canned_responses(clinic_id);

alter table appointments     enable row level security;
alter table notifications    enable row level security;
alter table canned_responses enable row level security;

create policy appointments_read on appointments
  for select using (clinic_id = current_clinic_id());
create policy appointments_write on appointments
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

create policy notifications_read on notifications
  for select using (clinic_id = current_clinic_id() and current_role_pc() = 'staff');
create policy notifications_write on notifications
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

create policy canned_read on canned_responses
  for select using (clinic_id = current_clinic_id() and current_role_pc() = 'staff');
create policy canned_write on canned_responses
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

-- Visão consolidada do paciente (status/risco/D+n derivados). security_invoker => respeita a RLS do usuário.
create view patient_overview with (security_invoker = true) as
select
  p.id, p.clinic_id, p.full_name, p.cpf, p.birth_date, p.phone, p.email, p.photo_url, p.notes,
  p.status as patient_status, p.created_at, p.updated_at,
  s.id as surgery_id, s.surgery_type, s.date as surgery_date, s.hospital, s.surgeon,
  s.protocol_id, s.status as surgery_status, pr.name as protocol_name,
  case when s.date is not null then (current_date - s.date) end as current_day,
  (select count(*) from alerts a where a.patient_id = p.id and a.status = 'open') as open_alerts,
  (select max(case a.severity when 'critical' then 3 when 'high' then 2 else 1 end)
     from alerts a where a.patient_id = p.id and a.status = 'open') as max_open_severity,
  greatest(
    p.updated_at,
    coalesce((select max(c.created_at) from checkins c where c.patient_id = p.id), p.created_at),
    coalesce((select max(m.created_at) from messages m where m.patient_id = p.id), p.created_at)
  ) as last_activity
from patients p
left join lateral (
  select * from surgeries s2 where s2.patient_id = p.id
  order by (s2.status = 'active') desc, s2.date desc limit 1
) s on true
left join protocols pr on pr.id = s.protocol_id;
