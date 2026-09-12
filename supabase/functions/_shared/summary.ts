// Resumo do quadro do paciente para o médico (conversations.ai_summary).
//
// Atualizado depois de cada resposta do agente, fora do caminho do paciente —
// a resposta já saiu. Aparece na ficha do paciente no painel e volta ao agente
// como memória além das últimas 10 mensagens.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { generateText } from './gemini.ts';
import { safeLog } from './http.ts';

const TZ = 'America/Sao_Paulo';
const WINDOW = 20;
const MAX_CHARS = 1200;
const WHO: Record<string, string> = { patient: 'Paciente', ai: 'Assistente', staff: 'Equipe', system: 'Sistema' };

function stamp(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

// Sem consentimento LGPD, o resumo não guarda dado de saúde — a conversa
// continua no histórico, e sintoma de alerta vira alerta de qualquer jeito.
function prompt(consent: boolean): string {
  return `Você mantém a ficha resumida de um paciente de uma clínica de transplante capilar, para o médico ler antes de atender.
Atualize o resumo a partir do resumo anterior e das mensagens recentes. Registre apenas fatos: o que o paciente contou (motivo do contato, histórico, expectativas${consent ? ', sintomas e queixas, com a data' : ''}), arquivos que enviou, agendamentos e dúvidas que ficaram sem resposta.
Não diagnostique, não interprete e não recomende nada.
${consent ? '' : 'O paciente ainda não autorizou o uso de dados de saúde: não registre sintomas, queixas nem informações de saúde; se ele relatou algo assim, escreva apenas "relatou sintomas — ver conversa".\n'}Formato: tópicos curtos começando com "- ", no máximo ${MAX_CHARS} caracteres, em português do Brasil. Se nada relevante mudou, devolva o resumo anterior sem alterações.`;
}

export async function refreshPatientSummary(
  admin: SupabaseClient,
  patientId: string,
  conversationId: string,
): Promise<void> {
  try {
    const [{ data: conv }, { data: patient }, { data: msgs }] = await Promise.all([
      admin.from('conversations').select('ai_summary').eq('id', conversationId).maybeSingle(),
      admin.from('patients').select('lgpd_consent').eq('id', patientId).maybeSingle(),
      admin.from('messages')
        .select('sender, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(WINDOW),
    ]);
    const lines = (msgs ?? [])
      .slice()
      .reverse()
      .filter((m) => m.body)
      .map((m) => `[${stamp(m.created_at)}] ${WHO[m.sender] ?? m.sender}: ${m.body}`);
    if (!lines.length) return;

    const text = await generateText(
      conversationId,
      [{ text: `Resumo anterior:\n${conv?.ai_summary || '(nenhum)'}\n\nMensagens recentes:\n${lines.join('\n')}` }],
      { systemText: prompt(patient?.lgpd_consent === true), maxOutputTokens: 2048 },
    );
    if (!text || text === conv?.ai_summary) return;

    await admin.from('conversations').update({ ai_summary: text.slice(0, MAX_CHARS + 300) }).eq('id', conversationId);
    safeLog('summary_updated', { conversation_id: conversationId, chars: text.length });
  } catch (e) {
    // O resumo é conveniência: falhar aqui não pode afetar o atendimento.
    safeLog('summary_failed', { conversation_id: conversationId, error: String(e).slice(0, 160) });
  }
}
