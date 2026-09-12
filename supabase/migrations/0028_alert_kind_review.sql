-- Recuperada de supabase_migrations.schema_migrations (20260912010129_alert_kind_review).
-- Foi aplicada direto no banco e nunca chegou ao repositório; este é o SQL
-- original, não uma reconstrução a partir do schema.

-- Foto, vídeo ou exame enviado pelo paciente no WhatsApp: vai para o médico
-- avaliar (a IA não avalia imagem nem exame). Alerta de atendimento, não pesa
-- no risco clínico do paciente (patient_overview conta só 'clinical').
alter table public.alerts drop constraint alerts_kind_check;
alter table public.alerts add constraint alerts_kind_check
  check (kind = any (array['clinical', 'question', 'scheduling', 'handoff', 'technical', 'review']));
