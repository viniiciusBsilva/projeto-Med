-- Chat: anexos (imagem/pdf/vídeo/áudio) + realtime nas mensagens.

-- 1) Colunas de anexo. body passa a ser opcional (mensagem só-anexo).
alter table messages alter column body drop not null;
alter table messages add column if not exists attachment_path text;
alter table messages add column if not exists attachment_type text
  check (attachment_type in ('image','pdf','video','audio'));
alter table messages add column if not exists attachment_name text;
-- Garante que a mensagem tenha texto OU anexo.
alter table messages add constraint messages_body_or_attachment
  check (body is not null or attachment_path is not null);

-- 2) Bucket privado para anexos de chat (pasta raiz = patient_id).
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Paciente: gerencia a própria pasta.
create policy chat_att_patient_all on storage.objects
  for all to authenticated
  using (bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = current_patient_id()::text)
  with check (bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = current_patient_id()::text);

-- Staff: acessa anexos de pacientes da própria clínica.
create policy chat_att_staff_all on storage.objects
  for all to authenticated
  using (bucket_id = 'chat-attachments'
    and current_role_pc() = 'staff'
    and exists (
      select 1 from patients p
      where p.id::text = (storage.foldername(name))[1]
        and p.clinic_id = current_clinic_id()))
  with check (bucket_id = 'chat-attachments'
    and current_role_pc() = 'staff'
    and exists (
      select 1 from patients p
      where p.id::text = (storage.foldername(name))[1]
        and p.clinic_id = current_clinic_id()));

-- 3) Realtime: transmite mudanças em messages (respeita a RLS de select).
alter table messages replica identity full;
alter publication supabase_realtime add table messages;
