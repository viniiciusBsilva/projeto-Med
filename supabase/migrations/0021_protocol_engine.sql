-- Motor de protocolo cronometrado (CLAUDE.md §4): disparos ancorados na data da
-- cirurgia. Reaproveita `protocols` / `protocol_steps` (day_offset já existe e já
-- aceita negativo, então D-7 funciona sem mudança de tipo).

-- ============================================================================
-- 1) Passo do protocolo vira uma mensagem enviável
-- ============================================================================
-- `title` continua sendo o rótulo interno e `instructions` passa a ser o corpo
-- enviado ao paciente.
alter table protocol_steps add column if not exists phase     care_phase;
alter table protocol_steps add column if not exists send_time time    not null default '09:00';
alter table protocol_steps add column if not exists active    boolean not null default true;

-- ============================================================================
-- 2) Disparos concretos por paciente
-- ============================================================================
create table if not exists protocol_messages (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id)        on delete cascade,
  patient_id   uuid not null references patients(id)       on delete cascade,
  surgery_id   uuid not null references surgeries(id)      on delete cascade,
  step_id      uuid not null references protocol_steps(id) on delete cascade,
  send_at      timestamptz not null,
  status       text not null default 'scheduled'
                 check (status in ('scheduled','sending','sent','answered','cancelled','failed')),
  attempts     int  not null default 0,
  -- Quando o cron reivindicou a linha. É por aqui que se detecta um envio
  -- travado — `send_at` não serve, já está no passado desde o claim.
  claimed_at   timestamptz,
  sent_at      timestamptz,
  wa_message_id text,
  last_error   text,
  created_at   timestamptz not null default now(),
  -- Regenerar ao mudar a data não pode duplicar disparo.
  unique (surgery_id, step_id)
);
create index if not exists protocol_messages_due_idx
  on protocol_messages(status, send_at) where status in ('scheduled','sending');
create index if not exists protocol_messages_patient_idx on protocol_messages(patient_id);

alter table protocol_messages enable row level security;

drop policy if exists protocol_messages_read on protocol_messages;
create policy protocol_messages_read on protocol_messages
  for select using (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

drop policy if exists protocol_messages_write on protocol_messages;
create policy protocol_messages_write on protocol_messages
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

drop policy if exists protocol_messages_superadmin on protocol_messages;
create policy protocol_messages_superadmin on protocol_messages
  for all using (is_superadmin()) with check (is_superadmin());

-- ============================================================================
-- 3) (Re)geração ao definir ou alterar a data da cirurgia
-- ============================================================================
create or replace function regenerate_protocol_messages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Sem protocolo ou cirurgia encerrada: nada a agendar.
  if new.protocol_id is null or new.status = 'finished' then
    delete from protocol_messages
     where surgery_id = new.id and status in ('scheduled', 'failed');
    return new;
  end if;

  -- Recalcula só o que não chegou ao paciente. 'sent'/'answered' são histórico.
  -- 'failed' entra na limpeza de propósito: o motivo mais comum de falha é o
  -- passo ainda estar com placeholder. Quando o médico escrever o texto, basta
  -- salvar a cirurgia de novo para o disparo voltar à fila.
  delete from protocol_messages
   where surgery_id = new.id and status in ('scheduled', 'failed');

  insert into protocol_messages (clinic_id, patient_id, surgery_id, step_id, send_at)
  select new.clinic_id,
         new.patient_id,
         new.id,
         s.id,
         ((new.date + s.day_offset) + s.send_time) at time zone 'America/Sao_Paulo'
    from protocol_steps s
   where s.protocol_id = new.protocol_id
     and s.active
     -- Data retroativa não deve despejar todo o pré-op de uma vez no paciente.
     and ((new.date + s.day_offset) + s.send_time) at time zone 'America/Sao_Paulo' > now()
  on conflict (surgery_id, step_id) do nothing;

  return new;
end $$;

revoke execute on function regenerate_protocol_messages() from public, anon, authenticated;

drop trigger if exists trg_surgery_protocol_schedule on surgeries;
create trigger trg_surgery_protocol_schedule
  after insert or update of date, protocol_id, status on surgeries
  for each row execute function regenerate_protocol_messages();

-- ============================================================================
-- 4) Disparo pelo cron — claim atômico (§7.4)
-- ============================================================================
create extension if not exists pg_net;

create or replace function dispatch_protocol_messages()
returns int language plpgsql security definer set search_path = public as $$
declare
  rec  record;
  sent int := 0;
  base text := coalesce(
    nullif(current_setting('app.supabase_url', true), ''),
    'https://ktfhmrgwbclewlwbqtag.supabase.co'
  );
begin
  -- Requeue: linha presa em 'sending' significa que o POST anterior morreu.
  -- A janela conta do CLAIM, não do send_at: send_at já está no passado no
  -- momento em que a linha é reivindicada, e usá-lo aqui devolveria à fila uma
  -- mensagem que acabou de sair — reenviando ao paciente.
  update protocol_messages
     set status = case when attempts >= 3 then 'failed' else 'scheduled' end,
         last_error = case when attempts >= 3 then 'sem confirmação após 3 tentativas' else last_error end
   where status = 'sending'
     and sent_at is null
     and claimed_at < now() - interval '15 minutes';

  -- Claim atômico: o cron pode rodar sobreposto, então marcar 'sending' e
  -- devolver a linha na MESMA instrução é o que impede disparo duplicado.
  for rec in
    update protocol_messages
       set status = 'sending', attempts = attempts + 1, claimed_at = now()
     where id in (
       select id from protocol_messages
        where status = 'scheduled' and send_at <= now()
        order by send_at
        limit 50
        for update skip locked
     )
    returning id
  loop
    -- wa-send resolve conversa/telefone/corpo e marca 'sent' ou 'failed'.
    perform net.http_post(
      url := base || '/functions/v1/wa-send',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-wa-secret', coalesce(current_setting('app.wa_hook_secret', true), '')
      ),
      body := jsonb_build_object('protocolMessageId', rec.id)
    );
    sent := sent + 1;
  end loop;

  return sent;
end $$;

revoke execute on function dispatch_protocol_messages() from public, anon, authenticated;

select cron.schedule('protocol-dispatch', '*/5 * * * *', $$select dispatch_protocol_messages()$$);

-- ============================================================================
-- 5) Aposenta o lembrete diário in-app
-- ============================================================================
-- `send_daily_care_reminders` (0014) gerava uma notificação por dia que virava
-- push no app Flutter. Sem app, o motor de protocolo assume esse papel pelo
-- WhatsApp. A função fica no banco (remoção junto com o resto do app).
do $$
begin
  perform cron.unschedule('daily-care-reminders');
exception when others then
  null; -- job já removido
end $$;
