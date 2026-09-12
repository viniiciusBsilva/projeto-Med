// Disponibilidade da agenda: guardada em clinics.business_hours e lida pelo
// agente do WhatsApp (wa-webhook, _shared/tools.ts) para oferecer horários.
// O formato é o contrato entre os dois — mudou aqui, muda lá.

export interface TimeInterval {
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
}

export interface BlockedDate {
  date: string; // 'YYYY-MM-DD'
  reason?: string;
}

export interface ClinicAvailability {
  version: 2;
  /** Duração de cada atendimento; é também o passo entre os horários oferecidos. */
  slot_minutes: number;
  /** Chave = dia da semana ('0' = domingo). Lista vazia = não atende. */
  weekly: Record<string, TimeInterval[]>;
  /** Dias inteiros sem atendimento: feriados, folgas, férias. */
  blocked_dates: BlockedDate[];
}

// Semana começando na segunda, como a clínica pensa a agenda.
export const WEEKDAYS = [
  { key: '1', label: 'Segunda' },
  { key: '2', label: 'Terça' },
  { key: '3', label: 'Quarta' },
  { key: '4', label: 'Quinta' },
  { key: '5', label: 'Sexta' },
  { key: '6', label: 'Sábado' },
  { key: '0', label: 'Domingo' },
];

export const SLOT_OPTIONS = [15, 20, 30, 40, 45, 60, 90, 120];

const WORKDAY: TimeInterval[] = [{ start: '09:00', end: '18:00' }];

// Mesmo padrão que o agente usa quando a clínica ainda não configurou nada.
export const DEFAULT_AVAILABILITY: ClinicAvailability = {
  version: 2,
  slot_minutes: 30,
  weekly: { '0': [], '1': WORKDAY, '2': WORKDAY, '3': WORKDAY, '4': WORKDAY, '5': WORKDAY, '6': [] },
  blocked_dates: [],
};

const HHMM = /^\d{2}:\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Aceita o formato atual e o antigo ({ days, start, end, slot_minutes }, em horas cheias). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeAvailability(raw: any): ClinicAvailability {
  if (!raw || typeof raw !== 'object') return clone(DEFAULT_AVAILABILITY);
  const slot = Number(raw.slot_minutes) > 0 ? Number(raw.slot_minutes) : DEFAULT_AVAILABILITY.slot_minutes;

  if (raw.weekly && typeof raw.weekly === 'object') {
    const weekly: Record<string, TimeInterval[]> = {};
    for (const { key } of WEEKDAYS) {
      const list = Array.isArray(raw.weekly[key]) ? raw.weekly[key] : [];
      weekly[key] = list
        .filter((iv: TimeInterval) => HHMM.test(iv?.start) && HHMM.test(iv?.end))
        .map((iv: TimeInterval) => ({ start: iv.start, end: iv.end }));
    }
    const blocked = Array.isArray(raw.blocked_dates) ? raw.blocked_dates : [];
    return {
      version: 2,
      slot_minutes: slot,
      weekly,
      blocked_dates: blocked
        .filter((b: BlockedDate) => ISO_DATE.test(b?.date))
        .map((b: BlockedDate) => (b.reason ? { date: b.date, reason: String(b.reason) } : { date: b.date })),
    };
  }

  if (Array.isArray(raw.days) && typeof raw.start === 'number' && typeof raw.end === 'number') {
    const interval = { start: `${pad2(raw.start)}:00`, end: `${pad2(raw.end)}:00` };
    const weekly: Record<string, TimeInterval[]> = {};
    for (const { key } of WEEKDAYS) weekly[key] = raw.days.includes(Number(key)) ? [interval] : [];
    return { version: 2, slot_minutes: slot, weekly, blocked_dates: [] };
  }

  return clone(DEFAULT_AVAILABILITY);
}

/** O primeiro problema encontrado, em português, ou null se estiver tudo certo. */
export function validateAvailability(a: ClinicAvailability): string | null {
  let anyOpen = false;
  for (const { key, label } of WEEKDAYS) {
    const list = [...(a.weekly[key] ?? [])].sort((x, y) => toMinutes(x.start) - toMinutes(y.start));
    if (list.length) anyOpen = true;
    for (let i = 0; i < list.length; i++) {
      const { start, end } = list[i];
      if (!HHMM.test(start) || !HHMM.test(end)) return `${label}: preencha o início e o fim.`;
      const s = toMinutes(start);
      const e = toMinutes(end);
      if (e <= s) return `${label}: o fim precisa ser depois do início (${start}–${end}).`;
      if (e - s < a.slot_minutes) {
        return `${label}: o intervalo ${start}–${end} é menor que a duração do atendimento.`;
      }
      if (i > 0 && s < toMinutes(list[i - 1].end)) return `${label}: os intervalos se sobrepõem.`;
    }
  }
  if (!anyOpen) return 'Marque pelo menos um dia de atendimento.';
  return null;
}

/** Intervalos em ordem de início — é assim que o agente percorre o dia. */
export function sortIntervals(a: ClinicAvailability): ClinicAvailability {
  const weekly: Record<string, TimeInterval[]> = {};
  for (const [key, list] of Object.entries(a.weekly)) {
    weekly[key] = [...list].sort((x, y) => toMinutes(x.start) - toMinutes(y.start));
  }
  return { ...a, weekly };
}

/** Como o dia aparece na Agenda: "09:00–12:00, 14:00–18:00" ou o motivo de estar fechado. */
export function describeDay(a: ClinicAvailability, date: string): { open: boolean; text: string } {
  const blocked = a.blocked_dates.find((b) => b.date === date);
  if (blocked) {
    return { open: false, text: blocked.reason ? `Sem atendimento — ${blocked.reason}` : 'Sem atendimento (dia bloqueado)' };
  }
  // Meio-dia local: o dia da semana não escorrega por causa do fuso.
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const list = a.weekly[String(weekday)] ?? [];
  if (list.length === 0) return { open: false, text: 'Sem atendimento neste dia da semana' };
  return { open: true, text: `Atendimento: ${list.map((iv) => `${iv.start}–${iv.end}`).join(', ')}` };
}
