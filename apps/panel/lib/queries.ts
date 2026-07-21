// Camada de dados do painel. Usa o client Supabase do browser (a sessão vem do cookie,
// então a RLS aplica o isolamento por clínica). Mapeia linhas do banco para lib/types.ts.
import { createClient } from '@/lib/supabase/client';
import type {
  Patient,
  Protocol,
  TimelineStep,
  Message,
  Notification,
  CalendarEvent,
  User,
  CannedResponse,
  ClinicInfo,
  DashboardMetrics,
  PatientStatus,
  RiskLevel,
} from '@/lib/types';

// ---------- helpers ----------
export function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h atrás`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 dia atrás' : `${d} dias atrás`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function mapStatus(patientStatus: string, openAlerts: number): PatientStatus {
  if (patientStatus === 'finished') return 'completed';
  if (openAlerts > 0) return 'alert';
  return 'active';
}

function mapRisk(maxSeverity: number | null): RiskLevel {
  if (!maxSeverity) return 'low';
  if (maxSeverity >= 2) return 'high';
  return 'medium';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function overviewToPatient(r: any): Patient {
  return {
    id: r.id,
    name: r.full_name ?? '',
    cpf: r.cpf ?? '',
    birthDate: r.birth_date ?? '',
    phone: r.phone ?? '',
    whatsapp: r.phone ?? '',
    email: r.email ?? '',
    address: '',
    photo: r.photo_url ?? '',
    surgeryType: r.surgery_type ?? '—',
    surgeryDate: r.surgery_date ?? '',
    hospital: r.hospital ?? '',
    doctor: r.surgeon ?? '',
    team: '',
    notes: r.notes ?? '',
    status: mapStatus(r.patient_status ?? 'active', Number(r.open_alerts ?? 0)),
    risk: mapRisk(r.max_open_severity != null ? Number(r.max_open_severity) : null),
    currentDay: r.current_day != null ? Number(r.current_day) : 0,
    protocolId: r.protocol_id ?? '',
    lastUpdate: relativeTime(r.last_activity),
  };
}

// ---------- pacientes ----------
export async function getPatients(): Promise<Patient[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('patient_overview')
    .select('*')
    .order('last_activity', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(overviewToPatient);
}

export async function getPatient(id: string): Promise<Patient | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from('patient_overview').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? overviewToPatient(data) : null;
}

// Timeline do paciente: passos do protocolo + check-ins reais
export async function getPatientTimeline(patientId: string): Promise<TimelineStep[]> {
  const supabase = createClient();
  const { data: checkins, error } = await supabase
    .from('checkins')
    .select('day_number, pain, fever, bleeding, swelling, feeling, notes, created_at')
    .eq('patient_id', patientId)
    .order('day_number', { ascending: true });
  if (error) throw error;

  return (checkins ?? []).map((c: any) => {
    const alerts: string[] = [];
    if (c.fever) alerts.push('Febre relatada');
    if (c.bleeding) alerts.push('Sangramento relatado');
    if (c.pain != null && c.pain >= 8) alerts.push(`Dor intensa (nível ${c.pain})`);
    return {
      day: Number(c.day_number ?? 0),
      status: 'completed' as const,
      title: `Check-in do D+${c.day_number ?? 0}`,
      questionnaire: [
        { question: 'Dor (0-10)', answer: c.pain != null ? String(c.pain) : 'não informado' },
        { question: 'Febre', answer: c.fever ? 'Sim' : 'Não' },
        { question: 'Sangramento', answer: c.bleeding ? 'Sim' : 'Não' },
        { question: 'Inchaço', answer: c.swelling ? 'Sim' : 'Não' },
        { question: 'Como se sente', answer: c.feeling ?? '—' },
      ],
      observations: c.notes ?? undefined,
      alerts: alerts.length ? alerts : undefined,
      date: c.created_at,
    };
  });
}

export interface NewPatientInput {
  fullName: string;
  cpf?: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  notes?: string;
  protocolId?: string;
  surgeryType?: string;
  surgeryDate?: string;
  hospital?: string;
  surgeon?: string;
}

export async function createPatient(input: NewPatientInput): Promise<string> {
  const supabase = createClient();
  const { data: prof } = await supabase.from('profiles').select('clinic_id').maybeSingle();
  const clinicId = (prof as any)?.clinic_id;
  if (!clinicId) throw new Error('Clínica do usuário não encontrada.');

  const { data: patient, error } = await supabase
    .from('patients')
    .insert({
      clinic_id: clinicId,
      full_name: input.fullName,
      cpf: input.cpf || null,
      birth_date: input.birthDate || null,
      phone: input.phone || null,
      email: input.email || null,
      notes: input.notes || null,
    } as any)
    .select('id')
    .single();
  if (error) throw error;
  const patientId = (patient as any).id as string;

  if (input.surgeryDate && (input.surgeryType || input.protocolId)) {
    const { error: sErr } = await supabase.from('surgeries').insert({
      clinic_id: clinicId,
      patient_id: patientId,
      protocol_id: input.protocolId || null,
      surgery_type: input.surgeryType || 'Cirurgia',
      date: input.surgeryDate,
      hospital: input.hospital || null,
      surgeon: input.surgeon || null,
      status: 'active',
    } as any);
    if (sErr) throw sErr;
  }
  return patientId;
}

// ---------- protocolos ----------
export async function getProtocols(): Promise<Protocol[]> {
  const supabase = createClient();
  const [protocols, surgeries, steps] = await Promise.all([
    supabase.from('protocols').select('*').order('name'),
    supabase.from('surgeries').select('protocol_id, patient_id'),
    supabase.from('protocol_steps').select('protocol_id, day_offset'),
  ]);
  if (protocols.error) throw protocols.error;

  // contagem de pacientes por protocolo (via cirurgias)
  const counts = new Map<string, Set<string>>();
  (surgeries.data ?? []).forEach((s: any) => {
    if (!s.protocol_id) return;
    if (!counts.has(s.protocol_id)) counts.set(s.protocol_id, new Set());
    counts.get(s.protocol_id)!.add(s.patient_id);
  });

  // dias de acompanhamento (D+n) por protocolo
  const daysByProtocol = new Map<string, number[]>();
  (steps.data ?? []).forEach((s: any) => {
    if (!daysByProtocol.has(s.protocol_id)) daysByProtocol.set(s.protocol_id, []);
    daysByProtocol.get(s.protocol_id)!.push(Number(s.day_offset));
  });

  return (protocols.data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    category: p.specialty ?? '—',
    duration: Number(p.duration_days ?? 0),
    color: p.color ?? '#2563EB',
    patientCount: counts.get(p.id)?.size ?? 0,
    days: (daysByProtocol.get(p.id) ?? []).sort((a, b) => a - b),
    // Campos do editor de protocolos (fase 2) — ainda não modelados no banco.
    questions: [],
    medications: [],
    alerts: [],
    care: [],
    requiredPhotos: [],
    hasVideo: false,
    hasFiles: false,
  }));
}

// ---------- dashboard ----------
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = createClient();
  const [overview, appts, msgs] = await Promise.all([
    supabase.from('patient_overview').select('patient_status, open_alerts'),
    supabase.from('appointments').select('scheduled_at'),
    supabase.from('messages').select('sender, read'),
  ]);

  const rows = (overview.data ?? []) as any[];
  const today = new Date().toISOString().slice(0, 10);

  return {
    activePatients: rows.filter((r) => r.patient_status === 'active').length,
    alertPatients: rows.filter((r) => Number(r.open_alerts ?? 0) > 0).length,
    finishedPatients: rows.filter((r) => r.patient_status === 'finished').length,
    todayAppointments: (appts.data ?? []).filter((a: any) => String(a.scheduled_at).slice(0, 10) === today).length,
    pendingMessages: (msgs.data ?? []).filter((m: any) => m.sender === 'patient' && !m.read).length,
  };
}

// Atividade semanal (últimos 7 dias): check-ins, alertas e mensagens por dia
export async function getWeeklyActivity(): Promise<{ day: string; pacientes: number; alertas: number; mensagens: number }[]> {
  const supabase = createClient();
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const sinceIso = since.toISOString();

  const [checkins, alerts, messages] = await Promise.all([
    supabase.from('checkins').select('created_at').gte('created_at', sinceIso),
    supabase.from('alerts').select('created_at').gte('created_at', sinceIso),
    supabase.from('messages').select('created_at').gte('created_at', sinceIso),
  ]);

  const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const days: { day: string; pacientes: number; alertas: number; mensagens: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = (rows: any[] | null | undefined) =>
      (rows ?? []).filter((r) => String(r.created_at).slice(0, 10) === key).length;
    days.push({
      day: labels[d.getDay()],
      pacientes: count(checkins.data),
      alertas: count(alerts.data),
      mensagens: count(messages.data),
    });
  }
  return days;
}

export async function getUpcomingAppointments(limit = 5): Promise<CalendarEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('appointments')
    .select('*, patients(full_name)')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(apptToEvent);
}

// ---------- agenda ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function apptToEvent(a: any): CalendarEvent {
  return {
    id: a.id,
    title: a.title,
    date: String(a.scheduled_at).slice(0, 10),
    time: timeOf(a.scheduled_at),
    type: a.type,
    doctor: a.professional ?? '',
    patientName: a.patients?.full_name ?? '',
  };
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('appointments')
    .select('*, patients(full_name)')
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(apptToEvent);
}

// ---------- mensagens ----------
export async function getMessages(): Promise<Message[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id,
    patientId: m.patient_id,
    sender: m.sender === 'staff' ? 'doctor' : 'patient',
    text: m.body,
    time: timeOf(m.created_at),
    type: 'text',
    read: m.read,
  }));
}

export async function sendMessage(patientId: string, body: string): Promise<void> {
  const supabase = createClient();
  const { data: prof } = await supabase.from('profiles').select('clinic_id').maybeSingle();
  const clinicId = (prof as any)?.clinic_id;
  const { error } = await supabase
    .from('messages')
    .insert({ patient_id: patientId, clinic_id: clinicId, sender: 'staff', body, read: true } as any);
  if (error) throw error;
}

// ---------- notificações ----------
export async function getNotifications(): Promise<Notification[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('*, patients(full_name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((n: any) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    description: n.description ?? '',
    patientName: n.patients?.full_name ?? '',
    time: relativeTime(n.created_at),
    severity: n.severity,
    read: n.read,
  }));
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('notifications').update({ read: true } as any).eq('id', id);
  if (error) throw error;
}

// ---------- equipe (configurações) ----------
export async function getTeam(): Promise<User[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('profiles').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.full_name ?? '—',
    email: '',
    role: p.role === 'staff' ? 'Equipe' : 'Paciente',
    active: true,
    lastAccess: relativeTime(p.created_at),
  }));
}

export async function getCannedResponses(): Promise<CannedResponse[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('canned_responses').select('*').order('title');
  if (error) throw error;
  return (data ?? []).map((c: any) => ({ id: c.id, title: c.title, body: c.body }));
}

// ---------- relatórios ----------
export async function getReportStats(): Promise<{
  totalPatients: number;
  avgRecoveryDays: number;
  alertsCount: number;
  protocolsCount: number;
}> {
  const supabase = createClient();
  const [patients, alerts, protocols] = await Promise.all([
    supabase.from('patients').select('id', { count: 'exact', head: true }),
    supabase.from('alerts').select('id', { count: 'exact', head: true }),
    supabase.from('protocols').select('duration_days'),
  ]);
  const durations = (protocols.data ?? []).map((p: any) => Number(p.duration_days ?? 0));
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  return {
    totalPatients: patients.count ?? 0,
    avgRecoveryDays: avg,
    alertsCount: alerts.count ?? 0,
    protocolsCount: durations.length,
  };
}

export async function getClinicInfo(): Promise<ClinicInfo | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from('clinics').select('*').maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const c = data as any;
  const { count } = await supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');
  return {
    id: c.id,
    name: c.name,
    plan: c.plan,
    activePatientLimit: c.active_patient_limit,
    activePatients: count ?? 0,
  };
}
