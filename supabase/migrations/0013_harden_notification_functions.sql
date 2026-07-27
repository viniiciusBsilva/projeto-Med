-- Endurece as funções criadas em 0012 (avisos do database linter).

-- 1) search_path fixo nas funções auxiliares (evita hijack por search_path mutável).
alter function appointment_type_label(appointment_type) set search_path = public;
alter function fmt_appt_when(timestamptz) set search_path = public;

-- 2) Trigger functions não devem ser chamáveis via RPC. (Postgres já bloqueia chamar
--    funções 'trigger' fora de contexto de trigger; revogar EXECUTE remove o aviso e a
--    superfície de API sem afetar o disparo dos triggers, que rodam como dono da tabela.)
revoke execute on function notify_patient_on_appointment_insert() from public, anon, authenticated;
revoke execute on function notify_patient_on_appointment_update() from public, anon, authenticated;
revoke execute on function notify_patient_on_appointment_delete() from public, anon, authenticated;
revoke execute on function notify_patient_on_staff_message()      from public, anon, authenticated;
