-- Configuração de servidor (segredos de hook, URL do projeto).
--
-- Corrige o padrão herdado da 0010, que lia `current_setting('app.*_secret')`
-- alimentado por `alter database postgres set ...`. Isso NÃO funciona nesta
-- plataforma: o comando é negado até para o role `postgres`, e uma verificação
-- no banco mostrou que `app.push_hook_secret` nunca chegou a existir — ou seja,
-- o trigger de push do 0010 vem enviando segredo vazio desde que foi criado.
--
-- Aqui a config vira tabela num schema fora do PostgREST (`private` não está
-- nos schemas expostos da API), lida só por função SECURITY DEFINER.
--
-- Os valores NÃO entram nesta migration — são inseridos fora do versionamento:
--   insert into private.app_config (key, value) values
--     ('wa_hook_secret', '<mesmo valor do secret WA_HOOK_SECRET>'),
--     ('supabase_url',   'https://<projeto>.supabase.co')
--   on conflict (key) do update set value = excluded.value, updated_at = now();

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table private.app_config enable row level security;  -- sem policy: ninguém via API
revoke all on private.app_config from public, anon, authenticated;

create or replace function private.config(k text)
returns text language sql stable security definer set search_path = private as $$
  select value from private.app_config where key = k
$$;
revoke execute on function private.config(text) from public, anon, authenticated;

-- Passa a ler a config da tabela em vez do GUC inexistente.
create or replace function dispatch_protocol_messages()
returns int language plpgsql security definer set search_path = public as $$
declare
  rec  record;
  sent int := 0;
  base text := coalesce(
    nullif(private.config('supabase_url'), ''),
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

  -- Claim atômico (§7.4): marcar 'sending' e devolver a linha na MESMA
  -- instrução é o que impede disparo duplicado com o cron sobreposto.
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
    perform net.http_post(
      url := base || '/functions/v1/wa-send',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-wa-secret', coalesce(private.config('wa_hook_secret'), '')
      ),
      body := jsonb_build_object('protocolMessageId', rec.id)
    );
    sent := sent + 1;
  end loop;

  return sent;
end $$;

revoke execute on function dispatch_protocol_messages() from public, anon, authenticated;
