// O agente: monta o contexto, chama o Gemini e roda o loop de function calling.
// CLAUDE.md §6.1 (estrutura do prompt), §6.2 (contexto por mensagem), §1 (guardrails).
// A chamada HTTP ao Gemini fica em gemini.ts (compartilhada com mídia e resumo).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { TOOL_DEFINITIONS, openServiceAlert, runTool, type ToolContext, type ToolResult } from './tools.ts';
import { generate, geminiConfig, thinkingFields, type GeminiContent, type GeminiPart } from './gemini.ts';
import { safeLog } from './http.ts';

const MAX_TOOL_ITERATIONS = 5;
const HISTORY_LIMIT = 10;
// Teto de segurança. Nos modelos com raciocínio os tokens de thinking contam
// aqui — um teto baixo corta a resposta e devolve texto vazio.
const MAX_OUTPUT_TOKENS = 8192;
const TZ = 'America/Sao_Paulo';

// Mensagem de espera: antes de consultar agenda ou FAQ, o paciente recebe
// "Boa tarde, Vinicius! Um momento que vou verificar…" em vez de ficar sem
// resposta até a mensagem completa. Estas são as tools que justificam a espera.
const ACK_TOOLS: Record<string, string> = {
  list_available_slots: 'vou verificar os horários disponíveis',
  book_appointment: 'vou confirmar o seu agendamento',
  reschedule_appointment: 'vou remarcar para você',
  cancel_appointment: 'vou verificar o cancelamento',
  list_my_appointments: 'vou ver os seus agendamentos',
  search_faq: 'vou confirmar essa informação',
};
// Intervalo mínimo entre a espera e a resposta: duas mensagens coladas parecem
// robô. A resposta ainda mostra 2 s de "digitando…" (index.ts), então o paciente
// sente uns 4–5 s entre as duas.
const ACK_MIN_GAP_MS = 2000;
// Conversa recente não repete "bom dia": só "Só um momento…".
const GREETING_RESET_MS = 3 * 60 * 60 * 1000;

function greetingNow(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()),
  ) % 24;
  return hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
}

function buildAck(tool: string, name: string, greeted: boolean): string {
  const who = name ? `, ${name}` : '';
  return greeted
    ? `Só um momento${who}, ${ACK_TOOLS[tool]}…`
    : `${greetingNow()}${who}! Um momento que ${ACK_TOOLS[tool]}…`;
}

// ---------------------------------------------------------------------------
// Configuração da clínica (painel: Configurações → Assistente de IA)
// ---------------------------------------------------------------------------
// Guardada em clinics.ai_settings (lib/ai-settings.ts do painel — mesmo
// contrato e MESMOS PADRÕES). Personaliza identidade, tom e orientações; as
// Regras inegociáveis e a mecânica das tools continuam fixas aqui.

type AiSettings = {
  enabled: boolean;
  assistantName: string;
  tone: 'acolhedor' | 'profissional' | 'descontraido';
  greeting: string;
  clinicInfo: string;
  customInstructions: string;
  pricingPolicy: string;
  handoffRules: string;
  forbidden: string;
};

const TONES: Record<AiSettings['tone'], string> = {
  acolhedor:
    'Acolhedor, direto e humano. Frases curtas — é WhatsApp, não e-mail. Trate o paciente pelo primeiro nome. No máximo um emoji.',
  profissional:
    'Cordial, objetivo e respeitoso. Linguagem cuidada, sem gírias e sem emoji. Frases curtas — é WhatsApp. Trate o paciente pelo primeiro nome.',
  descontraido:
    'Leve, simpático e próximo, com linguagem do dia a dia, sem perder o respeito. Até dois emojis. Frases curtas — é WhatsApp. Trate o paciente pelo primeiro nome.',
};

// Comportamento sem configuração salva. É o que a tela do painel mostra
// preenchido (DEFAULT_AI_SETTINGS) — os dois textos têm que ser iguais.
const DEFAULTS = {
  greeting:
    'Olá! Sou a assistente virtual da clínica. Posso te ajudar com dúvidas, agendamento de avaliação e o acompanhamento do seu pós-operatório.',
  customInstructions: [
    '- Responda primeiro ao que o paciente pediu. Uma pergunta por vez.',
    '- Nunca repita a mesma mensagem. Se o paciente mudar de assunto, siga o assunto dele e retome depois, com outras palavras.',
    '- Para agendar, ofereça 2 ou 3 horários, nunca a lista inteira.',
    '- Depois de marcar, confirme o dia e a hora por extenso e o endereço da clínica.',
    '- Antes de cancelar um agendamento, confirme com o paciente.',
    '- Se o paciente mandar áudio, responda ao que ele disse como se fosse texto. Se mandar foto, vídeo ou exame, diga que já encaminhou ao médico.',
  ].join('\n'),
  pricingPolicy:
    'Não passamos orçamento pelo WhatsApp. Se o FAQ tiver a resposta sobre valores, use-a; se não, diga que o valor é apresentado na avaliação e ofereça marcar uma.',
  handoffRules:
    'Quando o paciente pedir para falar com uma pessoa, reclamar do atendimento ou quando você não conseguir resolver o que ele precisa.',
  forbidden: [
    'Prometer resultado do transplante (densidade, número de fios, prazo).',
    'Usar jargão médico.',
    'Agendar cirurgia, passar orçamento de cirurgia ou alterar tratamento — isso é da equipe.',
  ].join('\n'),
};

// deno-lint-ignore no-explicit-any
export function readAiSettings(raw: any): AiSettings {
  const r = raw && typeof raw === 'object' ? raw : {};
  // Campo nunca salvo = padrão; salvo vazio = a clínica quis tirar aquela orientação.
  const text = (v: unknown, fallback: string, max = 2000) =>
    typeof v === 'string' ? v.trim().slice(0, max) : fallback;
  return {
    enabled: r.enabled !== false,
    assistantName: text(r.assistant_name, '', 40),
    tone: r.tone === 'profissional' || r.tone === 'descontraido' ? r.tone : 'acolhedor',
    greeting: text(r.greeting, DEFAULTS.greeting),
    clinicInfo: text(r.clinic_info, ''),
    customInstructions: text(r.custom_instructions, DEFAULTS.customInstructions),
    pricingPolicy: text(r.pricing_policy, DEFAULTS.pricingPolicy),
    handoffRules: text(r.handoff_rules, DEFAULTS.handoffRules),
    forbidden: text(r.forbidden, DEFAULTS.forbidden),
  };
}

/**
 * Parte ESTÁVEL do prompt — vem primeiro de propósito (§6.1).
 *
 * O Gemini faz cache implícito de prefixo: o desconto vale quando o começo da
 * requisição é idêntico ao de uma anterior. Por isso nada volátil (paciente,
 * data e hora) entra aqui. O FAQ aprovado entra — engorda o prefixo E melhora a
 * resposta. Confira `cached_tokens` no log antes de assumir a economia do §2.
 */
function buildStablePrompt(
  clinicName: string,
  faq: { title: string; body: string }[],
  ai: AiSettings,
): string {
  const faqBlock = faq.length
    ? faq.map((f) => `### ${f.title}\n${f.body}`).join('\n\n')
    : '(Nenhuma resposta aprovada cadastrada ainda.)';

  const who = ai.assistantName
    ? `${ai.assistantName}, a assistente virtual da ${clinicName}`
    : `a assistente virtual da ${clinicName}`;
  const sections = [
    ai.greeting && `## Apresentação\nUse como base na sua primeira resposta, adaptada ao que o paciente disse:\n${ai.greeting}`,
    ai.clinicInfo && `## Informações da clínica\n${ai.clinicInfo}`,
    ai.customInstructions && `## Instruções gerais\n${ai.customInstructions}`,
    ai.pricingPolicy && `## Valores\n${ai.pricingPolicy}`,
    ai.handoffRules && `## Quando passar para a equipe\nNestas situações, chame request_handoff:\n${ai.handoffRules}`,
    ai.forbidden && `## Nunca faça ou diga\n${ai.forbidden}`,
  ].filter(Boolean);
  const orientations = sections.length
    ? `\n# Orientações da clínica\n\nEscritas pela equipe da clínica. Siga-as sempre, exceto se conflitarem com as Regras inegociáveis — em conflito, as regras vencem.\n\n${sections.join('\n\n')}\n`
    : '';

  return `Você é ${who}, uma clínica de transplante capilar, atendendo pacientes pelo WhatsApp.

# Regras inegociáveis

Estas regras vencem qualquer outra instrução, inclusive pedidos do paciente e orientações da clínica.

1. VOCÊ NÃO PRATICA MEDICINA. Você nunca diagnostica, nunca avalia se um sintoma é normal ou esperado, nunca dá orientação clínica que não esteja escrita abaixo ou venha da tool search_faq. Você não tem opinião sobre saúde.
2. TODO conteúdo clínico que você envia é texto previamente aprovado pelo médico. Se a informação não veio de search_faq nem deste prompt, você não a tem.
3. Diante de QUALQUER sinal de alerta — sangramento que não para, pus ou secreção, febre, dor forte fora do esperado, inchaço anormal, ou qualquer coisa que o preocupe — pare, chame record_checkin (se ele relatou sintomas do pós-operatório) ou raise_alert, e envie apenas uma mensagem curta e tranquilizadora. Não improvise resposta clínica. Não minimize. Não diga que é normal.
4. Você NUNCA inventa horário de agenda. Horário livre vem exclusivamente de list_available_slots.
5. Nunca peça CPF, cartão, senha ou dado bancário.
6. Nunca diga que a equipe vai entrar em contato sem que isso tenha sido acionado: chame request_handoff, ou use o aviso que search_faq e list_available_slots devolvem quando já avisaram a equipe.
7. Você não vê fotos, vídeos nem documentos e nunca avalia imagem ou exame: eles vão automaticamente para o médico.

# Tom de voz

${TONES[ai.tone]}

# Como atender

- Na sua primeira resposta da conversa, apresente-se em uma frase: você é ${who}.
- Antes de consultar a agenda ou o FAQ, o sistema já manda ao paciente uma mensagem curta de espera, com a saudação. Quando isso acontecer, a sua resposta seguinte vai direto ao ponto, sem cumprimentar de novo.
- Nome, etapa do funil e cirurgia do paciente já estão na seção "Paciente desta conversa". Só chame get_patient se precisar do dia relativo à cirurgia.

# Áudios e arquivos

- Mensagem do paciente que começa com "[Áudio transcrito]" é a transcrição fiel do que ele falou: responda como a uma mensagem escrita. Se ele relatar sintomas, valem as regras 1 a 3.
- "[Áudio não transcrito…]": diga com gentileza que não conseguiu ouvir e peça para escrever ou mandar de novo.
- "[Arquivo enviado: …]": foto, vídeo ou documento que já foi encaminhado ao médico, com alerta para a equipe. Agradeça, diga que o médico vai avaliar e não comente o conteúdo. Se vier legenda com pergunta ou relato, trate a legenda como mensagem normal.

# Consentimento (LGPD)

O contexto informa se o consentimento para dados de saúde está PENDENTE. Ele só é necessário antes de registrar sintomas ou informações de saúde (record_checkin). Para cumprimentar, tirar dúvidas gerais e agendar avaliação, não peça.
Quando precisar pedir, faça isso junto com a resposta ao que o paciente disse, em uma frase, e chame record_lgpd_consent assim que ele responder.
Diante de sinal de alerta, acione raise_alert imediatamente mesmo sem consentimento — a proteção da saúde vem primeiro — e peça a autorização depois.

# Agendamento

- A data e a hora de agora estão no contexto. Use-as para entender "amanhã", "sexta", "semana que vem", e busque sempre a partir de hoje.
- Chame list_available_slots e ofereça os horários usando o "label" de cada um (ex.: "segunda, 14/09, às 9h").
- Para marcar, use em book_appointment o "starts_at" exato do horário escolhido.
- Para remarcar ou cancelar: list_my_appointments, depois reschedule_appointment ou cancel_appointment.
- Se a tool avisar que a agenda está sem horário, a equipe já foi avisada: diga que vão entrar em contato para combinar a data.

# Quando você não souber

- Se search_faq não encontrar resposta, a equipe já é avisada automaticamente. Diga que vai confirmar com a equipe e continue ajudando no que puder.
- Chame request_handoff quando o paciente pedir para falar com alguém e nas situações que a clínica listou em "Quando passar para a equipe".

# Como agir

Para qualquer AÇÃO, use uma tool — nunca afirme ter feito algo sem ter chamado a tool correspondente. Se uma tool falhar, siga o que ela orientar; não tente contornar.

Você NÃO agenda cirurgia, não passa orçamento de cirurgia e não altera tratamento. Isso é da equipe.

Responda sempre em português do Brasil.
${orientations}
# FAQ aprovado pelo médico

${faqBlock}`;
}

/** "sexta-feira, 11/09/2026, 13:26 — hoje em AAAA-MM-DD: 2026-09-11". */
function nowInClinicTz(): string {
  const now = new Date();
  const human = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(now);
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return `${human} (horário de Brasília). Hoje em AAAA-MM-DD: ${iso}.`;
}

// ---------------------------------------------------------------------------
// Tools no formato do Gemini
// ---------------------------------------------------------------------------
// TOOL_DEFINITIONS está em JSON Schema. O `parameters` do Gemini usa o Schema
// da OpenAPI, com o tipo em maiúsculas (OBJECT, STRING...).

// deno-lint-ignore no-explicit-any
function toGeminiSchema(s: any): Record<string, unknown> {
  const out: Record<string, unknown> = { type: String(s.type).toUpperCase() };
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (typeof s.minimum === 'number') out.minimum = s.minimum;
  if (typeof s.maximum === 'number') out.maximum = s.maximum;
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties) {
    out.properties = Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  }
  if (Array.isArray(s.required) && s.required.length) out.required = s.required;
  return out;
}

// Tool sem argumento vai sem `parameters`: o Gemini recusa OBJECT sem propriedades.
const FUNCTION_DECLARATIONS = TOOL_DEFINITIONS.map((t) =>
  Object.keys(t.input_schema.properties).length > 0
    ? { name: t.name, description: t.description, parameters: toGeminiSchema(t.input_schema) }
    : { name: t.name, description: t.description }
);

/**
 * O que dá para logar de uma tool sem expor o paciente (LGPD, §1.3): nome,
 * resultado e, nas de agenda, as datas — que é o que explica um "sem horários".
 */
// deno-lint-ignore no-explicit-any
function toolLogFields(name: string, args: any, out: ToolResult): Record<string, string | number | boolean | null> {
  const f: Record<string, string | number | boolean | null> = { tool: name, ok: out.ok };
  if (name === 'list_available_slots') {
    f.from_date = String(args?.from_date ?? '');
    f.to_date = String(args?.to_date ?? '');
    // deno-lint-ignore no-explicit-any
    const slots = out.ok ? (out.data as any)?.slots : null;
    f.slots = Array.isArray(slots) ? slots.length : 0;
  }
  if (name === 'book_appointment') f.starts_at = String(args?.starts_at ?? '');
  if (name === 'reschedule_appointment') f.starts_at = String(args?.new_starts_at ?? '');
  if (name === 'set_funnel_status') f.status = String(args?.status ?? '');
  if (!out.ok) f.error = out.error.slice(0, 120);
  return f;
}

// "a equipe vai entrar em contato", "vou pedir para alguém da clínica te responder"…
const PROMISES_TEAM = /(equipe|atendente|algu[eé]m da cl[ií]nica)/i;
const PROMISE_VERBS = /(contato|retorn|respond|encaminh|avis|falar com)/i;

export type AgentInput = {
  admin: SupabaseClient;
  clinicId: string;
  clinicName: string;
  patientId: string;
  conversationId: string;
  /** Envia uma mensagem intermediária (a de espera) enquanto o agente trabalha. */
  sendInterim?: (text: string) => Promise<void>;
  /** A equipe já foi avisada nesta rodada (ex.: arquivo encaminhado ao médico). */
  alreadyAlerted?: boolean;
};

export type AgentOutput = { reply: string | null; aiPaused: boolean };

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const { apiKey, model, thinkingLevel } = geminiConfig();
  const { admin, clinicId, patientId, conversationId } = input;

  // --- contexto (§6.2): resumo + últimas ~10 mensagens, não o histórico inteiro
  const [{ data: faq }, { data: patient }, { data: conversation }, { data: history }, { data: clinic }] =
    await Promise.all([
      admin.from('canned_responses').select('title, body').eq('clinic_id', clinicId).limit(50),
      admin.from('patients').select('full_name, funnel_status, lgpd_consent').eq('id', patientId).maybeSingle(),
      admin.from('conversations').select('ai_summary').eq('id', conversationId).maybeSingle(),
      admin.from('messages')
        .select('sender, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT),
      admin.from('clinics').select('address, phone, ai_settings').eq('id', clinicId).maybeSingle(),
    ]);

  const { data: surgery } = await admin
    .from('surgeries').select('date, surgery_type, status')
    .eq('patient_id', patientId).order('date', { ascending: false }).limit(1).maybeSingle();

  const firstName = (patient?.full_name ?? '').split(' ')[0] || 'paciente';
  // Contato sem nome no WhatsApp vira "WhatsApp +55…": não dá para chamar assim.
  const ackName = (patient?.full_name ?? '').startsWith('WhatsApp ') ? '' : firstName;
  const consentPending = patient?.lgpd_consent === false;
  const firstReply = !(history ?? []).some((m) => m.sender === 'ai');
  const lastAi = (history ?? []).find((m) => m.sender === 'ai');
  const greetedRecently = Boolean(
    lastAi && Date.now() - new Date(lastAi.created_at).getTime() < GREETING_RESET_MS,
  );

  const volatileContext = [
    '# Agora',
    nowInClinicTz(),
    '',
    '# Clínica',
    `Endereço: ${clinic?.address || 'não cadastrado (se perguntarem, diga que a equipe confirma)'}`,
    `Telefone: ${clinic?.phone || 'não cadastrado'}`,
    '',
    '# Paciente desta conversa',
    `Nome: ${patient?.full_name ?? 'não informado'} (chame de ${firstName})`,
    `Etapa do funil: ${patient?.funnel_status ?? 'lead'}`,
    surgery?.date
      ? `Cirurgia: ${surgery.surgery_type ?? 'transplante'} em ${surgery.date} (status ${surgery.status})`
      : 'Cirurgia: ainda não agendada',
    `Consentimento LGPD para dados de saúde: ${consentPending ? 'PENDENTE' : 'concedido'}`,
    firstReply ? 'Esta é a sua primeira resposta nesta conversa: apresente-se.' : '',
    conversation?.ai_summary ? `\nResumo do paciente até aqui (feito automaticamente):\n${conversation.ai_summary}` : '',
  ].filter((l) => l !== null && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');

  // O histórico JÁ contém as mensagens que o debounce esperou — o webhook grava
  // antes de chamar o agente. Aqui só transformamos em turnos.
  const ordered = (history ?? [])
    .slice()
    .reverse()
    .filter((m) => m.body)
    .map((m) => ({
      role: m.sender === 'patient' ? ('user' as const) : ('model' as const),
      content: m.body as string,
    }));

  // A conversa tem que começar com o paciente: a janela de 10 pode começar num
  // disparo de protocolo, e a API espera a alternância user/model a partir do user.
  while (ordered.length && ordered[0].role === 'model') ordered.shift();

  // Turnos seguidos do mesmo papel viram um só — é aqui que o agrupamento do
  // debounce (§7.2) de fato acontece: "oi" / "queria marcar" / "amanhã à tarde"
  // chegam ao modelo como uma mensagem só.
  const merged: { role: 'user' | 'model'; content: string }[] = [];
  for (const turn of ordered) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.content = `${last.content}\n${turn.content}`;
    else merged.push({ ...turn });
  }

  if (merged.length === 0) return { reply: null, aiPaused: false };
  const contents: GeminiContent[] = merged.map((t) => ({ role: t.role, parts: [{ text: t.content }] }));

  // Estável primeiro, volátil depois — mesma ordem a cada chamada, para o cache.
  const systemInstruction = {
    parts: [
      { text: buildStablePrompt(input.clinicName, faq ?? [], readAiSettings(clinic?.ai_settings)) },
      { text: volatileContext },
    ],
  };

  const toolCtx: ToolContext = {
    admin, clinicId, patientId, conversationId, flags: { alerted: Boolean(input.alreadyAlerted) },
  };
  let aiPaused = false;
  let reply: string | null = null;
  let ackText: string | null = null;
  let ackSentAt = 0;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const res = await generate(apiKey, model, {
      systemInstruction,
      contents,
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        ...thinkingFields(model, thinkingLevel),
      },
    }, conversationId);

    const candidate = res.candidates?.[0];
    const usage = res.usageMetadata ?? {};
    safeLog('gemini_turn', {
      conversation_id: conversationId,
      model,
      iteration: i,
      finish_reason: candidate?.finishReason ?? null,
      block_reason: res.promptFeedback?.blockReason ?? null,
      prompt_tokens: usage.promptTokenCount ?? 0,
      cached_tokens: usage.cachedContentTokenCount ?? 0,
      output_tokens: usage.candidatesTokenCount ?? 0,
      thoughts_tokens: usage.thoughtsTokenCount ?? 0,
    });

    // Sem conteúdo = prompt bloqueado pelo filtro de segurança. Não há o que enviar.
    const parts: GeminiPart[] | undefined = candidate?.content?.parts;
    if (!parts) break;

    const text = parts
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('\n')
      .trim();
    if (text) reply = text;

    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0) break;

    // Mensagem de espera, uma vez por turno: sai antes de a tool rodar. Se o
    // modelo já escreveu uma frase curta junto com a chamada, ela é a espera.
    let ackNote: string | null = null;
    const ackTool = calls.map((c) => c.functionCall!.name).find((n) => n in ACK_TOOLS);
    if (ackTool && !ackSentAt && input.sendInterim) {
      const ack = text && text.length <= 160 ? text : buildAck(ackTool, ackName, greetedRecently);
      try {
        await input.sendInterim(ack);
        ackText = ack;
        ackSentAt = Date.now();
        ackNote = ack;
        reply = null;
      } catch (e) {
        safeLog('ack_failed', { conversation_id: conversationId, error: String(e).slice(0, 120) });
      }
    }

    // O turno do modelo volta INTACTO: nos modelos com raciocínio ele carrega
    // `thoughtSignature`, e a API recusa a continuação se a assinatura sumir.
    contents.push({ role: 'model', parts });

    // Todas as respostas de função voltam num ÚNICO turno user.
    const responses: GeminiPart[] = [];
    for (const { functionCall: call } of calls) {
      const args = call!.args ?? {};
      const out = await runTool(call!.name, args, toolCtx);
      safeLog('tool_call', { conversation_id: conversationId, iteration: i, ...toolLogFields(call!.name, args, out) });
      if (out.ok && typeof out.data === 'object' && out.data !== null && 'escalated' in out.data) {
        aiPaused = true;
      }
      if (out.ok && typeof out.data === 'object' && out.data !== null && 'handed_off' in out.data) {
        aiPaused = true;
      }
      // `response` tem que ser objeto JSON. A primeira resposta leva o aviso de
      // que o paciente já recebeu a espera, para o modelo não cumprimentar de novo.
      const response: Record<string, unknown> = out.ok ? { result: out.data } : { error: out.error };
      if (ackNote && responses.length === 0) {
        response.patient_already_received = ackNote;
        response.instruction = 'Não cumprimente de novo: responda direto ao ponto.';
      }
      responses.push({
        functionResponse: {
          ...(call!.id ? { id: call!.id } : {}),
          name: call!.name,
          response,
        },
      });
    }
    contents.push({ role: 'user', parts: responses });
  }

  if (ackSentAt) {
    if (reply && reply === ackText) reply = null;
    // Prometeu "um momento" e não veio nada: vira falha, que aciona alerta e aviso.
    if (!reply && !aiPaused) throw new Error('empty_reply_after_ack');
    const wait = ACK_MIN_GAP_MS - (Date.now() - ackSentAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  // Rede de segurança: a resposta promete retorno da equipe e nada nesta rodada
  // avisou ninguém — foi exatamente o que aconteceu no teste de 11/09.
  if (reply && !toolCtx.flags.alerted && PROMISES_TEAM.test(reply) && PROMISE_VERBS.test(reply)) {
    await openServiceAlert(
      toolCtx,
      'handoff',
      'A assistente disse ao paciente que a equipe vai retornar. Confira a conversa e responda pelo chat.',
    );
    safeLog('promise_without_escalation', { conversation_id: conversationId });
  }

  return { reply, aiPaused };
}
