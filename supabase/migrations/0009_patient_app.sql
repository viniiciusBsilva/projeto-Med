-- App do paciente: RLS de paciente, intake do transplante, device tokens e bucket de fotos.

-- 1) RLS: paciente lê a PRÓPRIA agenda e as PRÓPRIAS notificações
-- A policy de clínica (0003) precisa ser só staff, senão o paciente (que tem clinic_id) via tudo.
drop policy appointments_read on appointments;
create policy appointments_read on appointments
  for select using (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

create policy appointments_patient_read on appointments
  for select using (patient_id = current_patient_id());

create policy notifications_patient_read on notifications
  for select using (patient_id = current_patient_id());
create policy notifications_patient_update on notifications
  for update using (patient_id = current_patient_id())
  with check (patient_id = current_patient_id());

-- 2) Intake do transplante capilar (dados essenciais informados no cadastro)
create table surgery_intake (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references patients(id) on delete cascade,
  clinic_id     uuid not null references clinics(id) on delete cascade,
  technique     text,           -- FUE / DHI
  region        text,           -- frontal / coroa / entradas / completo
  grafts_estimate int,
  medications   text,
  allergies     text,
  comorbidities text,
  smoker        boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now()
);
create index on surgery_intake(patient_id);
alter table surgery_intake enable row level security;
create policy intake_read on surgery_intake
  for select using (clinic_id = current_clinic_id()
    and (current_role_pc() = 'staff' or patient_id = current_patient_id()));
create policy intake_patient_write on surgery_intake
  for all using (current_role_pc() = 'patient' and patient_id = current_patient_id())
  with check (current_role_pc() = 'patient' and patient_id = current_patient_id());
create policy intake_staff_write on surgery_intake
  for all using (current_role_pc() = 'staff' and clinic_id = current_clinic_id())
  with check (current_role_pc() = 'staff' and clinic_id = current_clinic_id());

-- 3) Tokens de push por dispositivo (dono gerencia o próprio)
create table device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  patient_id uuid references patients(id) on delete set null,
  token      text not null unique,
  platform   text,
  updated_at timestamptz not null default now()
);
create index on device_tokens(patient_id);
alter table device_tokens enable row level security;
create policy device_tokens_owner on device_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4) Bucket privado de fotos do paciente (pasta = patient_id)
insert into storage.buckets (id, name, public)
values ('patient-photos', 'patient-photos', false)
on conflict (id) do nothing;

create policy patient_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = current_patient_id()::text);
create policy patient_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'patient-photos'
    and ((storage.foldername(name))[1] = current_patient_id()::text
      or current_role_pc() = 'staff'));
create policy patient_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'patient-photos' and (storage.foldername(name))[1] = current_patient_id()::text);
