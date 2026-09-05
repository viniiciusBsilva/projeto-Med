# CLAUDE.md

Contexto e especificação para construção. Leia este arquivo inteiro antes de gerar código.

> **Correções após a implementação** — ver [WHATSAPP.md](./WHATSAPP.md).
>
> - **Nomes de tabela/coluna são em INGLÊS**, não pt-BR. O admin que já existia usa
>   `clinic_id`, `patients`, `messages`, `alerts`, `protocol_steps`. As §5 e §9
>   abaixo pedem `empresa_id`/`pacientes` — seguir isso quebraria a consistência
>   que elas dizem querer preservar. Leia a §5 como modelo conceitual.
> - **O app Flutter do paciente foi aposentado** (§11 já dizia "sem app"; agora é
>   fato). O canal do paciente é só o WhatsApp.
> - **`protocolo_template` já existia** como `protocol_steps.day_offset`; o motor
>   de protocolo estende essa tabela em vez de criar outra.

---

## 0. O que estamos construindo

Uma **camada de agente de IA no WhatsApp** por cima de um sistema admin (CRM) que **já existe**. O admin hoje **não tem nenhuma IA/agente** — ele é o painel onde a clínica administra leads, clientes, funil e agenda. Nós vamos adicionar:

1. Um **agente conversacional** que atende os pacientes no WhatsApp (tira dúvidas, agenda, acompanha).
2. Um **motor de protocolo cronometrado** que dispara mensagens automáticas de pré e pós-operatório ancoradas na data da cirurgia.
3. A infraestrutura de **CRM estendido** para a jornada pós-cirúrgica (que hoje o admin não cobre).

**Cliente atual: uma clínica de transplante capilar (médico).** O sistema é multi-tenant no design, mas **o foco de build agora é este único cliente**. Não construa os outros nichos ainda — só garanta que o `empresa_id` e a config por empresa existam para não travar o futuro.

---

## 1. Guardrails não-negociáveis (leia primeiro)

Estas regras valem para todo o código e todo o comportamento do agente. Se algo neste doc conflitar com elas, elas vencem.

### 1.1 Contexto médico — a IA não pratica medicina
- O agente **nunca** diagnostica, **nunca** julga se um sintoma é normal, **nunca** dá opinião clínica nova.
- Todo conteúdo clínico que o agente envia (protocolo, FAQ) é **texto pré-aprovado pelo médico**, armazenado no banco. A IA só **entrega** esse conteúdo, não inventa.
- Diante de qualquer **sinal de alerta** (ver `sinais_alerta`, seção 6.4), a IA para, responde algo curto e tranquilizador pré-definido, chama `registrar_alerta`, **pausa a IA naquele paciente** e notifica a equipe. Não improvisa resposta clínica.

### 1.2 A IA decide, o código executa e valida
- A IA **propõe** ações via function calling. Quem verifica disponibilidade de agenda, grava agendamento, checa conflito e persiste é **o nosso código** (Edge Function + Supabase).
- **Nunca** deixe a IA "inventar" um horário livre. Horário vem sempre de `buscar_horarios_disponiveis`, que consulta o banco. Agendamento só é confirmado após o código validar que o slot ainda está livre.

### 1.3 LGPD — dado de saúde é dado sensível
- Estamos armazenando dado de saúde do paciente (dado sensível na LGPD). Trate com cuidado desde o início:
  - Registrar **consentimento explícito** do paciente (campo + timestamp) antes de acumular histórico clínico.
  - Não logar conteúdo sensível em logs de aplicação/terceiros. Logs de debug não devem conter corpo de mensagem do paciente.
  - Prever **política de retenção** (campo de data de expurgo / rotina futura). Não precisa implementar o expurgo agora, mas o schema deve permitir.
  - Segredos (chaves de API, tokens Z-API) só em variáveis de ambiente / secrets do Supabase. **Nunca** hardcoded, nunca no client.

### 1.4 Segurança de plataforma
- Toda tabela com dado de paciente tem `empresa_id` e é protegida por **Row Level Security** no Supabase.
- O webhook da Z-API deve validar origem (token/segredo compartilhado) antes de processar.

---

## 2. Stack

- **Backend / DB:** Supabase (Postgres + Edge Functions em Deno/TypeScript + `pg_cron` para agendamentos).
- **WhatsApp:** Z-API (recebe via webhook, envia via POST).
- **IA:** Claude API — modelo **`claude-haiku-4-5`** como workhorse do agente.
  - **Prompt caching ligado** no system prompt (é grande e se repete a cada mensagem; cachear corta ~90% do custo de entrada).
  - Function calling (tool use) é o mecanismo central — é o que faz o agente agir.
  - Não introduza um segundo modelo (classificador) agora. Otimização prematura. Haiku só, bem usado.
- **Admin:** já existe (adaptar). Ver seção 5 sobre schema.

> Confirme os IDs de modelo e preços atuais na doc oficial da Anthropic antes de fechar — mudam com frequência.

---

## 3. Arquitetura — fluxo de uma mensagem recebida

```
Paciente manda msg no WhatsApp
        │
        ▼
Z-API dispara webhook  ──►  Edge Function "webhook-inbound"
        │
        ├─ 1. Valida origem (segredo Z-API)
        ├─ 2. Deduplica por message_id (ignora se já processado)  ── ver 7.1
        ├─ 3. Identifica/cria paciente pelo telefone
        ├─ 4. Identifica/cria a thread (conversa) daquele telefone
        ├─ 5. Grava a mensagem recebida
        ├─ 6. Se ai_ativa == false → NÃO responde (humano assumiu). Fim.
        ├─ 7. Debounce: agrupa mensagens em janela de ~6s  ── ver 7.2
        │
        ▼
   Monta contexto: system prompt (nicho) + dados do paciente +
   etapa do protocolo + histórico recente + msg nova
        │
        ▼
   Chama Claude (Haiku 4.5) com as tools da seção 6.3
        │
        ├─ Claude responde texto  ──►  envia
        └─ Claude pede tool_use  ──►  código executa (valida agenda, grava, etc.)
                                       └─► devolve resultado ao Claude ──► resposta final
        │
        ▼
   POST na Z-API  ──►  volta pro paciente
        │
        ▼
   Grava resposta no histórico + atualiza status do funil se aplicável
```

**Disparos automáticos (protocolo)** seguem caminho separado — ver seção 4.

---

## 4. Motor de protocolo cronometrado (o diferencial — capriche aqui)

É a peça de maior valor do produto. Em vez de só reagir, o sistema **dispara mensagens sozinho**, ancoradas na `data_cirurgia` do paciente.

### 4.1 Como funciona
- Existe um **template de protocolo** por empresa: uma lista de disparos, cada um com um **offset em dias** relativo a um evento âncora (ex.: `-3` = três dias antes da cirurgia; `+1` = um dia depois; `+60` = shock loss).
- Quando a `data_cirurgia` de um paciente é definida ou alterada, o sistema **(re)gera os disparos concretos** desse paciente: para cada item do template, calcula `disparar_em = data_cirurgia + offset_dias` (respeitando um horário do dia configurável, ex.: 9h).
- Um job **`pg_cron`** roda a cada N minutos, busca disparos com `status = 'agendado'` e `disparar_em <= agora`, envia via Z-API, marca `enviado`.
- O paciente pode **responder** qualquer disparo e cair no fluxo conversacional normal (seção 3).

### 4.2 Marcos típicos (placeholders — o médico valida o conteúdo real)
Pré-op: `D-7`, `D-3`, `D-1` (instruções + confirmação).
Pós-op: `D+1`, `D+2`, `D+3`, ..., `D+10` (cuidado diário).
**`D+60` a `D+90`: mensagem proativa explicando o shock loss ANTES do paciente entrar em pânico.** Esse disparo sozinho já justifica o produto — não deixe de fora.
Acompanhamento: `mês 1 / 3 / 6 / 12` → pedir foto + oferecer retorno.

> ⚠️ **Os textos e os prazos exatos são responsabilidade do médico.** Gere a estrutura com placeholders (`[TEXTO A DEFINIR PELO MÉDICO]`) e um jeito fácil de ele editar via admin (editor de protocolo). Não invente conteúdo clínico.

---

## 5. Modelo de dados

> **IMPORTANTE:** o admin já existe e tem schema próprio. **NÃO recrie tabelas cegamente.** Primeiro inspecione o schema atual do Supabase (`list_tables`) e **reconcilie nomes**. As tabelas abaixo são o modelo conceitual do que o sistema precisa — algumas já devem existir (leads/clientes, agendamentos). Marque claramente o que é **novo** e o que é **alteração** de tabela existente. Traga um diff antes de aplicar migração.

Tabelas/campos conceituais (nomes em pt-BR para casar com o admin existente):

```
empresas          id, nicho, config (jsonb: prompt, horario_atendimento, regras, modulos_ativos)

pacientes         id, empresa_id, telefone (único por empresa), nome, email,
                  origem_lead, status_funil, consentimento_lgpd (bool), consentimento_em,
                  -- campos clínicos do nicho:
                  data_cirurgia, tecnica (FUE/DHI), num_enxertos, area_tratada, valor,
                  medico_id, criado_em
                  -- (parte disto provavelmente já existe como "leads/clientes"; reconciliar)

conversas         id, empresa_id, paciente_id, ai_ativa (bool, default true),
                  resumo_ia, ultimo_contato

mensagens         id, conversa_id, papel (paciente/ia/humano/sistema),
                  conteudo, message_id_zapi (único), criado_em

agendamentos      id, empresa_id, paciente_id, tipo (avaliacao/cirurgia/retorno),
                  inicio, fim, status (agendado/confirmado/cancelado/compareceu/no_show),
                  lembrete_enviado
                  -- provavelmente já existe; reconciliar

protocolo_template  id, empresa_id, etapa (pre/pos/acompanhamento),
                    offset_dias (int), hora_disparo, conteudo, ativo

protocolo_agendado  id, empresa_id, paciente_id, template_id,
                    disparar_em (timestamptz), status (agendado/enviado/respondido/cancelado)

alertas           id, empresa_id, paciente_id, conversa_id, tipo, urgencia,
                  criado_em, resolvido_por, resolvido_em

fotos             id, empresa_id, paciente_id, marco (mes_1/mes_3/...), url, data

faq               id, empresa_id, pergunta, resposta_aprovada, ativo
```

### 5.1 Funil (status_funil) — estender além de "consulta agendada"
O admin atual termina o funil em *Consulta Agendada*. Para este nicho a jornada continua:
`lead → avaliacao_agendada → orcamento_enviado → cirurgia_agendada → operado → em_acompanhamento → alta`
(+ estados laterais: `cancelado`, `follow_up`).

---

## 6. Design do agente de IA

### 6.1 System prompt (estrutura, não o texto final)
Montado por empresa a partir de `empresas.config`. Deve conter, em ordem: papel do agente e nome da clínica → **guardrails da seção 1 em linguagem de instrução** (não diagnostica; conteúdo só aprovado; escala em sinal de alerta) → tom de voz → o que ele pode fazer (agendar, tirar dúvida do FAQ, acompanhar) → dados do paciente e etapa atual do protocolo (injetados por mensagem) → instrução explícita de usar as tools para qualquer ação, nunca inventar horário nem informação clínica.
A parte estável do prompt deve entrar como **bloco cacheado**.

### 6.2 Contexto injetado por mensagem
Dados do paciente (nome, etapa do funil, data da cirurgia se houver), resumo da conversa (`conversas.resumo_ia`) e as últimas ~10 mensagens. Não mande o histórico inteiro — resuma.

### 6.3 Tools (function calling)
Defina estas ferramentas. O código as implementa; a IA só as chama.

- `consultar_paciente(telefone)` → dados + etapa do protocolo/funil.
- `buscar_horarios_disponiveis(data_inicio, data_fim, tipo)` → slots livres (fonte da verdade é o banco).
- `agendar(paciente_id, tipo, inicio)` → **valida slot livre no código**, grava, retorna confirmação. Rejeita se ocupou.
- `atualizar_status_funil(paciente_id, novo_status)`.
- `registrar_alerta(paciente_id, tipo, urgencia)` → cria alerta, seta `ai_ativa=false`, notifica equipe.
- `solicitar_handoff(paciente_id, motivo)` → seta `ai_ativa=false`, sinaliza a conversa para humano.
- `buscar_faq(pergunta)` → retorna resposta aprovada (só conteúdo do médico). Se não houver, a IA diz que vai encaminhar — não inventa.

### 6.4 Sinais de alerta (placeholders — médico valida)
Ex.: sangramento que não para, pus/secreção, febre, dor forte fora do esperado, inchaço anormal. Ao detectar (por palavra-chave e/ou classificação da própria IA), acionar `registrar_alerta`. Lista final é responsabilidade do médico.

---

## 7. Robustez em produção (não pule)

### 7.1 Deduplicação
Webhooks da Z-API podem chegar repetidos. Guarde `message_id_zapi` (único) e ignore mensagem já processada. Sem isso, o paciente recebe resposta duplicada.

### 7.2 Debounce / agrupamento
Paciente manda várias mensagens curtas em sequência ("oi" / "queria marcar" / "amanhã à tarde"). Espere ~6s de silêncio e **agrupe** antes de chamar a IA. Processar cada uma separadamente confunde o agente.

### 7.3 Handoff humano
`conversas.ai_ativa` é o interruptor. Quando falso (humano assumiu, ou alerta/handoff disparado), o webhook **não** responde automaticamente. O admin precisa de um botão para reativar a IA.

### 7.4 Idempotência dos disparos
O cron pode rodar sobreposto. Marque `enviado` de forma atômica (ex.: `UPDATE ... WHERE status='agendado' RETURNING`) para não disparar o mesmo item duas vezes.

---

## 8. Ordem de build (faça em fases, não tudo de uma vez)

**Fase 0 — Fundação.** Inspecionar schema existente, reconciliar, aplicar migrações aditivas (campos clínicos em paciente, `conversas`, `mensagens`, tabelas de protocolo/alertas). RLS + secrets.

**Fase 1 — Loop conversacional mínimo.** Webhook inbound → identifica paciente/thread → dedup → grava → chama Haiku (sem tools ainda, só responde texto do FAQ) → envia via Z-API → grava. Provar o ciclo ponta a ponta com um número real.

**Fase 2 — Tools de agenda.** `consultar_paciente`, `buscar_horarios_disponiveis`, `agendar` (com validação no código). Debounce e handoff (`ai_ativa`).

**Fase 3 — Motor de protocolo.** `protocolo_template` + geração de `protocolo_agendado` ao setar `data_cirurgia` + cron de disparo. Incluir o disparo de shock loss.

**Fase 4 — Segurança médica.** `registrar_alerta`, `solicitar_handoff`, fila de alertas, pausa da IA, notificação da equipe.

**Fase 5 — Acompanhamento.** Fotos por marco, resumo automático da conversa, FAQ editável.

Cada fase deve ficar de pé sozinha antes da próxima.

---

## 9. Convenções

- Nomes de tabela/coluna em `snake_case` pt-BR, casando com o admin existente.
- Toda query com dado de paciente filtra por `empresa_id`.
- Edge Functions pequenas e com responsabilidade única (`webhook-inbound`, `cron-protocolo`, `send-whatsapp`, etc.).
- Datas/horas em `timestamptz` (UTC no banco; converter para o fuso da clínica só na borda).
- Nada de segredo em código ou no client. Só env/secrets.
- Antes de qualquer migração destrutiva ou renomeação: mostrar diff e pedir confirmação.

---

## 10. O que o humano precisa fornecer (bloqueia conteúdo, não código)

- [ ] **Schema atual do Supabase** (para reconciliação precisa na Fase 0).
- [ ] **Textos e prazos do protocolo** pré/pós-op, incluindo o do shock loss — validados pelo médico.
- [ ] **Lista final de sinais de alerta** que pausam a IA.
- [ ] **FAQ oficial** (perguntas que o médico já responde mil vezes, com resposta aprovada).
- [ ] Horário de atendimento e regras de agenda da clínica.
- [ ] Credenciais Z-API e chave da Claude API (via secrets).

---

## 11. Decisões já tomadas (defaults — mudar aqui se necessário)

- **Agenda:** tabela interna no Supabase primeiro. Google Calendar fica para uma fase futura.
- **Modelo:** Claude Haiku 4.5, prompt caching ligado, código valida agenda.
- **Foco:** apenas o cliente de transplante capilar agora; multi-tenant preparado mas não construído para os outros nichos.
- **Interface do paciente:** WhatsApp (Z-API). Sem app. O "app do médico" é o admin web que já existe.
