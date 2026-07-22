-- Dispara push quando uma notificação é criada para um paciente (no-op até FCM configurado).
-- Requer os secrets FCM_SERVICE_ACCOUNT e (opcional) PUSH_HOOK_SECRET na função send-push.
-- Para casar o segredo do header, defina também: alter database postgres set app.push_hook_secret = '<valor>';
create extension if not exists pg_net;

create or replace function notify_push_on_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.patient_id is not null then
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
end $$;

drop trigger if exists trg_notification_push on notifications;
create trigger trg_notification_push
  after insert on notifications
  for each row execute function notify_push_on_notification();
