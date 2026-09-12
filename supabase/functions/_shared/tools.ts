// Tools do agente (CLAUDE.md §6.3).
//
// Princípio da §1.2: a IA PROPÕE, o código EXECUTA e VALIDA. Nenhuma tool aceita
// da IA um dado que o banco pode determinar sozinho — horário livre vem de
// query, severidade clínica vem do trigger `checkin_triage`.
//
// O que a IA não resolve vira alerta por CÓDIGO (openServiceAlert), não pela boa
// vontade do modelo: no teste de 11/09 ela prometeu "a equipe vai entrar em
// contato" e ninguém foi avisado.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Regras de agenda
// ---------------------------------------------------------------------------
// A disponibilidade vem de `clinics.business_hours`, configurada na Agenda do
// painel (lib/availability.ts do painel — é o mesmo contrato):
//   { "version": 2, "slot_minutes": 30,
//     "weekly": { "1": [{ "start": "09:00", "end": "12:00" }, …], … },   // "0" = domingo
//     "blocked_dates": [{ "date": "2026-12-25", "reason": "Natal" }] }
// O formato antigo { days, start, end, slot_minutes } continua aceito.
// Sem configuração: seg–sex, 9h–18h, 30 min.
const TZ = 'America/Sao_Paulo';
// Sem horário de verão desde 2019: o fuso de Brasília é fixo.
const TZ_OFFSET = '-03:00';
// O modelo oferece 2 ou 3 ao paciente; devolver dezenas só atrapalha.
const MAX_SLOTS = 12;
const SLOTS_PER_DAY = 3;
// Período pedido sem vaga (fim de semana, dia lotado): procura adiante antes de desistir.
const LOOKAHEAD_DAYS = 14;
const WEEKDAYS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Intervalo de atendimento, em minutos desde 00:00. */
type Interval = { start: number; end: number };

type Availability = {
  slotMinutes: number;
  /** Índice = dia da semana (0 = domingo). */
  weekly: Interval[][];
  blocked: Set<string>;
};

const WORKDAY: Interval[] = [{ start: 9 * 60, end: 18 * 60 }];
const DEFAULT_AVAILABILITY: Availability = {
  slotMinutes: 30,
  weekly: [[], WORKDAY, WORKDAY, WORKDAY, WORKDAY, WORKDAY, []],
  blocked: new Set(),
};

/** Alerta de atendimento: o que a IA não resolveu. O clínico ('clinical') é o padrão da tabela. */
export type ServiceAlertKind = 'question' | 'scheduling' | 'handoff' | 'technical' | 'review';

export type ToolContext = {
  admin: SupabaseClient;
  clinicId: string;
  patientId: string;
  conversationId: string;
  /** Vira true quando algo nesta rodada já avisou a equipe (alerta clínico ou de atendimento). */
  flags: { alerted: boolean };
};

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Schemas expostos ao modelo
// ---------------------------------------------------------------------------
export const TOOL_DEFINITIONS = [
  {
    name: 'get_patient',
    description:
      'Busca o dia relativo à cirurgia do paciente (negativo = dias até a cirurgia, positivo = dias de pós-operatório). Nome, etapa do funil e data da cirurgia já estão no contexto: só use esta tool se precisar do dia relativo.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_faq',
    description:
      'Busca uma resposta APROVADA PELO MÉDICO no FAQ da clínica. Use SEMPRE que o paciente fizer uma pergunta sobre o procedimento, cuidados, recuperação, valores ou funcionamento da clínica. Se não encontrar, a equipe é avisada automaticamente — NUNCA responda com conhecimento próprio.',
    input_schema: {
      type: 'object',
      properties: { question: { type: 'string', description: 'A dúvida do paciente, em poucas palavras.' } },
      required: ['question'],
    },
  },
  {
    name: 'list_available_slots',
    description:
      'Lista horários realmente livres na agenda da clínica, em horário de Brasília. É a ÚNICA fonte de horário — nunca invente ou suponha disponibilidade. Busque sempre a partir de hoje (a data de hoje está no contexto). Ofereça ao paciente 2 ou 3 opções usando o campo "label".',
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
      'Agenda uma avaliação (consultation) ou retorno (return) num horário devolvido por list_available_slots. O código revalida se o horário continua livre. Não agenda cirurgia — isso é da equipe.',
    input_schema: {
      type: 'object',
      properties: {
        starts_at: { type: 'string', description: 'Use exatamente o "starts_at" do horário escolhido em list_available_slots.' },
        type: { type: 'string', enum: ['consultation', 'return'], description: 'Avaliação ou retorno.' },
        title: { type: 'string', description: 'Título curto do compromisso.' },
      },
      required: ['starts_at', 'type'],
    },
  },
  {
    name: 'list_my_appointments',
    description:
      'Lista os próximos agendamentos do paciente desta conversa. Use antes de remarcar ou cancelar, ou quando ele perguntar quando é a consulta dele.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'reschedule_appointment',
    description:
      'Remarca uma avaliação ou retorno do paciente para um novo horário devolvido por list_available_slots.',
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string', description: 'O appointment_id devolvido por list_my_appointments.' },
        new_starts_at: { type: 'string', description: 'O "starts_at" do novo horário, de list_available_slots.' },
      },
      required: ['appointment_id', 'new_starts_at'],
    },
  },
  {
    name: 'cancel_appointment',
    description:
      'Cancela uma avaliação ou retorno do paciente. Confirme com o paciente antes de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string', description: 'O appointment_id devolvido por list_my_appointments.' },
      },
      required: ['appointment_id'],
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
      'Passa a conversa para um atendente humano e pausa você. Use quando o paciente pedir para falar com alguém, reclamar do atendimento, ou quando você não puder resolver. Obrigatório antes de dizer que a equipe vai entrar em contato.',
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
// Datas no fuso da clínica
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

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "seg 14/09 09:00" — é o texto que o modelo repete ao paciente. */
function slotLabel(d: Date): string {
  const p = localParts(d);
  const [, mm, dd] = p.date.split('-');
  return `${WEEKDAYS_PT[p.weekday] ?? ''} ${dd}/${mm} ${pad2(p.hour)}:${pad2(p.minute)}`.trim();
}

/**
 * ISO no fuso da clínica (2026-09-14T09:00:00-03:00). Devolver em UTC
 * ("…T12:00:00Z") obrigava o modelo a converter — e ele oferecia hora errada.
 */
function localIso(d: Date): string {
  const p = localParts(d);
  return `${p.date}T${pad2(p.hour)}:${pad2(p.minute)}:00${TZ_OFFSET}`;
}

function typeLabel(type: string): string {
  return type === 'return' ? 'retorno' : type === 'surgery' ? 'cirurgia' : 'avaliação';
}

function hhmmToMinutes(v: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? ''));
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]);
  return total >= 0 && total <= 24 * 60 ? total : null;
}

async function loadAvailability(ctx: ToolContext): Promise<Availability> {
  const { data } = await ctx.admin
    .from('clinics').select('business_hours').eq('id', ctx.clinicId).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const raw = data?.business_hours as any;
  if (!raw || typeof raw !== 'object') return DEFAULT_AVAILABILITY;
  const slotMinutes = Number(raw.slot_minutes) > 0 ? Number(raw.slot_minutes) : DEFAULT_AVAILABILITY.slotMinutes;

  if (raw.weekly && typeof raw.weekly === 'object') {
    const weekly: Interval[][] = [0, 1, 2, 3, 4, 5, 6].map((day) => {
      const list: Array<{ start?: string; end?: string }> = Array.isArray(raw.weekly[String(day)])
        ? raw.weekly[String(day)]
        : [];
      const out: Interval[] = [];
      for (const iv of list) {
        const start = hhmmToMinutes(iv?.start);
        const end = hhmmToMinutes(iv?.end);
        if (start !== null && end !== null && start < end) out.push({ start, end });
      }
      return out.sort((x, y) => x.start - y.start);
    });
    const blocked = new Set<string>();
    for (const b of Array.isArray(raw.blocked_dates) ? raw.blocked_dates : []) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(b?.date ?? ''))) blocked.add(String(b.date));
    }
    return { slotMinutes, weekly, blocked };
  }

  // Formato antigo: o mesmo horário (em horas cheias) para todos os dias listados.
  if (Array.isArray(raw.days) && typeof raw.start === 'number' && typeof raw.end === 'number') {
    const iv: Interval = { start: raw.start * 60, end: raw.end * 60 };
    return {
      slotMinutes,
      weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => (raw.days.includes(day) ? [iv] : [])),
      blocked: new Set(),
    };
  }
  return DEFAULT_AVAILABILITY;
}

/** O atendimento inteiro (início + duração) cabe num intervalo de um dia sem bloqueio. */
function isBookable(d: Date, a: Availability): boolean {
  const p = localParts(d);
  if (a.blocked.has(p.date)) return false;
  const m = p.hour * 60 + p.minute;
  return (a.weekly[p.weekday] ?? []).some((iv) => m >= iv.start && m + a.slotMinutes <= iv.end);
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Horários livres de fromDate a toDate (datas da clínica, inclusive): percorre
 * cada intervalo de atendimento em passos da duração, sem passado, sem dia
 * bloqueado e sem conflito com a agenda.
 */
async function findFreeSlots(ctx: ToolContext, a: Availability, fromDate: string, toDate: string): Promise<Date[]> {
  const { data: booked } = await ctx.admin
    .from('appointments')
    .select('scheduled_at')
    .eq('clinic_id', ctx.clinicId)
    .gte('scheduled_at', new Date(`${fromDate}T00:00:00${TZ_OFFSET}`).toISOString())
    .lte('scheduled_at', new Date(`${toDate}T23:59:59${TZ_OFFSET}`).toISOString());

  const bookedAt = (booked ?? []).map((b) => new Date(b.scheduled_at).getTime());
  // Mesma janela de conflito usada ao agendar, para o agente não oferecer um
  // horário que a confirmação vai recusar em seguida.
  const clashMs = (a.slotMinutes - 1) * 60000;
  const now = Date.now();
  const out: Date[] = [];
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    if (a.blocked.has(date)) continue;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const iv of a.weekly[weekday] ?? []) {
      for (let m = iv.start; m + a.slotMinutes <= iv.end; m += a.slotMinutes) {
        const d = new Date(`${date}T${pad2(Math.floor(m / 60))}:${pad2(m % 60)}:00${TZ_OFFSET}`);
        const t = d.getTime();
        if (t <= now) continue;
        if (bookedAt.some((b) => Math.abs(b - t) <= clashMs)) continue;
        out.push(d);
      }
    }
  }
  return out.sort((x, y) => x.getTime() - y.getTime());
}

/** Até SLOTS_PER_DAY por dia (começo, meio e fim do expediente), no máximo MAX_SLOTS. */
function spreadSlots(slots: Date[]): Date[] {
  const byDay = new Map<string, Date[]>();
  for (const s of slots) {
    const key = localParts(s).date;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  const out: Date[] = [];
  for (const day of byDay.values()) {
    const picks = day.length <= SLOTS_PER_DAY
      ? day
      : [day[0], day[Math.floor(day.length / 2)], day[day.length - 1]];
    for (const p of picks) {
      if (out.length >= MAX_SLOTS) return out;
      out.push(p);
    }
  }
  return out;
}

async function hasClash(ctx: ToolContext, a: Availability, when: Date, ignoreId?: string): Promise<boolean> {
  const windowMs = (a.slotMinutes - 1) * 60000;
  let q = ctx.admin
    .from('appointments')
    .select('id')
    .eq('clinic_id', ctx.clinicId)
    .gte('scheduled_at', new Date(when.getTime() - windowMs).toISOString())
    .lte('scheduled_at', new Date(when.getTime() + windowMs).toISOString())
    .limit(1);
  if (ignoreId) q = q.neq('id', ignoreId);
  const { data } = await q;
  return Boolean(data && data.length > 0);
}

/** O médico da agenda quando a clínica tem um só ativo. Com vários, a equipe escolhe. */
async function soleActiveDoctor(ctx: ToolContext): Promise<{ id: string; full_name: string } | null> {
  const { data } = await ctx.admin
    .from('doctors').select('id, full_name').eq('clinic_id', ctx.clinicId).eq('active', true).limit(2);
  return data && data.length === 1 ? data[0] : null;
}

/** Agendamento futuro do próprio paciente — a IA não mexe no de outra pessoa. */
async function ownFutureAppointment(ctx: ToolContext, id: string) {
  const { data } = await ctx.admin
    .from('appointments')
    .select('id, type, title, scheduled_at')
    .eq('id', id)
    .eq('patient_id', ctx.patientId)
    .gte('scheduled_at', new Date().toISOString())
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Implementações
// ---------------------------------------------------------------------------

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
    await openServiceAlert(ctx, 'question', `Dúvida sem resposta aprovada: "${question.trim().slice(0, 200)}"`);
    return {
      ok: true,
      data: {
        found: false,
        note:
          'Não há resposta aprovada. A equipe JÁ FOI AVISADA desta dúvida. Diga ao paciente, com naturalidade, que vai confirmar com a equipe e que eles respondem por aqui. Não responda por conta própria e continue ajudando no que puder.',
      },
    };
  }
  return { ok: true, data: { found: true, answers: data } };
}

async function listAvailableSlots(ctx: ToolContext, fromDate: string, toDate: string): Promise<ToolResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return { ok: false, error: 'Datas devem estar em AAAA-MM-DD.' };
  }
  const today = localParts(new Date()).date;
  // Sem saber a data, o modelo chegou a buscar o passado e concluir "sem horários".
  if (toDate < today) {
    return { ok: false, error: `O período ${fromDate} a ${toDate} já passou. Hoje é ${today}: busque a partir de hoje.` };
  }
  const from = fromDate < today ? today : fromDate;
  if (toDate < from) return { ok: false, error: 'to_date anterior a from_date.' };
  // Teto para não varrer meses inteiros.
  const to = toDate > addDays(from, 21) ? addDays(from, 21) : toDate;

  const a = await loadAvailability(ctx);
  let free = await findFreeSlots(ctx, a, from, to);
  let note: string | undefined;

  if (free.length === 0) {
    // Lista vazia fazia a IA desistir; procura os próximos antes.
    free = await findFreeSlots(ctx, a, addDays(to, 1), addDays(to, LOOKAHEAD_DAYS));
    if (free.length) note = 'Não há horário livre no período pedido. Estes são os próximos disponíveis.';
  }

  if (free.length === 0) {
    await openServiceAlert(ctx, 'scheduling', `Agenda sem horário livre para o paciente a partir de ${from}.`);
    return {
      ok: true,
      data: {
        slots: [],
        note:
          'Agenda sem horário livre nas próximas semanas. A equipe JÁ FOI AVISADA e vai propor uma data; diga isso ao paciente com naturalidade.',
      },
    };
  }

  return {
    ok: true,
    data: {
      today,
      timezone: 'horário de Brasília',
      slot_minutes: a.slotMinutes,
      ...(note ? { note } : {}),
      slots: spreadSlots(free).map((d) => ({ label: slotLabel(d), starts_at: localIso(d) })),
    },
  };
}

async function bookAppointment(
  ctx: ToolContext,
  startsAt: string,
  type: string,
  title?: string,
): Promise<ToolResult> {
  if (type !== 'consultation' && type !== 'return') {
    return { ok: false, error: 'Só avaliação ou retorno. Cirurgia é agendada pela equipe.' };
  }
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: 'starts_at inválido.' };
  if (when.getTime() <= Date.now()) return { ok: false, error: 'Horário no passado.' };

  const a = await loadAvailability(ctx);
  if (!isBookable(when, a)) {
    return { ok: false, error: 'Fora do horário de atendimento ou dia sem atendimento. Ofereça um horário de list_available_slots.' };
  }

  // Remarcar, não duplicar: o painel já tinha 6 agendamentos repetidos de teste.
  const { data: existing } = await ctx.admin
    .from('appointments')
    .select('id, scheduled_at')
    .eq('patient_id', ctx.patientId)
    .eq('type', type)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: `O paciente já tem ${typeLabel(type)} marcada para ${slotLabel(new Date(existing.scheduled_at))} (appointment_id ${existing.id}). Ofereça remarcar com reschedule_appointment em vez de marcar outra.`,
    };
  }

  // Revalidação obrigatória (§1.2): o slot pode ter sido ocupado entre a
  // listagem e a confirmação.
  if (await hasClash(ctx, a, when)) {
    return { ok: false, error: 'Horário ocupado. Ofereça outro de list_available_slots.' };
  }

  const [{ data: patient }, doctor] = await Promise.all([
    ctx.admin.from('patients').select('full_name').eq('id', ctx.patientId).maybeSingle(),
    soleActiveDoctor(ctx),
  ]);

  const { data: created, error } = await ctx.admin
    .from('appointments')
    .insert({
      clinic_id: ctx.clinicId,
      patient_id: ctx.patientId,
      doctor_id: doctor?.id ?? null,
      professional: doctor?.full_name ?? null,
      title: title || `${type === 'return' ? 'Retorno' : 'Avaliação'} — ${patient?.full_name ?? ''}`.trim(),
      type,
      scheduled_at: when.toISOString(),
    })
    .select('id, scheduled_at')
    .single();

  if (error) {
    await openServiceAlert(ctx, 'scheduling', `Falha ao gravar ${typeLabel(type)} para ${slotLabel(when)}.`);
    return { ok: false, error: 'Não foi possível agendar. A equipe já foi avisada e vai confirmar o horário.' };
  }

  // Contato → paciente: o funil avança no trigger trg_appt_promote_funnel, que
  // vale também para agendamentos feitos pelo painel.

  return {
    ok: true,
    data: { appointment_id: created.id, when: slotLabel(when), professional: doctor?.full_name ?? null },
  };
}

async function listMyAppointments(ctx: ToolContext): Promise<ToolResult> {
  const { data } = await ctx.admin
    .from('appointments')
    .select('id, type, title, scheduled_at, professional')
    .eq('patient_id', ctx.patientId)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(5);
  return {
    ok: true,
    data: {
      appointments: (data ?? []).map((a) => ({
        appointment_id: a.id,
        type: typeLabel(a.type),
        when: slotLabel(new Date(a.scheduled_at)),
        professional: a.professional ?? null,
      })),
    },
  };
}

async function rescheduleAppointment(ctx: ToolContext, id: string, newStartsAt: string): Promise<ToolResult> {
  const appt = await ownFutureAppointment(ctx, id);
  if (!appt) return { ok: false, error: 'Agendamento não encontrado entre os próximos do paciente.' };
  if (appt.type !== 'consultation' && appt.type !== 'return') {
    return { ok: false, error: 'Só avaliação ou retorno podem ser remarcados por aqui. Cirurgia é com a equipe.' };
  }
  const when = new Date(newStartsAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: 'new_starts_at inválido.' };
  if (when.getTime() <= Date.now()) return { ok: false, error: 'Horário no passado.' };

  const a = await loadAvailability(ctx);
  if (!isBookable(when, a)) {
    return { ok: false, error: 'Fora do horário de atendimento ou dia sem atendimento. Ofereça um horário de list_available_slots.' };
  }
  if (await hasClash(ctx, a, when, appt.id)) {
    return { ok: false, error: 'Horário ocupado. Ofereça outro de list_available_slots.' };
  }

  const { error } = await ctx.admin
    .from('appointments').update({ scheduled_at: when.toISOString() }).eq('id', appt.id);
  if (error) {
    await openServiceAlert(ctx, 'scheduling', `Falha ao remarcar ${typeLabel(appt.type)} para ${slotLabel(when)}.`);
    return { ok: false, error: 'Não foi possível remarcar. A equipe já foi avisada.' };
  }
  return { ok: true, data: { appointment_id: appt.id, when: slotLabel(when) } };
}

async function cancelAppointment(ctx: ToolContext, id: string): Promise<ToolResult> {
  const appt = await ownFutureAppointment(ctx, id);
  if (!appt) return { ok: false, error: 'Agendamento não encontrado entre os próximos do paciente.' };
  if (appt.type !== 'consultation' && appt.type !== 'return') {
    return { ok: false, error: 'Só avaliação ou retorno podem ser cancelados por aqui. Cirurgia é com a equipe.' };
  }

  const { error } = await ctx.admin.from('appointments').delete().eq('id', appt.id);
  if (error) {
    await openServiceAlert(ctx, 'scheduling', `Paciente pediu para cancelar ${typeLabel(appt.type)} de ${slotLabel(new Date(appt.scheduled_at))} e a exclusão falhou.`);
    return { ok: false, error: 'Não foi possível cancelar. A equipe já foi avisada.' };
  }
  // A vaga abriu e o paciente talvez precise de contato para remarcar.
  await notifyStaff(
    ctx,
    'Agendamento cancelado pelo paciente',
    `${typeLabel(appt.type)} de ${slotLabel(new Date(appt.scheduled_at))} cancelada pelo WhatsApp.`,
    'warning',
  );
  return { ok: true, data: { cancelled: true, when: slotLabel(new Date(appt.scheduled_at)) } };
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
    ctx.flags.alerted = true;
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
 * Escalação clínica para humano. A IA NÃO escolhe severidade — julgar gravidade
 * de sintoma é ato clínico (§1.1). 'high' aqui é prioridade de fila, não
 * classificação médica; a severidade clínica só vem do trigger de triagem.
 */
async function raiseAlert(ctx: ToolContext, reason: string): Promise<ToolResult> {
  ctx.flags.alerted = true;
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
  await openServiceAlert(ctx, 'handoff', `Paciente aguarda atendimento humano: ${reason.slice(0, 200)}`, 'high');
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

// --- alertas e avisos à equipe --------------------------------------------

const SERVICE_ALERT_TITLE: Record<ServiceAlertKind, string> = {
  question: 'Dúvida sem resposta',
  scheduling: 'Problema no agendamento',
  handoff: 'Paciente aguarda a equipe',
  technical: 'Falha no assistente',
  review: 'Arquivo do paciente para o médico',
};

/**
 * Alerta de atendimento: algo que a IA não resolveu e alguém da equipe precisa
 * ver. Um aberto por paciente e tipo — um segundo caso do mesmo tipo entra no
 * mesmo alerta, em vez de encher a fila. Não é clínico: não pesa no risco do
 * paciente (ver `patient_overview`).
 */
export async function openServiceAlert(
  ctx: ToolContext,
  kind: ServiceAlertKind,
  reason: string,
  severity: 'medium' | 'high' = 'medium',
) {
  ctx.flags.alerted = true;
  const line = reason.slice(0, 300);

  const { data: open } = await ctx.admin
    .from('alerts')
    .select('id, reason')
    .eq('patient_id', ctx.patientId)
    .eq('kind', kind)
    .eq('status', 'open')
    .maybeSingle();

  if (open) {
    if (!String(open.reason).includes(line)) {
      await ctx.admin.from('alerts').update({ reason: `${open.reason}\n${line}`.slice(-1500) }).eq('id', open.id);
    }
    return;
  }

  const { error } = await ctx.admin.from('alerts').insert({
    clinic_id: ctx.clinicId,
    patient_id: ctx.patientId,
    kind,
    severity,
    reason: line,
  });
  // 23505: outra execução abriu o mesmo alerta no meio do caminho — já está na fila.
  if (error) {
    if (error.code !== '23505') {
      console.error(JSON.stringify({ event: 'service_alert_failed', kind, code: error.code ?? null }));
    }
    return;
  }
  await notifyStaff(
    ctx,
    SERVICE_ALERT_TITLE[kind],
    'Abra a fila de Alertas para ver o que o paciente precisa.',
    severity === 'high' ? 'critical' : 'warning',
  );
}

async function pauseAi(ctx: ToolContext, reason: string) {
  await ctx.admin
    .from('conversations')
    .update({ ai_enabled: false, handoff_reason: reason.slice(0, 500) })
    .eq('id', ctx.conversationId);
}

// Tipo 'whatsapp_alert' é da equipe: o push e a leitura pelo app do paciente
// ignoram esse tipo (migration de 11/09).
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
      case 'get_patient':             return await getPatient(ctx);
      case 'search_faq':              return await searchFaq(ctx, String(input?.question ?? ''));
      case 'list_available_slots':    return await listAvailableSlots(ctx, String(input?.from_date), String(input?.to_date));
      case 'book_appointment':        return await bookAppointment(ctx, String(input?.starts_at), String(input?.type), input?.title);
      case 'list_my_appointments':    return await listMyAppointments(ctx);
      case 'reschedule_appointment':  return await rescheduleAppointment(ctx, String(input?.appointment_id), String(input?.new_starts_at));
      case 'cancel_appointment':      return await cancelAppointment(ctx, String(input?.appointment_id));
      case 'set_funnel_status':       return await setFunnelStatus(ctx, String(input?.status));
      case 'record_checkin':          return await recordCheckin(ctx, input ?? {});
      case 'raise_alert':             return await raiseAlert(ctx, String(input?.reason ?? 'sem detalhe'));
      case 'request_handoff':         return await requestHandoff(ctx, String(input?.reason ?? 'sem detalhe'));
      case 'record_lgpd_consent':     return await recordLgpdConsent(ctx, Boolean(input?.granted));
      default:                        return { ok: false, error: `Tool desconhecida: ${name}` };
    }
  } catch (e) {
    // Nunca vaza conteúdo do paciente no erro devolvido ao modelo.
    console.error(JSON.stringify({ event: 'tool_error', tool: name, message: String(e) }));
    return { ok: false, error: 'Falha ao executar a operação.' };
  }
}
