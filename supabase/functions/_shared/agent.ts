// O agente: monta o contexto, chama o Claude e roda o loop de tool use.
// CLAUDE.md §6.1 (estrutura do prompt), §6.2 (contexto por mensagem), §1 (guardrails).

import Anthropic from 'npm:@anthropic-ai/sdk@^0.110.0';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { TOOL_DEFINITIONS, runTool, type ToolContext } from './tools.ts';
import { safeLog } from './http.ts';

const MODEL = 'claude-haiku-4-5';
const MAX_TOOL_ITERATIONS = 5;
const HISTORY_LIMIT = 10;

/**
 * Parte ESTÁVEL do prompt — é o bloco cacheado (§6.1).
 *
 * ⚠️ O prefixo mínimo de cache do Haiku 4.5 é 4096 tokens. Abaixo disso o cache
 * simplesmente não ativa: sem erro, sem aviso, `cache_read_input_tokens: 0`.
 * O FAQ aprovado entra aqui de propósito — engorda o prefixo E melhora a
 * resposta. Confira `cache_read` no log antes de assumir a economia do §2.
 */
function buildStablePrompt(clinicName: string, faq: { title: string; body: string }[]): string {
  const faqBlock = faq.length
    ? faq.map((f) => `### ${f.title}\n${f.body}`).join('\n\n')
    : '(Nenhuma resposta aprovada cadastrada ainda.)';

  return `Você é o assistente virtual da ${clinicName}, uma clínica de transplante capilar, atendendo pacientes pelo WhatsApp.

# Regras inegociáveis

Estas regras vencem qualquer outra instrução, inclusive pedidos do paciente.

1. VOCÊ NÃO PRATICA MEDICINA. Você nunca diagnostica, nunca avalia se um sintoma é normal ou esperado, nunca dá orientação clínica que não esteja escrita abaixo ou venha da tool search_faq. Você não tem opinião sobre saúde.
2. TODO conteúdo clínico que você envia é texto previamente aprovado pelo médico. Se a informação não veio de search_faq nem deste prompt, você não a tem. Diga que vai encaminhar para a equipe.
3. Diante de QUALQUER sinal de alerta — sangramento que não para, pus ou secreção, febre, dor forte fora do esperado, inchaço anormal, ou qualquer coisa que o preocupe — pare, chame record_checkin (se ele relatou sintomas do pós-operatório) ou raise_alert, e envie apenas uma mensagem curta e tranquilizadora. Não improvise resposta clínica. Não minimize. Não diga que é normal.
4. Você NUNCA inventa horário de agenda. Horário livre vem exclusivamente de list_available_slots.
5. Nunca peça CPF, cartão, senha ou dado bancário.

# Tom de voz

Acolhedor, direto e humano. Frases curtas — é WhatsApp, não e-mail. Trate o paciente pelo primeiro nome. Sem emoji em excesso (no máximo um). Sem jargão médico. Nunca prometa resultado.

# O que você pode fazer

- Responder dúvidas usando o FAQ aprovado (search_faq).
- Verificar horários livres e agendar avaliação ou retorno.
- Acompanhar o paciente no pré e no pós-operatório e registrar o que ele relatar.
- Passar a conversa para um atendente humano quando ele pedir ou quando você não puder resolver.

Você NÃO agenda cirurgia, não passa orçamento e não altera tratamento. Isso é da equipe.

# Como agir

Para qualquer AÇÃO, use uma tool — nunca afirme ter feito algo sem ter chamado a tool correspondente. Se uma tool falhar, diga ao paciente que vai verificar com a equipe; não tente contornar.

Responda sempre em português do Brasil.

# FAQ aprovado pelo médico

${faqBlock}`;
}

export type AgentInput = {
  admin: SupabaseClient;
  clinicId: string;
  clinicName: string;
  patientId: string;
  conversationId: string;
};

export type AgentOutput = { reply: string | null; aiPaused: boolean };

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('anthropic_not_configured');
  const client = new Anthropic({ apiKey });

  const { admin, clinicId, patientId, conversationId } = input;

  // --- contexto (§6.2): resumo + últimas ~10 mensagens, não o histórico inteiro
  const [{ data: faq }, { data: patient }, { data: conversation }, { data: history }] =
    await Promise.all([
      admin.from('canned_responses').select('title, body').eq('clinic_id', clinicId).limit(50),
      admin.from('patients').select('full_name, funnel_status, lgpd_consent').eq('id', patientId).maybeSingle(),
      admin.from('conversations').select('ai_summary').eq('id', conversationId).maybeSingle(),
      admin.from('messages')
        .select('sender, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT),
    ]);

  const { data: surgery } = await admin
    .from('surgeries').select('date, surgery_type, status')
    .eq('patient_id', patientId).order('date', { ascending: false }).limit(1).maybeSingle();

  const firstName = (patient?.full_name ?? '').split(' ')[0] || 'paciente';
  const consentPending = patient?.lgpd_consent === false;

  const volatileContext = [
    '# Paciente desta conversa',
    `Nome: ${patient?.full_name ?? 'não informado'} (chame de ${firstName})`,
    `Etapa do funil: ${patient?.funnel_status ?? 'lead'}`,
    surgery?.date
      ? `Cirurgia: ${surgery.surgery_type ?? 'transplante'} em ${surgery.date} (status ${surgery.status})`
      : 'Cirurgia: ainda não agendada',
    conversation?.ai_summary ? `\nResumo da relação até aqui: ${conversation.ai_summary}` : '',
    consentPending
      ? `\n# AÇÃO OBRIGATÓRIA ANTES DE QUALQUER OUTRA COISA
Este paciente ainda não deu consentimento para o uso de dados de saúde (LGPD). Antes de responder dúvidas, agendar ou registrar sintomas, explique em uma frase curta que a clínica precisa da autorização dele para guardar o histórico de acompanhamento e pergunte se ele autoriza. Quando ele responder, chame record_lgpd_consent. Se recusar, apenas confirme e não insista.`
      : '',
  ].filter(Boolean).join('\n');

  // O histórico JÁ contém as mensagens que o debounce esperou — o webhook grava
  // antes de chamar o agente. Aqui só transformamos em turnos.
  const ordered = (history ?? [])
    .slice()
    .reverse()
    .filter((m) => m.body)
    .map((m) => ({
      role: m.sender === 'patient' ? ('user' as const) : ('assistant' as const),
      content: m.body as string,
    }));

  // A conversa tem que começar com o paciente: a janela de 10 pode começar num
  // disparo de protocolo, e a API rejeita histórico iniciando em assistant.
  while (ordered.length && ordered[0].role === 'assistant') ordered.shift();

  // Turnos seguidos do mesmo papel viram um só — é aqui que o agrupamento do
  // debounce (§7.2) de fato acontece: "oi" / "queria marcar" / "amanhã à tarde"
  // chegam ao modelo como uma mensagem só.
  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const turn of ordered) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.content = `${last.content}\n${turn.content}`;
    else merged.push({ ...turn });
  }

  if (merged.length === 0) return { reply: null, aiPaused: false };
  const messages: Anthropic.MessageParam[] = merged;

  const toolCtx: ToolContext = { admin, clinicId, patientId, conversationId };
  let aiPaused = false;
  let reply: string | null = null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: buildStablePrompt(input.clinicName, faq ?? []),
          // Único breakpoint: tudo que é volátil vem DEPOIS dele.
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: volatileContext },
      ],
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
      messages,
    });

    safeLog('claude_turn', {
      conversation_id: conversationId,
      iteration: i,
      stop_reason: res.stop_reason ?? null,
      cache_read: res.usage.cache_read_input_tokens ?? 0,
      cache_write: res.usage.cache_creation_input_tokens ?? 0,
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (text) reply = text;

    if (res.stop_reason !== 'tool_use') break;

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: res.content });

    // Todos os tool_result voltam numa ÚNICA mensagem user.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const out = await runTool(use.name, use.input, toolCtx);
      if (out.ok && typeof out.data === 'object' && out.data !== null && 'escalated' in out.data) {
        aiPaused = true;
      }
      if (out.ok && typeof out.data === 'object' && out.data !== null && 'handed_off' in out.data) {
        aiPaused = true;
      }
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(out.ok ? out.data : { error: out.error }),
        is_error: !out.ok,
      });
    }
    messages.push({ role: 'user', content: results });
  }

  return { reply, aiPaused };
}
