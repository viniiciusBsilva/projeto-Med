-- Notificações automáticas para o app do paciente.
-- Inserir em `notifications` já dispara push (0010) e o paciente já lê as próprias (0009).
-- Gatilhos: nova consulta, alteração, cancelamento e mensagem da clínica.

-- Rótulo pt-BR do tipo de agendamento (reaproveitado pelos triggers).
create or replace function appointment_type_label(t appointment_type)
returns text language sql immutable as $$
  select case t
    when 'return'       then 'Retorno'
    when 'consultation' then 'Consulta'
    when 'surgery'      then 'Procedimento'
    else 'Alerta'
  end
$$;

-- Data/hora legível no fuso da clínica.
create or replace function fmt_appt_when(ts timestamptz)
returns text language sql immutable as $$
  select to_char(ts at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
$$;

-- 1) Nova consulta -> notifica o paciente
create or replace function notify_patient_on_appointment_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.patient_id is not null then
    insert into notifications (clinic_id, patient_id, type, title, description, severity)
    values (
      new.clinic_id, new.patient_id, 'appointment',
      appointment_type_label(new.type) || ' agendada',
      new.title || ' — ' || fmt_appt_when(new.scheduled_at),
      'info'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_appt_insert_notify on appointments;
create trigger trg_appt_insert_notify
  after insert on appointments
  for each row execute function notify_patient_on_appointment_insert();

-- 2) Consulta alterada (data/hora, título, tipo ou profissional) -> notifica
create or replace function notify_patient_on_appointment_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.patient_id is not null and (
        new.scheduled_at is distinct from old.scheduled_at
     or new.title        is distinct from old.title
     or new.type         is distinct from old.type
     or new.professional is distinct from old.professional) then
    insert into notifications (clinic_id, patient_id, type, title, description, severity)
    values (
      new.clinic_id, new.patient_id, 'appointment_updated',
      appointment_type_label(new.type) || ' remarcada',
      new.title || ' — agora em ' || fmt_appt_when(new.scheduled_at),
      'warning'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_appt_update_notify on appointments;
create trigger trg_appt_update_notify
  after update on appointments
  for each row execute function notify_patient_on_appointment_update();

-- 3) Consulta cancelada (DELETE) -> notifica usando os valores antigos
create or replace function notify_patient_on_appointment_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.patient_id is not null then
    insert into notifications (clinic_id, patient_id, type, title, description, severity)
    values (
      old.clinic_id, old.patient_id, 'appointment_cancelled',
      appointment_type_label(old.type) || ' cancelada',
      old.title || ' — ' || fmt_appt_when(old.scheduled_at) || ' foi cancelada',
      'critical'
    );
  end if;
  return old;
end $$;

drop trigger if exists trg_appt_delete_notify on appointments;
create trigger trg_appt_delete_notify
  after delete on appointments
  for each row execute function notify_patient_on_appointment_delete();

-- 4) Mensagem da clínica -> notifica o paciente (não notifica as próprias mensagens do paciente)
create or replace function notify_patient_on_staff_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sender = 'staff' and new.patient_id is not null then
    insert into notifications (clinic_id, patient_id, type, title, description, severity)
    values (
      new.clinic_id, new.patient_id, 'message',
      'Nova mensagem da clínica',
      coalesce(nullif(left(new.body, 120), ''), 'Você recebeu um anexo'),
      'info'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_message_staff_notify on messages;
create trigger trg_message_staff_notify
  after insert on messages
  for each row execute function notify_patient_on_staff_message();

-- 5) Realtime nas notificações (respeita a RLS de select do paciente)
alter table notifications replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
