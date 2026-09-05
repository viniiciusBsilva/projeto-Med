-- Canal WhatsApp: só os valores de enum, isolados nesta migration.
--
-- `alter type ... add value` não pode ser USADO na mesma transação em que roda,
-- e o Supabase CLI envolve cada arquivo de migration numa transação. Por isso os
-- novos valores entram aqui e só são referenciados a partir da 0020.

-- Quem escreveu a mensagem: paciente, equipe, a IA, ou o próprio sistema
-- (disparo de protocolo, aviso de handoff).
alter type message_sender add value if not exists 'ai';
alter type message_sender add value if not exists 'system';

-- Fase de acompanhamento (mês 1/3/6/12), além de pré e pós.
alter type care_phase add value if not exists 'followup';

-- Funil estendido além de "consulta agendada" (CLAUDE.md §5.1).
-- Tipo novo: pode ser usado já na 0020, ao contrário dos valores acima.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'funnel_status') then
    create type funnel_status as enum (
      'lead',
      'evaluation_scheduled',
      'quote_sent',
      'surgery_scheduled',
      'operated',
      'in_followup',
      'discharged',
      'cancelled',
      'follow_up'
    );
  end if;
end $$;
