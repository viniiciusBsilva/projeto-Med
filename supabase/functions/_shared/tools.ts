// Tools do agente (CLAUDE.md §6.3).
//
// Princípio da §1.2: a IA PROPÕE, o código EXECUTA e VALIDA. Nenhuma tool aceita
// da IA um dado que o banco pode determinar sozinho — horário livre vem de
// query, severidade clínica vem do trigger `checkin_triage`.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Regras de agenda — PLACEHOLDER
// Horário de atendimento e regras da clínica estão pendentes com o médico
// (§10). Quando chegarem, isto vira `clinics.config` em vez de constante.
// ---------------------------------------------------------------------------
const TZ = 'America/Sao_Paulo';
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 18;
const SLOT_MINUTES = 30;
const WORKDAYS = [1, 2, 3, 4, 5]; // seg-sex

export type ToolContext = {
  admin: SupabaseClient;
  clinicId: string;
  patientId: string;
  conversationId: string;
};

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Schemas expostos ao modelo
// ---------------------------------------------------------------------------
export const TOOL_DEFINITIONS = [
  {
    name: 'get_patient',
    description:
      'Busca os dados do paciente da conversa atual: nome, etapa do funil, data da cirurgia se houver e etapa do protocolo. Use antes de responder qualquer coisa que dependa do histórico dele.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_faq',
    description:
      'Busca uma resposta APROVADA PELO MÉDICO no FAQ da clínica. Use SEMPRE que o paciente fizer uma pergunta sobre o procedimento, cuidados ou recuperação. Se não retornar nada, diga que vai encaminhar para a equipe — NUNCA responda com conhecimento próprio.',
    input_schema: {
      type: 'object',
      properties: { question: { type: 'string', description: 'A dúvida do paciente, em poucas palavras.' } },
      required: ['question'],
    },
  },
  {
    name: 'list_available_slots',
    description:
      'Lista horários realmente livres na agenda da clínica. É a ÚNICA fonte de horário — nunca invente ou suponha disponibilidade.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'Data inicial, formato AAAA-MM-DD.' },
        to_date: { type: 'string', description: 'Data final, formato AAAA-MM-DD.' },
      },
      required: ['from_date', 'to_date'],
    },
  },
  {
    name: 'book_appointment',
    description:
      'Agenda uma consulta ou retorno em um horário obtido por list_available_slots. O código revalida se o horário continua livre e rejeita se tiver sido ocupado. Não agenda cirurgia — isso é da equipe.',
    input_schema: {
      type: 'object',
      properties: {
        starts_at: { type: 'string', description: 'Início, ISO 8601 com fuso (ex.: 2026-09-10T14:00:00-03:00).' },
        type: { type: 'string', enum: ['consultation', 'return'], description: 'Avaliação ou retorno.' },
        title: { type: 'string', description: 'Título curto do compromisso.' },
      },
      required: ['starts_at', 'type'],
    },
  },
  {
    name: 'set_funnel_status',
    description: 'Atualiza a etapa do paciente no funil quando ela mudar de fato na conversa.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: [
            'lead', 'evaluation_scheduled', 'quote_sent', 'surgery_scheduled',
            'operated', 'in_followup', 'discharged', 'cancelled', 'follow_up',
          ],
        },
      },
      required: ['status'],
    },
  },
  {
    name: 'record_checkin',
    description:
      'Registra o relato de sintomas do paciente no pós-operatório. Preencha SOMENTE o que o paciente afirmou; não deduza e não estime. A classificação de gravidade é feita pelo sistema, não por você.',
    input_schema: {
      type: 'object',
      properties: {
        pain: { type: 'integer', minimum: 0, maximum: 10, description: 'Nível de dor de 0 a 10, se o paciente informou.' },
        fever: { type: 'boolean', description: 'O paciente relatou febre.' },
        bleeding: { type: 'boolean', description: 'O paciente relatou sangramento.' },
        swelling: { type: 'boolean', description: 'O paciente relatou inchaço.' },
        redness: { type: 'boolean', description: 'O paciente relatou vermelhidão no couro cabeludo.' },
        itching: { type: 'boolean', description: 'O paciente relatou coceira.' },
        crusts: { type: 'boolean', description: 'O paciente relatou crostas.' },
        feeling: { type: 'string', enum: ['bem', 'regular', 'mal'], description: 'Como o paciente disse que está se sentindo.' },
        notes: { type: 'string', description: 'Relato do paciente com as palavras dele.' },
      },
      required: [],
    },
  },
  {
    name: 'raise_alert',
    description:
      'Escala para a equipe humana e PAUSA você na conversa. Use diante de qualquer sinal de alerta ou situação clínica que não caiba em record_checkin. Depois de chamar, envie apenas a mensagem curta e tranquilizadora, sem opinião clínica.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'O que o paciente relatou, com as palavras dele.' } },
      required: ['reason'],
    },
  },
  {
    name: 'request_handoff',
    description:
      'Passa a conversa para um atendente humano e pausa você. Use quando o paciente pedir para falar com alguém, ou quando você não puder resolver.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'Motivo do encaminhamento.' } },
      required: ['reason'],
    },
  },
  {
    name: 'record_lgpd_consent',
    description:
      'Registra a resposta do paciente ao pedido de consentimento de dados de saúde. Chame assim que ele responder ao pedido, com granted=true se aceitou e granted=false se recusou.',
    input_schema: {
      type: 'object',
      properties: { granted: { type: 'boolean' } },
      required: ['granted'],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Implementações
// ---------------------------------------------------------------------------

function localParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  // Algumas versões do ICU devolvem "Mon." — corta no prefixo de 3 letras.
  const weekdayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .indexOf(get('weekday').slice(0, 3));
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: weekdayIdx,
  };
}

async function getPatient(ctx: ToolContext): Promise<ToolResult> {
  const { data: p } = await ctx.admin
    .from('patients')
    .select('id, full_name, funnel_status, status, lgpd_consent, phone_e164')
    .eq('id', ctx.patientId)
    .maybeSingle();
  if (!p) return { ok: false, error: 'Paciente não encontrado.' };

  const { data: s } = await ctx.admin
    .from('surgeries')
    .select('id, date, surgery_type, status, protocol_id')
    .eq('patient_id', ctx.patientId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  let dayNumber: number | null = null;
  if (s?.date) {
    const today = localParts(new Date()).date;
    dayNumber = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${s.date}T00:00:00Z`)) / 86400000,
    );
  }

  return {
    ok: true,
    data: {
      full_name: p.full_name,
      funnel_status: p.funnel_status,
      lgpd_consent: p.lgpd_consent,
      surgery_date: s?.date ?? null,
      surgery_type: s?.surgery_type ?? null,
      // Negativo = dias até a cirurgia; positivo = dias de pós-operatório.
      day_relative_to_surgery: dayNumber,
    },
  };
}

async function searchFaq(ctx: ToolContext, question: string): Promise<ToolResult> {
  const terms = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);

  let query = ctx.admin
    .from('canned_responses')
    .select('title, body')
    .eq('clinic_id', ctx.clinicId)
    .limit(3);

  // Sem termo útil (pergunta só com palavras curtas), devolve os primeiros do
  // FAQ em vez de montar um filtro vazio, que o PostgREST rejeita.
  if (terms.length) {
    query = query.or(terms.map((t) => `title.ilike.%${t}%,body.ilike.%${t}%`).join(','));
  }
  const { data } = await query;

  if (!data || data.length === 0) {
    return { ok: true, data: { found: false, note: 'Sem resposta aprovada. Encaminhe para a equipe; não responda por conta própria.' } };
  }
  return { ok: true, data: { found: true, answers: data } };
}

async function listAvailableSlots(ctx: ToolContext, fromDate: string, toDate: string): Promise<ToolResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return { ok: false, error: 'Datas devem estar em AAAA-MM-DD.' };
  }
  const start = new Date(`${fromDate}T00:00:00-03:00`);
  const end = new Date(`${toDate}T23:59:59-03:00`);
  if (end < start) return { ok: false, error: 'to_date anterior a from_date.' };
  // Teto para não varrer meses inteiros.
  const capped = new Date(Math.min(end.getTime(), start.getTime() + 21 * 86400000));

  const { data: booked } = await ctx.admin
    .from('appointments')
    .select('scheduled_at')
    .eq('clinic_id', ctx.clinicId)
    .gte('scheduled_at', start.toISOString())
    .lte('scheduled_at', capped.toISOString());

  const bookedAt = (booked ?? []).map((a) => new Date(a.scheduled_at).getTime());
  const now = Date.now();
  const slots: string[] = [];
  // Mesma janela de conflito usada por book_appointment, para o agente não
  // oferecer um horário que a confirmação vai recusar em seguida.
  const clashMs = (SLOT_MINUTES - 1) * 60000;

  for (let t = start.getTime(); t <= capped.getTime() && slots.length < 40; t += SLOT_MINUTES * 60000) {
    const d = new Date(t);
    if (d.getTime() <= now) continue;
    const { hour, weekday } = localParts(d);
    if (!WORKDAYS.includes(weekday)) continue;
    if (hour < BUSINESS_START_HOUR || hour >= BUSINESS_END_HOUR) continue;
    if (bookedAt.some((b) => Math.abs(b - t) <= clashMs)) continue;
    slots.push(d.toISOString());
  }

  return { ok: true, data: { slots, timezone: TZ, slot_minutes: SLOT_MINUTES } };
}

async function bookAppointment(
  ctx: ToolContext,
  startsAt: string,
  type: string,
  title?: string,
): Promise<ToolResult> {
  if (type !== 'consultation' && type !== 'return') {
    return { ok: false, error: 'Só consulta ou retorno. Cirurgia é agendada pela equipe.' };
  }
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: 'starts_at inválido.' };
  if (when.getTime() <= Date.now()) return { ok: false, error: 'Horário no passado.' };

  const { hour, weekday } = localParts(when);
  if (!WORKDAYS.includes(weekday) || hour < BUSINESS_START_HOUR || hour >= BUSINESS_END_HOUR) {
    return { ok: false, error: 'Fora do horário de atendimento.' };
  }

  // Revalidação obrigatória (§1.2): o slot pode ter sido ocupado entre a
  // listagem e a confirmação.
  const windowStart = new Date(when.getTime() - (SLOT_MINUTES - 1) * 60000).toISOString();
  const windowEnd = new Date(when.getTime() + (SLOT_MINUTES - 1) * 60000).toISOString();
  const { data: clash } = await ctx.admin
    .from('appointments')
    .select('id')
    .eq('clinic_id', ctx.clinicId)
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd)
    .limit(1);

  if (clash && clash.length > 0) {
    return { ok: false, error: 'Horário ocupado. Ofereça outro de list_available_slots.' };
  }

  const { data: patient } = await ctx.admin
    .from('patients').select('full_name').eq('id', ctx.patientId).maybeSingle();

  const { data: created, error } = await ctx.admin
    .from('appointments')
    .insert({
      clinic_id: ctx.clinicId,
      patient_id: ctx.patientId,
      title: title || (type === 'return' ? 'Retorno' : 'Avaliação') + ` — ${patient?.full_name ?? ''}`.trim(),
      type,
      scheduled_at: when.toISOString(),
    })
    .select('id, scheduled_at')
    .single();

  if (error) return { ok: false, error: 'Não foi possível agendar.' };

  await ctx.admin
    .from('patients')
    .update({ funnel_status: type === 'return' ? 'in_followup' : 'evaluation_scheduled' })
    .eq('id', ctx.patientId);

  return { ok: true, data: { appointment_id: created.id, scheduled_at: created.scheduled_at } };
}

async function setFunnelStatus(ctx: ToolContext, status: string): Promise<ToolResult> {
  const { error } = await ctx.admin
    .from('patients').update({ funnel_status: status }).eq('id', ctx.patientId);
  if (error) return { ok: false, error: 'Status inválido.' };
  return { ok: true, data: { funnel_status: status } };
}

async function recordCheckin(
  ctx: ToolContext,
  // deno-lint-ignore no-explicit-any
  input: any,
): Promise<ToolResult> {
  const { data: surgery } = await ctx.admin
    .from('surgeries')
    .select('id')
    .eq('patient_id', ctx.patientId)
    .eq('status', 'active')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Sem cirurgia ativa não há D+n nem triagem — escala em vez de perder o relato.
  if (!surgery) {
    return raiseAlert(ctx, `Relato de sintoma sem cirurgia ativa: ${input?.notes ?? 'sem detalhe'}`);
  }

  // clinic_id, patient_id e day_number são preenchidos pelo trigger
  // `checkin_set_day_number`; a severidade sai do `checkin_triage`.
  const { data, error } = await ctx.admin
    .from('checkins')
    .insert({
      clinic_id: ctx.clinicId,
      patient_id: ctx.patientId,
      surgery_id: surgery.id,
      pain: typeof input?.pain === 'number' ? input.pain : null,
      fever: !!input?.fever,
      bleeding: !!input?.bleeding,
      swelling: !!input?.swelling,
      redness: !!input?.redness,
      itching: !!input?.itching,
      crusts: !!input?.crusts,
      feeling: input?.feeling ?? null,
      notes: input?.notes ?? null,
    })
    .select('id, day_number')
    .single();

  if (error) return { ok: false, error: 'Não foi possível registrar o check-in.' };

  // O trigger pode ter gerado alerta. Se gerou, a IA sai da conversa (§1.1).
  const { data: alert } = await ctx.admin
    .from('alerts')
    .select('id, severity')
    .eq('checkin_id', data.id)
    .maybeSingle();

  if (alert) {
    await pauseAi(ctx, `Alerta ${alert.severity} gerado por check-in`);
    await notifyStaff(ctx, 'Alerta de check-in', `Paciente relatou sintomas pelo WhatsApp (${alert.severity}).`,
      alert.severity === 'critical' ? 'critical' : 'warning');
    return {
      ok: true,
      data: {
        recorded: true,
        escalated: true,
        instruction:
          'A equipe foi acionada e você está pausado. Envie APENAS uma mensagem curta e tranquilizadora dizendo que a equipe vai retornar. Nenhuma opinião clínica.',
      },
    };
  }

  return { ok: true, data: { recorded: true, escalated: false, day_number: data.day_number } };
}

/**
 * Escalação para humano. A IA NÃO escolhe severidade — julgar gravidade de
 * sintoma é ato clínico (§1.1). 'high' aqui é prioridade de fila, não
 * classificação médica; a severidade clínica só vem do trigger de triagem.
 */
async function raiseAlert(ctx: ToolContext, reason: string): Promise<ToolResult> {
  await ctx.admin.from('alerts').insert({
    clinic_id: ctx.clinicId,
    patient_id: ctx.patientId,
    severity: 'high',
    reason: `[WhatsApp] ${reason}`,
  });
  await pauseAi(ctx, reason);
  await notifyStaff(ctx, 'Alerta pelo WhatsApp', 'Paciente relatou algo que precisa da equipe.', 'critical');
  return {
    ok: true,
    data: {
      escalated: true,
      instruction:
        'Você está pausado nesta conversa. Envie APENAS uma mensagem curta e tranquilizadora dizendo que a equipe já foi avisada e vai retornar. Nenhuma orientação clínica.',
    },
  };
}

async function requestHandoff(ctx: ToolContext, reason: string): Promise<ToolResult> {
  await pauseAi(ctx, reason);
  await notifyStaff(ctx, 'Atendimento humano solicitado', 'Um paciente pediu para falar com a equipe.', 'warning');
  return {
    ok: true,
    data: { handed_off: true, instruction: 'Confirme ao paciente que a equipe vai assumir a conversa. Nada além disso.' },
  };
}

async function recordLgpdConsent(ctx: ToolContext, granted: boolean): Promise<ToolResult> {
  await ctx.admin
    .from('patients')
    .update({ lgpd_consent: granted, lgpd_consent_at: granted ? new Date().toISOString() : null })
    .eq('id', ctx.patientId);

  if (!granted) {
    await pauseAi(ctx, 'Paciente recusou o consentimento LGPD');
    await notifyStaff(ctx, 'Consentimento recusado', 'Paciente não autorizou o uso dos dados de saúde.', 'warning');
  }
  return { ok: true, data: { lgpd_consent: granted } };
}

// --- auxiliares ------------------------------------------------------------

async function pauseAi(ctx: ToolContext, reason: string) {
  await ctx.admin
    .from('conversations')
    .update({ ai_enabled: false, handoff_reason: reason.slice(0, 500) })
    .eq('id', ctx.conversationId);
}

async function notifyStaff(ctx: ToolContext, title: string, description: string, severity: string) {
  await ctx.admin.from('notifications').insert({
    clinic_id: ctx.clinicId,
    patient_id: ctx.patientId,
    type: 'whatsapp_alert',
    title,
    description,
    severity,
  });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
export async function runTool(name: string, input: any, ctx: ToolContext): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_patient':           return await getPatient(ctx);
      case 'search_faq':            return await searchFaq(ctx, String(input?.question ?? ''));
      case 'list_available_slots':  return await listAvailableSlots(ctx, String(input?.from_date), String(input?.to_date));
      case 'book_appointment':      return await bookAppointment(ctx, String(input?.starts_at), String(input?.type), input?.title);
      case 'set_funnel_status':     return await setFunnelStatus(ctx, String(input?.status));
      case 'record_checkin':        return await recordCheckin(ctx, input ?? {});
      case 'raise_alert':           return await raiseAlert(ctx, String(input?.reason ?? 'sem detalhe'));
      case 'request_handoff':       return await requestHandoff(ctx, String(input?.reason ?? 'sem detalhe'));
      case 'record_lgpd_consent':   return await recordLgpdConsent(ctx, Boolean(input?.granted));
      default:                      return { ok: false, error: `Tool desconhecida: ${name}` };
    }
  } catch (e) {
    // Nunca vaza conteúdo do paciente no erro devolvido ao modelo.
    console.error(JSON.stringify({ event: 'tool_error', tool: name, message: String(e) }));
    return { ok: false, error: 'Falha ao executar a operação.' };
  }
}
