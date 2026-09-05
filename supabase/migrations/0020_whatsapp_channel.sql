-- Canal WhatsApp: a conversa (thread por telefone), a dedup de webhook, o funil
-- estendido e o consentimento LGPD. Aditiva — não mexe no que o painel já usa.

-- ============================================================================
-- 1) Clínica: identificadores da instância Z-API
-- ============================================================================
-- Só IDENTIFICADORES. O token da Z-API é segredo e vive em Supabase secrets
-- (CLAUDE.md §1.3) — nunca no banco, nunca no client.
-- O telefone do paciente não diz de qual clínica ele é; quem resolve o tenant de
-- uma mensagem recebida é o número/instância DA CLÍNICA que recebeu.
alter table clinics add column if not exists wa_instance_id text;
alter table clinics add column if not exists wa_phone       text;
create unique index if not exists clinics_wa_instance_id_key
  on clinics(wa_instance_id) where wa_instance_id is not null;

-- ============================================================================
-- 2) Paciente: telefone normalizado, funil estendido, consentimento
-- ============================================================================
-- `phone` continua livre (é o que o painel digita). `phone_e164` é a chave de
-- identificação do WhatsApp, normalizada na borda pela Edge Function.
alter table patients add column if not exists phone_e164 text;
create unique index if not exists patients_clinic_phone_e164_key
  on patients(clinic_id, phone_e164) where phone_e164 is not null;

-- Jornada pós-cirúrgica (§5.1). Não substitui `status` (active/finished),
-- que continua sendo o ciclo de vida do prontuário.
alter table patients add column if not exists funnel_status funnel_status not null default 'lead';
create index if not exists patients_funnel_status_idx on patients(clinic_id, funnel_status);

-- LGPD: dado de saúde é sensível (§1.3). Consentimento explícito com timestamp
-- antes de acumular histórico clínico; `retention_until` deixa a política de
-- expurgo possível — a rotina em si fica para depois.
alter table patients add column if not exists lgpd_consent    boolean not null default false;
alter table patients add column if not exists lgpd_consent_at timestamptz;
alter table patients add column if not exists retention_until date;

-- ============================================================================
-- 3) Conversas (threads do WhatsApp)
-- ============================================================================
create table if not exists conversations (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id)  on delete cascade,
  -- NOT NULL de propósito: `messages.patient_id` já é obrigatório, então o
  -- webhook cria o paciente (como lead) no primeiro contato de um número novo.
  patient_id      uuid not null references patients(id) on delete cascade,
  wa_phone        text not null,                       -- E.164
  ai_enabled      boolean not null default true,       -- interruptor do handoff (§7.3)
  ai_summary      text,                                -- resumo p/ não mandar histórico inteiro (§6.2)
  handoff_reason  text,
  last_inbound_at  timestamptz,
  last_outbound_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (clinic_id, wa_phone)
);
create index if not exists conversations_clinic_idx  on conversations(clinic_id);
create index if not exists conversations_patient_idx on conversations(patient_id);

-- ============================================================================
-- 4) Mensagens: thread + deduplicação do webhook
-- ============================================================================
alter table messages add column if not exists conversation_id uuid references conversations(id) on delete cascade;
alter table messages add column if not exists wa_message_id   text;
alter table messages add column if not exists wa_status       text;   -- sent/delivered/read/failed

-- Dedup (§7.1): webhook da Z-API pode chegar repetido. Sem isto o paciente
-- recebe resposta duplicada. NULL é permitido (mensagens antigas do app in-app).
create unique index if not exists messages_wa_message_id_key
  on messages(wa_message_id) where wa_message_id is not null;
create index if not exists messages_conversation_idx on messages(conversation_id, created_at);

-- ============================================================================
-- 5) RLS
-- ============================================================================
alter table conversations enable row level security;

drop policy if exists conversations_read on conversations;
create policy conversations_read on conversations
  for select using (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

drop policy if exists conversations_write on conversations;
create policy conversations_write on conversations
  for all using (clinic_id = current_clinic_id() and current_role_pc() = 'staff')
  with check (clinic_id = current_clinic_id() and current_role_pc() = 'staff');

-- Policy aditiva do admin geral, no mesmo formato da 0016.
drop policy if exists conversations_superadmin on conversations;
create policy conversations_superadmin on conversations
  for all using (is_superadmin()) with check (is_superadmin());

-- Realtime: o painel precisa ver a IA sendo pausada por um alerta sem refresh.
alter table conversations replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table conversations;
  end if;
end $$;
