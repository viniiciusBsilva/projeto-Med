# Canal WhatsApp — deploy e operação

Implementação de [CLAUDE.md](./CLAUDE.md). O paciente deixa de usar o app Flutter
e passa a ser atendido no WhatsApp por um agente de IA, com o painel virando a
caixa de entrada da clínica.

**Convenção:** o schema é inglês `snake_case` (`clinic_id`, `patients`,
`conversations`). A §5/§9 do CLAUDE.md prescreve pt-BR (`empresa_id`,
`pacientes`) — está desatualizada e **não** foi seguida.

---

## O que foi construído

| Peça | Arquivo |
|---|---|
| Valores de enum (`ai`, `system`, `followup`, `funnel_status`) | [0019_wa_enums.sql](../supabase/migrations/0019_wa_enums.sql) |
| `conversations`, dedup, funil, consentimento LGPD | [0020_whatsapp_channel.sql](../supabase/migrations/0020_whatsapp_channel.sql) |
| `protocol_messages`, regeneração, cron de disparo | [0021_protocol_engine.sql](../supabase/migrations/0021_protocol_engine.sql) |
| Marcos do protocolo capilar (com placeholders) | [0022_seed_hair_protocol.sql](../supabase/migrations/0022_seed_hair_protocol.sql) |
| Webhook de entrada + debounce + agente | [wa-webhook/index.ts](../supabase/functions/wa-webhook/index.ts) |
| Caminho único de saída (Z-API + histórico) | [wa-send/index.ts](../supabase/functions/wa-send/index.ts) |
| System prompt, chamada ao Claude, loop de tools | [_shared/agent.ts](../supabase/functions/_shared/agent.ts) |
| As 9 tools | [_shared/tools.ts](../supabase/functions/_shared/tools.ts) |
| Inbox + interruptor da IA | [messages/page.tsx](<../apps/panel/app/(app)/messages/page.tsx>) |

---

## Estado atual — o que já está no ar

Aplicado no projeto `ktfhmrgwbclewlwbqtag` em 2026-09-05:

- ✅ Migrations 0019 → 0023 aplicadas e verificadas.
- ✅ `wa-send` e `wa-webhook` publicadas com `verify_jwt=false`, bootando em ~35ms.
- ✅ `private.app_config` populado com `wa_hook_secret` e `supabase_url`.
- ✅ `phone_e164` normalizado nos pacientes já cadastrados.
- ✅ Protocolo da clínica com 9 passos (D+0 a D+180), **textos clínicos já
  escritos pelo médico** e shock loss em D+30.
- ✅ Cron `protocol-dispatch` a cada 5 min; `daily-care-reminders` desligado.
- ✅ Advisors sem WARN novo (o único INFO novo é `private.app_config` sem policy,
  que é o comportamento desejado — sem policy ninguém alcança pela API).

Falta só o que depende de credencial externa: os **4 secrets** abaixo, o
**vínculo da clínica** e a **URL do webhook na Z-API**.

> Para criar as contas da Z-API e da Anthropic (e o porquê de cada uma, com
> custo estimado e os riscos que a clínica precisa conhecer antes de pagar),
> ver [CONTAS-EXTERNAS.md](./CONTAS-EXTERNAS.md).

> ⚠️ **Não use `supabase db push` neste projeto.** As migrations foram aplicadas
> pelo MCP do Supabase, então o remoto guarda versões em timestamp
> (`20260721034058`) enquanto os arquivos locais usam prefixo sequencial
> (`0019_`). Nenhuma versão local consta no remoto, e o `db push` tentaria
> reaplicar da `0001` — que falha, porque os tipos já existem. Use
> `apply_migration`, uma por vez, na ordem numérica. A 0019 precisa estar
> COMMITADA antes da 0020: `alter type ... add value` não pode ser usado na
> mesma transação em que roda.

## 1. Secrets (falta você preencher)

Em *Edge Functions → Secrets* do painel do Supabase. Nada em código, nada no
client (§1.3):

> 🔐 **Os valores não ficam neste arquivo** — ele é versionado e vai para o
> GitHub. `WA_HOOK_SECRET` já foi gerado e gravado em `private.app_config`;
> recupere-o de lá para colar nos secrets:
>
> ```sql
> select key, value from private.app_config where key = 'wa_hook_secret';
> ```
>
> O `ZAPI_WEBHOOK_SECRET` também já foi gerado — está no histórico da conversa
> de implantação e na URL configurada na Z-API. Se tiver dúvida, gere outro
> (`openssl rand -hex 32`) e atualize os dois lados.

| Secret | Onde obter | Status |
|---|---|---|
| `WA_HOOK_SECRET` | `private.app_config` (query acima) | ⏳ **precisa bater com o banco** |
| `ZAPI_WEBHOOK_SECRET` | mesmo valor da query string do webhook | ⏳ colar nos secrets |
| `ANTHROPIC_API_KEY` | console.anthropic.com | ⏳ aguardando |
| `ZAPI_INSTANCE_ID` | id da instância | ⏳ aguardando |
| `ZAPI_TOKEN` | token da instância | ⏳ aguardando |
| `ZAPI_CLIENT_TOKEN` | header `Client-Token` da conta | ⏳ aguardando |

Para trocar o `WA_HOOK_SECRET` depois, mude nos dois lugares:

```sql
update private.app_config set value = '<novo>', updated_at = now()
 where key = 'wa_hook_secret';
```

> **Por que não `alter database postgres set app.*`** (o padrão da 0010): esta
> plataforma nega o comando até para o role `postgres`. Uma verificação mostrou
> que `app.push_hook_secret` **nunca chegou a existir** — o trigger de push do
> app vem enviando segredo vazio desde que foi criado. Daí a tabela
> `private.app_config` (schema fora do PostgREST, lido só por função
> SECURITY DEFINER).

## 2. Vincular a clínica à instância

O telefone do paciente **não** identifica a clínica; quem identifica é o número
que recebeu a mensagem. Sem isto o webhook aceita e ignora tudo:

```sql
update clinics
   set wa_instance_id = '<ZAPI_INSTANCE_ID>',
       wa_phone       = '+55...'
 where id = '00000000-0000-0000-0000-000000000001';  -- Clínica PostCare Demo
```

## 3. Redeploy das funções (só se mudar o código)

Já estão publicadas. Ambas dispensam JWT — a Z-API não manda um, e o `wa-send`
valida sozinho (segredo de servidor **ou** JWT de staff do painel):

```sh
supabase functions deploy wa-webhook --no-verify-jwt
supabase functions deploy wa-send    --no-verify-jwt
```

## 4. Webhook na Z-API

Em *Ao receber* (`on-message-received`), aponte para:

```
https://ktfhmrgwbclewlwbqtag.supabase.co/functions/v1/wa-webhook?s=<ZAPI_WEBHOOK_SECRET>
```

A Z-API não assina o payload, então o segredo na URL é a validação de origem
(§1.4). Trocar o segredo exige atualizar os dois lados.

## 5. Conferir que ligou

Com os secrets no lugar, este comando tem que devolver **404** (paciente
inexistente) em vez de 401 — 401 significa que `WA_HOOK_SECRET` não está
configurado ou não bate com o de `private.app_config`:

```sh
curl -s -w '\n%{http_code}\n' \
  https://ktfhmrgwbclewlwbqtag.supabase.co/functions/v1/wa-send \
  -H 'content-type: application/json' \
  -H 'x-wa-secret: $WA_HOOK_SECRET' \
  -d '{"patientId":"00000000-0000-0000-0000-000000000000","body":"teste"}'
```

---

## Verificação por fase

| Fase | Como saber que está de pé |
|---|---|
| 0 | Migrations aplicadas; `get_advisors` sem alerta novo |
| 1 | Mensagem de um celular real → 1 linha em `messages` com `wa_message_id`, 1 em `conversations`. Reenviar o mesmo webhook **não** duplica (§7.1) |
| 2 | 3 mensagens curtas em 2s → **uma** resposta (debounce). Ocupar o slot por fora e pedir o mesmo horário → `book_appointment` recusa |
| 3 | Cirurgia com data → `protocol_messages` com D+60. Mudar a data → regenera sem duplicar. `select dispatch_protocol_messages();` duas vezes → nenhum disparo repetido |
| 4 | "estou com febre" → alerta `critical` em `/alerts` + `ai_enabled = false`. Reativar pelo painel volta a responder |

**Log:** as funções logam só identificadores. Confirme com `query_logs` que
nenhum corpo de mensagem de paciente aparece (§1.3).

---

## Pontos de atenção

**Prompt caching pode não estar ativo.** O prefixo mínimo do Haiku 4.5 é **4096
tokens**; abaixo disso o cache não liga — sem erro, sem aviso. O FAQ aprovado
entra no bloco estável justamente para engordar o prefixo. Confira
`cache_read` no log de `claude_turn`: se for 0 na segunda mensagem da mesma
conversa, a economia de ~90% do §2 não está acontecendo.

**Passo de protocolo com placeholder não é enviado.** O `wa-send` recusa
qualquer `instructions` que comece com `[TEXTO A DEFINIR` e marca o disparo como
`failed`. O protocolo só funciona depois que o médico escrever os textos.

**Horário de atendimento está chumbado.** Seg–sex, 9h–18h, slots de 30 min, em
[`_shared/tools.ts`](../supabase/functions/_shared/tools.ts). Vira config da
clínica quando as regras reais chegarem (§10).

**Severidade clínica não é decidida pela IA.** `record_checkin` grava o relato e
o trigger `checkin_triage` (0007) classifica. `raise_alert` sempre entra como
`high` — isso é prioridade de fila, não julgamento médico (§1.1).

**Disparo de protocolo sai mesmo com a IA pausada.** É comunicação da clínica,
não da IA. Se a clínica quiser segurar disparos para paciente com alerta aberto,
essa política precisa vir do médico.

---

## App Flutter (retirada faseada)

O cron `daily-care-reminders` foi desligado pela 0021 — era ele que gerava a
notificação diária que virava push no app.

`apps/patient` continua no repositório e os objetos de banco dele seguem
intactos de propósito: a limpeza (`device_tokens`, `checklist_completions`,
trigger `trg_notification_push`, policies `*_patient_*`, funções `patient-signup`
e `send-push`) fica para uma migration própria, com diff antes (§9), **depois**
do WhatsApp provado em produção.

`clinics.invite_code` (0018) existia só para o cadastro no app e perde a função.

## Pendente com o médico (bloqueia conteúdo, não código)

- ~~Textos e prazos do protocolo~~ — **já resolvido**: a clínica tem os 9 passos
  escritos (D+0 a D+180, shock loss em D+30). Editáveis em *Mensagens
  programadas*. Falta só decidir se quer disparos de pré-operatório (D-7, D-3,
  D-1), que hoje não existem.
- Lista final de sinais de alerta.
- FAQ oficial → alimenta `canned_responses`, que é o que o agente responde.
- Horário de atendimento e regras de agenda.
- Credenciais Z-API.
