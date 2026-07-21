# PRD — PostCare Pro

> Sistema de acompanhamento pós-operatório para clínicas.
> Documento de referência de produto. Fonte da verdade para escopo e regras de negócio.

---

## 1. Visão

PostCare Pro é um SaaS multi-clínica que organiza e automatiza o acompanhamento
pós-operatório de pacientes. A clínica cadastra o paciente e a cirurgia; o sistema
calcula o dia do pós (D+n), entrega a orientação certa no momento certo, coleta o
estado do paciente via check-ins e levanta alertas de risco para a equipe agir.

**Frase-guia:** transformar o pós-operatório em um processo seguro, organizado e automatizado.

## 2. Problema → Solução

| Problema | Solução no produto |
| --- | --- |
| Falta de acompanhamento estruturado | Protocolos por especialidade com orientações por dia |
| Insegurança do paciente | Orientação diária + canal de mensagem direto com a clínica |
| Mensagens repetitivas consumindo a equipe | Orientações automáticas + respostas prontas |
| Risco de complicações passar despercebido | Check-ins + alertas por regra (triagem) |

## 3. Produtos

O sistema tem **dois produtos** sobre a **mesma base Supabase**:

1. **Painel da Clínica** — web, **Next.js + Supabase**. Público: equipe da clínica
   (admin, recepção, profissional de saúde). É o escopo detalhado deste PRD (todas as abas do print).
2. **App do Paciente** — mobile nativo, **Flutter (iOS/Android)**. Público: paciente
   em pós-operatório. Detalhado em nível de feature na seção 6.

## 4. Personas

- **Admin da clínica** — configura clínica, equipe, protocolos e assinatura.
- **Recepção/Operador** — cadastra pacientes e cirurgias, responde mensagens, trata alertas.
- **Profissional de saúde** — acompanha evolução, decide conduta sobre alertas.
- **Paciente** — recebe orientações, faz check-in diário, tira dúvidas.

> No MVP, `admin` e `recepção/profissional` compartilham o papel técnico **`staff`**
> (ver schema). Papéis granulares entram na fase 2.

## 5. Painel da Clínica — Módulos (abas do navbar)

Ordem e nomes seguem exatamente o print. Toda a UI em **pt-BR**, com **dark mode**.

### 5.1 Dashboard
Visão geral do acompanhamento. Componentes:
- **Cartões de métrica** (linha superior): Pacientes Ativos, Pacientes em Alerta,
  Pacientes Finalizados, Consultas de Hoje, Mensagens Pendentes. Cada cartão tem
  ícone, valor e variação vs. período anterior (▲ verde / ▼ vermelho).
- **Resumo semanal da IA** — bloco de texto gerado (nº de pacientes acompanhados,
  alertas críticos, protocolos concluídos, protocolo com mais cadastros) + botão
  "Ver análise completa". *(IA: ver 8.4 — pode entrar com dado real depois; começar
  com placeholder/resumo determinístico.)*
- **Atividade semanal** — gráfico de linhas com séries Pacientes / Alertas / Mensagens.
- **Próximos retornos** — lista de retornos/consultas agendados (data, título, horário, profissional).
- Ações no topo: **Exportar relatório** e **+ Novo paciente**.

### 5.2 Pacientes
Gestão de pacientes. Lista com busca/filtro por status e protocolo.
- Colunas sugeridas: nome, protocolo/especialidade, **dia do pós (D+n)**, status
  (ativo / em alerta / finalizado), última interação.
- Detalhe do paciente: dados, cirurgias, timeline de check-ins, orientações do dia,
  alertas, atalho para conversa.
- CRUD completo. "Em alerta" é **derivado** de alertas abertos, não é status manual.

### 5.3 Cirurgias
Gestão dos procedimentos. Uma cirurgia liga paciente + protocolo + **data** (base do D+n).
- Lista por data/status. Criar cirurgia dispara o acompanhamento daquele paciente.
- Ações: nova cirurgia, editar, finalizar (encerra o acompanhamento).

### 5.4 Agenda
Calendário de consultas e retornos.
- Visões dia/semana/mês. Item: tipo (consulta/retorno), paciente, horário, profissional.
- Alimenta o bloco "Próximos retornos" do Dashboard.

### 5.5 Mensagens
Conversa entre clínica e paciente (badge com pendências no navbar).
- Lista de conversas + thread. Envio bidirecional (staff ↔ paciente).
- **Respostas prontas** (templates) inseríveis na conversa.
- "Mensagens Pendentes" = threads com mensagem do paciente não respondida/não lida.

### 5.6 Notificações
Central de eventos para a equipe (badge no navbar).
- Tipos: novo alerta, nova mensagem, retorno próximo, paciente concluiu protocolo.
- Marcar como lida; filtro por tipo.

### 5.7 Relatórios
Relatórios e exportações.
- Ex.: pacientes por período/protocolo, alertas gerados, taxa de conclusão,
  tempo médio de resposta a mensagens.
- Exportar (CSV/PDF). Botão "Exportar relatório" do Dashboard aponta pra cá.

### 5.8 Configurações
- **Clínica**: nome, dados, logo.
- **Equipe**: convidar/gerenciar membros (papéis na fase 2).
- **Protocolos**: editor de protocolos e orientações por dia (no MVP vêm por seed;
  editor é fase 2).
- **Respostas prontas**: gerenciar templates de mensagem.
- **Assinatura**: plano atual, limite de pacientes ativos, uso, "Gerenciar assinatura".

## 6. App do Paciente (Flutter)

Foco no essencial do paciente:
1. **Onboarding/vínculo** — paciente entra via convite/código da clínica e cria conta.
2. **Orientação do dia** — mostra os passos do protocolo para o D+n atual.
3. **Check-in diário** — dor (0–10), febre, sangramento, inchaço, como se sente, observações.
4. **Mensagens** — conversa com a clínica.
5. **Retornos** — próximos retornos/consultas.
6. **Notificações push** — lembrete de check-in, orientação do dia, retorno próximo.

## 7. Regras de negócio-chave

- **Cálculo do D+n:** `dia_do_pos = data_atual − data_cirurgia`. Nunca armazenado
  solto; calculado a partir da cirurgia (trigger no check-in / cálculo na leitura).
- **Geração de alerta (triagem, não diagnóstico):** regra determinística no banco
  a cada check-in — febre ou sangramento → `critical`; dor ≥ 8 → `high`;
  dor ≥ 6 ou "sente-se mal" → `medium`. A decisão clínica é **sempre humana**;
  a UI deve deixar isso explícito.
- **Status do paciente:** `active` / `finished` no banco; "em alerta" é derivado
  de alertas `open`.
- **Multi-tenant:** todo dado é isolado por `clinic_id` via RLS. Equipe só vê a
  própria clínica; paciente só vê o próprio prontuário.
- **Limite de plano:** plano define teto de **pacientes ativos** (ex.: 100). Bloquear
  novo cadastro ao atingir o teto, com CTA de upgrade.

## 8. Modelo de negócio & requisitos transversais

### 8.1 Assinatura
- Recorrência mensal, faixa **R$97–R$297**, por limite de pacientes ativos.
- Integração de pagamento é **fase 2** (aproveitar experiência prévia com PIX/recorrência).

### 8.2 Segurança & LGPD
- Dado de saúde é sensível: consentimento no onboarding do paciente, RLS obrigatório,
  trilha de auditoria de acessos/alertas, mínimo de dados no cliente.
- Alertas e orientações são **apoio operacional**, não substituem avaliação médica.

### 8.3 Não-funcionais
- pt-BR em toda a UI; dark mode; responsivo (painel usável em tablet).
- Realtime nas mensagens e alertas (Supabase Realtime).
- Acessibilidade: contraste AA, foco visível, motion reduzido respeitado.

### 8.4 IA
- **Resumo semanal da IA** no Dashboard. MVP: começar com resumo determinístico
  (agregações do banco). Evolução: Edge Function chamando modelo para redigir o texto.

## 9. Modelo de dados
Ver `postcarepro_mvp_schema.sql`. Entidades: `clinics`, `profiles`, `protocols`,
`protocol_steps`, `patients`, `surgeries`, `checkins`, `alerts`, `messages`.
Módulos novos deste PRD que ampliam o schema na fase de build completa:
`appointments` (Agenda), `notifications`, `canned_responses`, `subscriptions`/`plans`,
`report_snapshots` (opcional).

## 10. Fora de escopo (agora)
- App white-label por clínica; web para o paciente; múltiplos idiomas;
  telemedicina/vídeo; integração com prontuário externo.

## 11. Roadmap sugerido
- **Fase 1 — Fluxo central:** Dashboard (métricas reais), Pacientes, Cirurgias,
  Mensagens, alertas por regra, app do paciente (orientação + check-in + mensagens).
- **Fase 2 — Operação:** Agenda, Notificações, Relatórios, respostas prontas,
  editor de protocolos, papéis granulares.
- **Fase 3 — Negócio & IA:** assinatura/pagamento, limites de plano, resumo por IA real, push.

## 12. Métricas de sucesso
- Adesão do paciente ao check-in (% de dias com check-in).
- Tempo médio de resposta da clínica às mensagens.
- Alertas críticos tratados dentro de X horas.
- Taxa de conclusão de protocolo.
- Clínicas ativas / churn.
