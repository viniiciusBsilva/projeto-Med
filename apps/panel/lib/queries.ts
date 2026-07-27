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
export async function getPatients(): Promise<Patient[]> {
  const supabase = createClient();
  const [{ data, error }, { data: clinics }] = await Promise.all([
    supabase.from('patient_overview').select('*').order('last_activity', { ascending: false }),
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
  protocolId?: string;
  surgeryType?: string;
  surgeryDate?: string;
  hospital?: string;
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

  if (input.surgeryDate && (input.surgeryType || input.protocolId)) {
    const { error: sErr } = await supabase.from('surgeries').insert({
      clinic_id: clinicId,
      patient_id: patientId,
      protocol_id: input.protocolId || null,
      surgery_type: input.surgeryType || 'Cirurgia',
      date: input.surgeryDate,
      hospital: input.hospital || null,
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
  const today = dateOf(new Date().toISOString());

  return {
    activePatients: rows.filter((r) => r.patient_status === 'active').length,
    alertPatients: rows.filter((r) => Number(r.open_alerts ?? 0) > 0).length,
    finishedPatients: rows.filter((r) => r.patient_status === 'finished').length,
    todayAppointments: (appts.data ?? []).filter((a: any) => dateOf(a.scheduled_at) === today).length,
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

export async function getMessages(): Promise<Message[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const urls = await signAttachments(rows.map((m) => m.attachment_path).filter(Boolean));
  return rows.map((m) => mapMessageRow(m, urls));
}

// Converte uma linha do banco em Message. `urls` é o mapa de URLs assinadas já resolvidas.
export function mapMessageRow(m: any, urls?: Map<string, string>): Message {
  return {
    id: m.id,
    patientId: m.patient_id,
    sender: m.sender === 'staff' ? 'doctor' : 'patient',
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

export async function sendMessage(
  patientId: string,
  body: string,
  attachment?: { path: string; type: 'image' | 'pdf' | 'video' | 'audio'; name: string },
): Promise<void> {
  const supabase = createClient();
  const clinicId = await currentClinicId(supabase);
  const { error } = await supabase.from('messages').insert({
    patient_id: patientId,
    clinic_id: clinicId,
    sender: 'staff',
    body: body || null,
    read: true,
    attachment_path: attachment?.path ?? null,
    attachment_type: attachment?.type ?? null,
    attachment_name: attachment?.name ?? null,
  } as any);
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

export async function getMyClinic(): Promise<{ id: string; name: string; cnpj: string; phone: string; email: string; address: string } | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: prof } = await supabase.from('profiles').select('clinic_id').eq('id', auth.user.id).maybeSingle();
  const clinicId = (prof as any)?.clinic_id;
  if (!clinicId) return null;
  const { data } = await supabase.from('clinics').select('id, name, cnpj, phone, email, address').eq('id', clinicId).maybeSingle();
  if (!data) return null;
  const c = data as any;
  return {
    id: c.id,
    name: c.name ?? '',
    cnpj: c.cnpj ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    address: c.address ?? '',
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
}

// Lista de clínicas. Super-admin vê todas; médico vê só a própria (via RLS).
export async function getClinics(): Promise<ClinicRow[]> {
  const supabase = createClient();
  const [{ data: clinics, error }, { data: pats }] = await Promise.all([
    supabase.from('clinics').select('id, name, plan, created_at').order('created_at'),
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
  };
}

export async function getDoctors(activeOnly = false): Promise<Doctor[]> {
  const supabase = createClient();
  let q = supabase.from('doctors').select('*').order('full_name');
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToDoctor);
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
