-- Recuperada de supabase_migrations.schema_migrations (20260911232531_clinic_ai_settings).
-- Foi aplicada direto no banco e nunca chegou ao repositório; este é o SQL
-- original, não uma reconstrução a partir do schema.

-- Configuração do assistente do WhatsApp por clínica (Configurações → Assistente
-- de IA, só admin geral). Lida pelo agente a cada mensagem. As regras de
-- segurança clínica não ficam aqui: são fixas no código do agente.
-- Edição pelo admin geral via RLS clinics_superadmin; sem RPC.
alter table public.clinics add column if not exists ai_settings jsonb;

comment on column public.clinics.ai_settings is
  'Assistente do WhatsApp: { version, enabled, assistant_name, tone, greeting, clinic_info, custom_instructions, pricing_policy, handoff_rules, forbidden }';
