// Camada de dados do painel. Usa o client Supabase do browser (a sessão vem do cookie,
// então a RLS aplica o isolamento por clínica). Mapeia linhas do banco para lib/types.ts.
import { createClient } from '@/lib/supabase/client';
import type {
  Patient,
  Protocol,
  TimelineStep,
  Message,
  Conversation,
  ProtocolStep,
  DispatchSummary,
  AlertItem,
  Notification,
  CalendarEvent,
  User,
  CannedResponse,
  ClinicInfo,
  DashboardMetrics,
  PatientStatus,
  RiskLevel,
  Doctor,
} from '@/lib/types';

// ---------- helpers ----------
// clinic_id do usuário logado. Filtra pelo próprio id: a RLS de profiles deixa o
// staff enxergar todos os perfis da clínica, então sem o filtro o .maybeSingle()
// recebe várias linhas e falha (retornando null como se não houvesse clínica).
async function currentClinicId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', auth.user.id)
    .maybeSingle();
  return (data as any)?.clinic_id ?? null;
}

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

// Data local no formato YYYY-MM-DD. Usa o mesmo fuso de timeOf (local), evitando o
// off-by-one de fatiar o UTC direto do timestamp (ex.: 22:00 BRT virava o dia seguinte).
function dateOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    clinicId: r.clinic_id ?? '',
  };
}

// ---------- pacientes ----------
// `patient_overview` roda subconsultas correlacionadas por linha (alertas abertos,
// severidade, última atividade). Com o WhatsApp criando um paciente por número
// novo, a tabela cresce rápido — daí o teto.
const PATIENTS_PAGE = 200;

export async function getPatients(): Promise<Patient[]> {
  const supabase = createClient();
  const [{ data, error }, { data: clinics }] = await Promise.all([
    supabase
      .from('patient_overview')
      .select('*')
      .order('last_activity', { ascending: false })
      .limit(PATIENTS_PAGE),
    supabase.from('clinics').select('id, name'),
  ]);
  if (error) throw error;
  // Nome da clínica (usado pelo admin geral, que vê pacientes de várias clínicas).
  const clinicName = new Map<string, string>((clinics ?? []).map((c: any) => [c.id, c.name]));
  return (data ?? []).map((r: any) => {
    const p = overviewToPatient(r);
    p.clinicName = p.clinicId ? clinicName.get(p.clinicId) : undefined;
    return p;
  });
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
    .select('day_number, pain, fever, bleeding, swelling, redness, itching, crusts, feeling, notes, created_at')
    .eq('patient_id', patientId)
    .order('day_number', { ascending: true });
  if (error) throw error;

  return (checkins ?? []).map((c: any) => {
    const alerts: string[] = [];
    if (c.fever) alerts.push('Febre relatada');
    if (c.bleeding) alerts.push('Sangramento no couro');
    if (c.redness) alerts.push('Vermelhidão no couro');
    if (c.pain != null && c.pain >= 8) alerts.push(`Dor intensa (nível ${c.pain})`);
    return {
      day: Number(c.day_number ?? 0),
      status: 'completed' as const,
      title: `Check-in do D+${c.day_number ?? 0}`,
      questionnaire: [
        { question: 'Dor (0-10)', answer: c.pain != null ? String(c.pain) : 'não informado' },
        { question: 'Vermelhidão no couro', answer: c.redness ? 'Sim' : 'Não' },
        { question: 'Coceira', answer: c.itching ? 'Sim' : 'Não' },
        { question: 'Crostas', answer: c.crusts ? 'Sim' : 'Não' },
        { question: 'Edema (inchaço frontal)', answer: c.swelling ? 'Sim' : 'Não' },
        { question: 'Sangramento', answer: c.bleeding ? 'Sim' : 'Não' },
        { question: 'Febre', answer: c.fever ? 'Sim' : 'Não' },
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
  /** Opcional: sem data, o paciente entra só como lead. */
  surgeryDate?: string;
  surgeon?: string;
  doctorId?: string;
}

export async function createPatient(input: NewPatientInput): Promise<string> {
  const supabase = createClient();
  const clinicId = await currentClinicId(supabase);
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

  // Sem data não há procedimento a registrar — o paciente entra como lead, que
  // é o caso de quem chega pelo WhatsApp. A data pode ser definida depois na
  // ficha, e é ela que dispara a geração do protocolo.
  if (input.surgeryDate) {
    // Um único procedimento por clínica: resolve o protocolo dela.
    const { data: protocol } = await supabase
      .from('protocols')
      .select('id, name')
      .eq('clinic_id', clinicId)
      .order('created_at')
      .limit(1)
      .maybeSingle();

    const { error: sErr } = await supabase.from('surgeries').insert({
      clinic_id: clinicId,
      patient_id: patientId,
      protocol_id: (protocol as any)?.id ?? null,
      surgery_type: (protocol as any)?.name ?? 'Transplante capilar',
      date: input.surgeryDate,
      surgeon: input.surgeon || null,
      doctor_id: input.doctorId || null,
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
  }));
}

// ---------- dashboard ----------
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = createClient();
  // Contagens no servidor. Antes isto baixava `messages` e `appointments`
  // inteiras só para contar no client — insustentável com o volume do WhatsApp.
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const countOf = (q: any) => q.then((r: any) => r.count ?? 0);

  const [overview, todayAppointments, pendingMessages] = await Promise.all([
    supabase.from('patient_overview').select('patient_status, open_alerts'),
    countOf(
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .gte('scheduled_at', dayStart.toISOString())
        .lt('scheduled_at', dayEnd.toISOString()),
    ),
    countOf(
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender', 'patient')
        .eq('read', false),
    ),
  ]);

  const rows = (overview.data ?? []) as any[];

  return {
    activePatients: rows.filter((r) => r.patient_status === 'active').length,
    alertPatients: rows.filter((r) => Number(r.open_alerts ?? 0) > 0).length,
    finishedPatients: rows.filter((r) => r.patient_status === 'finished').length,
    todayAppointments,
    pendingMessages,
  };
}

/**
 * Distribuição do funil (CLAUDE.md §5.1). Substitui o gráfico de "uso por
 * protocolo", que com um único procedimento é sempre 100%. Aqui é o que
 * realmente varia — e é o que o agente movimenta pelo WhatsApp.
 */
const FUNNEL_LABELS: Record<string, { label: string; color: string }> = {
  lead: { label: 'Lead', color: '#94a3b8' },
  evaluation_scheduled: { label: 'Avaliação agendada', color: '#38bdf8' },
  quote_sent: { label: 'Orçamento enviado', color: '#818cf8' },
  surgery_scheduled: { label: 'Procedimento agendado', color: '#a78bfa' },
  operated: { label: 'Operado', color: '#f472b6' },
  in_followup: { label: 'Em acompanhamento', color: '#fbbf24' },
  discharged: { label: 'Alta', color: '#34d399' },
  cancelled: { label: 'Cancelado', color: '#f87171' },
  follow_up: { label: 'Follow-up', color: '#fb923c' },
};

export async function getFunnelDistribution(): Promise<
  { name: string; value: number; color: string }[]
> {
  const supabase = createClient();
  const { data } = await supabase.from('patients').select('funnel_status');
  const counts = new Map<string, number>();
  (data ?? []).forEach((p: any) => {
    const k = p.funnel_status ?? 'lead';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([k, value]) => ({
      name: FUNNEL_LABELS[k]?.label ?? k,
      value,
      color: FUNNEL_LABELS[k]?.color ?? '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value);
}

/** Alertas abertos — a fila de trabalho da equipe (badge do menu e /alertas). */
export async function getOpenAlertsCount(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  return count ?? 0;
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
    date: dateOf(a.scheduled_at),
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
const CHAT_BUCKET = 'chat-attachments';

// Gera URLs assinadas (bucket privado) em lote; devolve mapa path -> url.
async function signAttachments(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return map;
  const supabase = createClient();
  const { data } = await supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrls(unique, 60 * 60); // 1h
  (data ?? []).forEach((s: any) => {
    if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
  });
  return map;
}

// Últimas N mensagens de UM paciente. Antes esta função baixava a tabela inteira
// sem filtro nem limite e assinava todos os anexos de uma vez — a tela então
// filtrava por paciente no client. Com o agente no ar, `messages` cresce em
// milhares por mês e isso trava a página.
export const MESSAGES_PAGE = 50;

export async function getMessages(patientId: string, limit = MESSAGES_PAGE): Promise<Message[]> {
  if (!patientId) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('patient_id', patientId)
    // Busca as mais RECENTES e depois inverte: `ascending` com limite traria as
    // mais antigas, que é o oposto do que a conversa precisa mostrar.
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = ((data ?? []) as any[]).reverse();
  const urls = await signAttachments(rows.map((m) => m.attachment_path).filter(Boolean));
  return rows.map((m) => mapMessageRow(m, urls));
}

// Converte uma linha do banco em Message. `urls` é o mapa de URLs assinadas já resolvidas.
const SENDER_MAP: Record<string, Message['sender']> = {
  staff: 'doctor',
  patient: 'patient',
  ai: 'ai',
  system: 'system',
};

export function mapMessageRow(m: any, urls?: Map<string, string>): Message {
  return {
    id: m.id,
    patientId: m.patient_id,
    sender: SENDER_MAP[m.sender] ?? 'patient',
    text: m.body ?? '',
    time: timeOf(m.created_at),
    type: (m.attachment_type ?? 'text') as Message['type'],
    read: m.read,
    attachmentUrl: m.attachment_path ? urls?.get(m.attachment_path) : undefined,
    attachmentName: m.attachment_name ?? undefined,
  };
}

// Assina o anexo de uma única linha (usado pelo realtime).
export async function signMessageRow(m: any): Promise<Message> {
  if (!m.attachment_path) return mapMessageRow(m);
  const urls = await signAttachments([m.attachment_path]);
  return mapMessageRow(m, urls);
}

// Faz upload do anexo e devolve os metadados para gravar na mensagem.
export async function uploadChatAttachment(
  patientId: string,
  file: File,
  type: 'image' | 'pdf' | 'video' | 'audio',
): Promise<{ path: string; type: typeof type; name: string }> {
  const supabase = createClient();
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const path = `${patientId}/${type}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return { path, type, name: file.name };
}

// O paciente está no WhatsApp, então a mensagem não pode ser só um insert: quem
// envia é a Edge Function `wa-send`, que fala com a Z-API e grava a linha no
// mesmo passo. É o caminho único de saída — o agente e o cron passam por lá também.
// O JWT do usuário vai no invoke; o segredo de servidor nunca chega ao browser.
export async function sendMessage(
  patientId: string,
  body: string,
  attachment?: { path: string; type: 'image' | 'pdf' | 'video' | 'audio'; name: string },
): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('wa-send', {
    body: { patientId, body, attachment },
  });
  const bodyError = (data as { error?: string } | null)?.error;
  if (error || bodyError) throw new Error(bodyError ?? 'Não foi possível enviar pelo WhatsApp.');
}

// ---------- conversas do WhatsApp ----------
export async function getConversations(): Promise<Conversation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('id, patient_id, wa_phone, ai_enabled, handoff_reason, last_inbound_at')
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(PATIENTS_PAGE);
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id,
    patientId: c.patient_id,
    phone: c.wa_phone,
    aiEnabled: c.ai_enabled,
    handoffReason: c.handoff_reason ?? null,
    lastInboundAt: c.last_inbound_at ?? null,
  }));
}

/** Liga/desliga o agente numa conversa (CLAUDE.md §7.3 — a equipe precisa poder reativar). */
export async function setConversationAiEnabled(
  conversationId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('conversations')
    .update({ ai_enabled: enabled, handoff_reason: enabled ? null : 'pausada pela equipe' })
    .eq('id', conversationId);
  if (error) throw error;
}

// ---------- notificações ----------
export async function getNotifications(): Promise<Notification[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('*, patients(full_name)')
    .order('created_at', { ascending: false })
    .limit(100);
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

// ---------- usuários do sistema (configurações) ----------
// Só usuários de sistema/auth (Admin geral e Profissional) — pacientes ficam de fora.
export async function getTeam(): Promise<User[]> {
  const supabase = createClient();
  const [{ data, error }, { data: clinics }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, role, is_superadmin, clinic_id, active, created_at')
      .neq('role', 'patient')
      .order('created_at'),
    supabase.from('clinics').select('id, name'),
  ]);
  if (error) throw error;
  const clinicName = new Map<string, string>((clinics ?? []).map((c: any) => [c.id, c.name]));
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.full_name ?? '—',
    email: '',
    role: p.is_superadmin ? 'Admin geral' : 'Profissional',
    active: p.active !== false,
    lastAccess: relativeTime(p.created_at),
    clinicName: clinicName.get(p.clinic_id),
  }));
}

// ---------- meu perfil + minha clínica ----------
export async function getMyProfile(): Promise<{ fullName: string; phone: string; email: string } | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from('profiles').select('full_name, phone').eq('id', auth.user.id).maybeSingle();
  const p = data as any;
  return { fullName: p?.full_name ?? '', phone: p?.phone ?? '', email: auth.user.email ?? '' };
}

// Dispara o e-mail de redefinição de senha para o próprio usuário (reaproveita o fluxo de reset).
export async function sendMyPasswordReset(): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) throw new Error('Sem e-mail na sessão.');
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(auth.user.email, { redirectTo });
  if (error) throw error;
}

export async function updateMyProfile(input: { fullName: string; phone: string }): Promise<void> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('update_my_profile', {
    p_full_name: input.fullName,
    p_phone: input.phone || null,
  });
  if (error) throw error;
}

export async function getMyClinic(): Promise<{ id: string; name: string; cnpj: string; phone: string; email: string; address: string; inviteCode: string } | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: prof } = await supabase.from('profiles').select('clinic_id').eq('id', auth.user.id).maybeSingle();
  const clinicId = (prof as any)?.clinic_id;
  if (!clinicId) return null;
  const { data } = await supabase.from('clinics').select('id, name, cnpj, phone, email, address, invite_code').eq('id', clinicId).maybeSingle();
  if (!data) return null;
  const c = data as any;
  return {
    id: c.id,
    name: c.name ?? '',
    cnpj: c.cnpj ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    address: c.address ?? '',
    inviteCode: c.invite_code ?? '',
  };
}

export async function updateMyClinic(input: {
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
}): Promise<void> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('update_my_clinic', {
    p_name: input.name,
    p_cnpj: input.cnpj || null,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_address: input.address || null,
  });
  if (error) throw error;
}

// Cria um usuário de sistema (Admin geral ou Profissional em clínica existente).
// Profissional em NOVA clínica usa provisionClinic().
export async function createUser(input: {
  name: string;
  email: string;
  type: 'admin' | 'professional';
  clinicId?: string;
  specialty?: string;
  crm?: string;
  phone?: string;
}): Promise<{ emailed: boolean; tempPassword?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('create-user', { body: input });
  const bodyError = (data as { error?: string } | null)?.error;
  if (error || bodyError) throw new Error(bodyError ?? 'Não foi possível criar o usuário.');
  const d = data as { emailed?: boolean; tempPassword?: string };
  return { emailed: !!d.emailed, tempPassword: d.tempPassword };
}

// Perfil do usuário logado (para decidir o que ele pode gerenciar).
// isSuperadmin = admin geral do SaaS (vê/gerencia todas as clínicas).
export async function getCurrentProfile(): Promise<{ id: string; jobTitle: string | null; isAdmin: boolean; isSuperadmin: boolean } | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from('profiles').select('job_title, is_superadmin').eq('id', auth.user.id).maybeSingle();
  const jobTitle = (data as any)?.job_title ?? null;
  const isSuperadmin = (data as any)?.is_superadmin === true;
  return { id: auth.user.id, jobTitle, isAdmin: jobTitle === 'Administrador', isSuperadmin };
}

// Edita nome e/ou permissão de um membro (Edge Function, só admin).
export async function updateTeamMember(input: {
  userId: string;
  name?: string;
  permission?: string;
}): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: { action: 'update', ...input },
  });
  const bodyError = (data as { error?: string } | null)?.error;
  if (error || bodyError) throw new Error(bodyError ?? 'Não foi possível atualizar o usuário.');
}

// Ativa/inativa um membro (Edge Function, só admin).
export async function setTeamMemberActive(userId: string, active: boolean): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: { action: 'setActive', userId, active },
  });
  const bodyError = (data as { error?: string } | null)?.error;
  if (error || bodyError) throw new Error(bodyError ?? 'Não foi possível alterar o status.');
}

// Cria um membro da equipe via Edge Function (auth + senha aleatória por e-mail).
export async function createTeamMember(input: {
  name: string;
  email: string;
  permission: string;
}): Promise<{ emailed: boolean; tempPassword?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('create-user', { body: input });
  const bodyError = (data as { error?: string } | null)?.error;
  if (error || bodyError) {
    throw new Error(bodyError ?? 'Não foi possível criar o usuário.');
  }
  const d = data as { emailed?: boolean; tempPassword?: string };
  return { emailed: !!d.emailed, tempPassword: d.tempPassword };
}

// ---------- clínicas (admin geral) ----------
export interface ClinicRow {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
  patientCount: number;
  inviteCode: string;
}

// Lista de clínicas. Super-admin vê todas; médico vê só a própria (via RLS).
export async function getClinics(): Promise<ClinicRow[]> {
  const supabase = createClient();
  const [{ data: clinics, error }, { data: pats }] = await Promise.all([
    supabase.from('clinics').select('id, name, plan, created_at, invite_code').order('created_at'),
    supabase.from('patients').select('clinic_id'),
  ]);
  if (error) throw error;
  const counts = new Map<string, number>();
  (pats ?? []).forEach((p: any) => counts.set(p.clinic_id, (counts.get(p.clinic_id) ?? 0) + 1));
  return (clinics ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    plan: c.plan,
    createdAt: c.created_at,
    patientCount: counts.get(c.id) ?? 0,
    inviteCode: c.invite_code ?? '',
  }));
}

// Onboarding: cria nova clínica + profissional (Edge Function, só admin geral).
export async function provisionClinic(input: {
  clinicName: string;
  professionalName: string;
  email: string;
  plan?: string;
  specialty?: string;
  crm?: string;
  phone?: string;
}): Promise<{ clinicId: string; emailed: boolean; tempPassword?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('provision-clinic', { body: input });
  const bodyError = (data as { error?: string } | null)?.error;
  if (error || bodyError) throw new Error(bodyError ?? 'Não foi possível cadastrar a clínica.');
  const d = data as { clinicId: string; emailed?: boolean; tempPassword?: string };
  return { clinicId: d.clinicId, emailed: !!d.emailed, tempPassword: d.tempPassword };
}

export async function getCannedResponses(): Promise<CannedResponse[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('canned_responses').select('*').order('title');
  if (error) throw error;
  return (data ?? []).map((c: any) => ({ id: c.id, title: c.title, body: c.body }));
}

// ===========================================================================
// FAQ do agente (canned_responses)
// ===========================================================================
// É a base de conhecimento do agente: a tool `search_faq` lê daqui, e sem
// correspondência a IA é instruída a encaminhar para a equipe em vez de
// responder por conta própria (CLAUDE.md §1.1).

const PLACEHOLDER = '[TEXTO A DEFINIR';

export async function createFaqEntry(title: string, body: string): Promise<void> {
  const supabase = createClient();
  const clinicId = await currentClinicId(supabase);
  if (!clinicId) throw new Error('Clínica do usuário não encontrada.');
  const { error } = await supabase
    .from('canned_responses')
    .insert({ clinic_id: clinicId, title, body } as any);
  if (error) throw error;
}

export async function updateFaqEntry(id: string, title: string, body: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('canned_responses')
    .update({ title, body } as any)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteFaqEntry(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('canned_responses').delete().eq('id', id);
  if (error) throw error;
}

// ===========================================================================
// Protocolo — os textos que o motor de disparo envia
// ===========================================================================

function stepLabel(dayOffset: number): string {
  return dayOffset < 0 ? `D${dayOffset}` : `D+${dayOffset}`;
}

export async function getProtocolSteps(): Promise<ProtocolStep[]> {
  const supabase = createClient();
  const clinicId = await currentClinicId(supabase);
  if (!clinicId) return [];

  // Um procedimento por clínica: pega o protocolo dela e lista os passos.
  const { data: protocol } = await supabase
    .from('protocols')
    .select('id')
    .eq('clinic_id', clinicId)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!protocol) return [];

  const { data, error } = await supabase
    .from('protocol_steps')
    .select('id, day_offset, phase, title, instructions, send_time, active')
    .eq('protocol_id', (protocol as any).id)
    .order('day_offset');
  if (error) throw error;

  return (data ?? []).map((s: any) => ({
    id: s.id,
    dayOffset: Number(s.day_offset),
    label: stepLabel(Number(s.day_offset)),
    phase: s.phase ?? null,
    title: s.title ?? '',
    body: s.instructions ?? '',
    sendTime: String(s.send_time ?? '09:00').slice(0, 5),
    active: s.active !== false,
    pending: !s.instructions || String(s.instructions).trimStart().startsWith(PLACEHOLDER),
  }));
}

export async function updateProtocolStep(
  id: string,
  input: { body: string; sendTime: string; active: boolean },
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('protocol_steps')
    .update({
      instructions: input.body,
      send_time: input.sendTime,
      active: input.active,
    } as any)
    .eq('id', id);
  if (error) throw error;
}

/** Situação dos disparos já materializados (`protocol_messages`). */
export async function getDispatchSummary(): Promise<DispatchSummary> {
  const supabase = createClient();
  const countBy = (status: string) =>
    supabase
      .from('protocol_messages')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
      .then((r: any) => r.count ?? 0);

  const [scheduled, sent, failed] = await Promise.all([
    countBy('scheduled'),
    countBy('sent'),
    countBy('failed'),
  ]);
  return { scheduled, sent, failed };
}

/**
 * Devolve à fila os disparos que falharam por estarem com placeholder.
 *
 * Escrever o texto não basta: o `protocol_messages` já marcado `failed` não
 * volta sozinho. Reescrever `date` com o próprio valor faz o trigger
 * `trg_surgery_protocol_schedule` disparar (ele reage à coluna estar no SET,
 * não a ela mudar), e a função de regeneração limpa os `failed` e recria.
 */
export async function reprocessDispatches(): Promise<number> {
  const supabase = createClient();
  const clinicId = await currentClinicId(supabase);
  if (!clinicId) return 0;

  const { data: surgeries, error } = await supabase
    .from('surgeries')
    .select('id, date')
    .eq('clinic_id', clinicId)
    .eq('status', 'active');
  if (error) throw error;

  for (const s of (surgeries ?? []) as any[]) {
    const { error: uErr } = await supabase
      .from('surgeries')
      .update({ date: s.date } as any)
      .eq('id', s.id);
    if (uErr) throw uErr;
  }
  return (surgeries ?? []).length;
}

/**
 * Data do procedimento. É a âncora de todo o D+n: alterá-la regenera os
 * disparos pendentes automaticamente pelo trigger.
 */
export async function updateProcedureDate(patientId: string, date: string): Promise<void> {
  const supabase = createClient();
  const { data: surgery } = await supabase
    .from('surgeries')
    .select('id')
    .eq('patient_id', patientId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (surgery) {
    const { error } = await supabase
      .from('surgeries')
      .update({ date } as any)
      .eq('id', (surgery as any).id);
    if (error) throw error;
    return;
  }

  // Paciente que chegou pelo WhatsApp como lead ainda não tem procedimento.
  const clinicId = await currentClinicId(supabase);
  if (!clinicId) throw new Error('Clínica do usuário não encontrada.');
  const { data: protocol } = await supabase
    .from('protocols').select('id').eq('clinic_id', clinicId).order('created_at').limit(1).maybeSingle();

  const { error } = await supabase.from('surgeries').insert({
    clinic_id: clinicId,
    patient_id: patientId,
    protocol_id: (protocol as any)?.id ?? null,
    surgery_type: 'Transplante capilar',
    date,
    status: 'active',
  } as any);
  if (error) throw error;
}

/** Textos já fornecidos pela clínica (migration 0015), sugeridos no editor. */
export async function getCareTipSuggestions(): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('care_tips')
    .select('body')
    .eq('phase', 'postop')
    .order('sort_order');
  return (data ?? []).map((t: any) => t.body);
}

// ===========================================================================
// Fila de alertas
// ===========================================================================

export async function getOpenAlerts(): Promise<AlertItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('alerts')
    .select('id, patient_id, severity, reason, created_at, checkin_id, patients(full_name)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  // A IA se pausa ao escalar; mostrar isso é o que liga o alerta à conversa.
  const { data: convs } = await supabase
    .from('conversations')
    .select('patient_id, ai_enabled')
    .in('patient_id', rows.map((r) => r.patient_id));
  const paused = new Map<string, boolean>(
    (convs ?? []).map((c: any) => [c.patient_id, !c.ai_enabled]),
  );

  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  return rows
    .map((a) => ({
      id: a.id,
      patientId: a.patient_id,
      patientName: a.patients?.full_name ?? 'Paciente',
      severity: a.severity,
      reason: a.reason,
      createdAt: a.created_at,
      fromCheckin: Boolean(a.checkin_id),
      aiPaused: paused.has(a.patient_id) ? paused.get(a.patient_id)! : null,
    }))
    .sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
}

export async function resolveAlert(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('alerts')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() } as any)
    .eq('id', id);
  if (error) throw error;
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
  // Escopo à clínica do próprio usuário (super-admin vê várias — não usar maybeSingle solto).
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: prof } = await supabase.from('profiles').select('clinic_id').eq('id', auth.user.id).maybeSingle();
  const clinicId = (prof as any)?.clinic_id;
  if (!clinicId) return null;
  const { data, error } = await supabase.from('clinics').select('*').eq('id', clinicId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const c = data as any;
  const { count } = await supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('clinic_id', clinicId);
  return {
    id: c.id,
    name: c.name,
    plan: c.plan,
    activePatientLimit: c.active_patient_limit,
    activePatients: count ?? 0,
  };
}

// ---------- médicos ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDoctor(d: any): Doctor {
  return {
    id: d.id,
    name: d.full_name,
    specialty: d.specialty ?? '',
    crm: d.crm ?? '',
    phone: d.phone ?? '',
    email: d.email ?? '',
    active: d.active !== false,
    clinicId: d.clinic_id ?? '',
  };
}

export async function getDoctors(activeOnly = false): Promise<Doctor[]> {
  const supabase = createClient();
  let q = supabase.from('doctors').select('*').order('full_name');
  if (activeOnly) q = q.eq('active', true);
  const [{ data, error }, { data: clinics }] = await Promise.all([
    q,
    supabase.from('clinics').select('id, name'),
  ]);
  if (error) throw error;
  const clinicName = new Map<string, string>((clinics ?? []).map((c: any) => [c.id, c.name]));
  return (data ?? []).map((d: any) => {
    const doc = rowToDoctor(d);
    doc.clinicName = doc.clinicId ? clinicName.get(doc.clinicId) : undefined;
    return doc;
  });
}

export interface DoctorInput {
  name: string;
  specialty?: string;
  crm?: string;
  phone?: string;
  email?: string;
}

export async function createDoctor(input: DoctorInput): Promise<void> {
  const supabase = createClient();
  const clinicId = await currentClinicId(supabase);
  if (!clinicId) throw new Error('Clínica do usuário não encontrada.');
  const { error } = await supabase.from('doctors').insert({
    clinic_id: clinicId,
    full_name: input.name.trim(),
    specialty: input.specialty || null,
    crm: input.crm || null,
    phone: input.phone || null,
    email: input.email || null,
  } as any);
  if (error) throw error;
}

export async function updateDoctor(id: string, input: DoctorInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('doctors')
    .update({
      full_name: input.name.trim(),
      specialty: input.specialty || null,
      crm: input.crm || null,
      phone: input.phone || null,
      email: input.email || null,
    } as any)
    .eq('id', id);
  if (error) throw error;
}

export async function setDoctorActive(id: string, active: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('doctors').update({ active } as any).eq('id', id);
  if (error) throw error;
}

// Cria um agendamento na agenda (o médico escolhido vira o profissional do evento).
export async function createAppointment(input: {
  patientId: string;
  doctorId: string;
  title: string;
  type: 'return' | 'consultation';
  scheduledAt: string; // ISO
  phase?: 'preop' | 'postop' | null;
  phaseStart?: string | null; // YYYY-MM-DD
  phaseEnd?: string | null; // YYYY-MM-DD
}): Promise<void> {
  const supabase = createClient();
  const clinicId = await currentClinicId(supabase);
  if (!clinicId) throw new Error('Clínica do usuário não encontrada.');

  const { data: doctor } = await supabase.from('doctors').select('full_name').eq('id', input.doctorId).maybeSingle();
  const professional = (doctor as any)?.full_name ?? null;

  const phase = input.phase ?? null;
  const { error } = await supabase.from('appointments').insert({
    clinic_id: clinicId,
    patient_id: input.patientId,
    doctor_id: input.doctorId,
    professional,
    title: input.title.trim(),
    type: input.type,
    scheduled_at: input.scheduledAt,
    // Fase de cuidado (pré/pós-operatório) e janela para os lembretes diários.
    phase,
    phase_start: phase ? input.phaseStart ?? null : null,
    phase_end: phase ? input.phaseEnd ?? null : null,
  } as any);
  if (error) throw error;
}
