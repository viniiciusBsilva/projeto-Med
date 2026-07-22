-- Cadastro de médicos que atendem os pacientes e aparecem na agenda.
create table doctors (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  full_name  text not null,
  specialty  text,
  crm        text,
  phone      text,
  email      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index on doctors(clinic_id);

alter table doctors enable row level security;
create policy doctors_read on doctors
  for select using (clinic_id = current_clinic_id());
create policy doctors_write on doctors
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

-- Liga agendamentos e cirurgias ao médico (mantém o texto professional/surgeon denormalizado).
alter table appointments add column if not exists doctor_id uuid references doctors(id) on delete set null;
alter table surgeries    add column if not exists doctor_id uuid references doctors(id) on delete set null;
