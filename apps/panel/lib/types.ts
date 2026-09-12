// Tipos de domínio consumidos pela UI do painel.
// Preenchidos pela camada de dados (lib/queries.ts) a partir do Supabase.

export type PatientStatus = 'active' | 'alert' | 'completed' | 'pending';
export type RiskLevel = 'low' | 'medium' | 'high';
export type TimelineStepStatus = 'completed' | 'pending' | 'overdue' | 'current';

export interface Patient {
  id: string;
  name: string;
  cpf: string;
  birthDate: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  photo: string;
  surgeryType: string;
  surgeryDate: string;
  hospital: string;
  doctor: string;
  team: string;
  notes: string;
  status: PatientStatus;
  risk: RiskLevel;
  currentDay: number;
  protocolId: string;
  lastUpdate: string;
  /** Etapa do funil ('lead', 'evaluation_scheduled'…) — é o que o agente do WhatsApp movimenta. */
  funnelStatus: string;
  clinicId?: string;
  clinicName?: string;
}

export interface Protocol {
  id: string;
  name: string;
  category: string;
  duration: number;
  color: string; // hex (ex.: #2563EB)
  patientCount: number;
  days: number[];
}

/**
 * Um disparo do protocolo (linha de `protocol_steps`). `body` é o texto que vai
 * literalmente ao paciente no WhatsApp — enquanto for placeholder, o `wa-send`
 * se recusa a enviar.
 */
export interface ProtocolStep {
  id: string;
  dayOffset: number;
  /** 'D-7' | 'D+1' — rótulo derivado do dayOffset. */
  label: string;
  phase: 'preop' | 'postop' | 'followup' | null;
  title: string;
  body: string;
  sendTime: string; // HH:MM
  active: boolean;
  /** true quando `body` ainda é o `[TEXTO A DEFINIR PELO MÉDICO]`. */
  pending: boolean;
  /** Disparos já materializados. Apagar o passo remove estes em cascata. */
  sentCount: number;
  scheduledCount: number;
}

/** Situação dos disparos já materializados para os pacientes. */
export interface DispatchSummary {
  scheduled: number;
  sent: number;
  failed: number;
}

/**
 * 'clinical' é sinal de saúde (triagem do check-in, raise_alert) e pesa no risco
 * do paciente. Os demais são de atendimento: algo que a IA não resolveu sozinha.
 * 'review' é arquivo do paciente (foto, vídeo, exame) para o médico avaliar.
 */
export type AlertKind = 'clinical' | 'question' | 'scheduling' | 'handoff' | 'technical' | 'review';

/** Alerta aberto: sinal clínico ou atendimento que precisa da equipe. */
export interface AlertItem {
  id: string;
  patientId: string;
  patientName: string;
  kind: AlertKind;
  severity: 'medium' | 'high' | 'critical';
  reason: string;
  createdAt: string;
  fromCheckin: boolean;
  /** null quando o paciente ainda não tem conversa de WhatsApp. */
  aiPaused: boolean | null;
}

export interface FaqEntry {
  id: string;
  title: string;
  body: string;
}

export interface TimelineStep {
  day: number;
  status: TimelineStepStatus;
  title: string;
  questionnaire?: { question: string; answer: string }[];
  photos?: { label: string; url: string }[];
  medications?: string[];
  observations?: string;
  alerts?: string[];
  date: string;
}

/** Conversa de WhatsApp com um paciente. `aiEnabled` é o interruptor do handoff. */
export interface Conversation {
  id: string;
  patientId: string;
  phone: string;
  aiEnabled: boolean;
  handoffReason: string | null;
  lastInboundAt: string | null;
}

export interface Message {
  id: string;
  patientId: string;
  /** 'ai' = agente do WhatsApp; 'system' = disparo automático de protocolo. */
  sender: 'patient' | 'doctor' | 'system' | 'ai';
  text: string;
  time: string;
  type: 'text' | 'image' | 'pdf' | 'video' | 'audio';
  read: boolean;
  /** URL assinada do anexo (buckets privados), quando houver. */
  attachmentUrl?: string;
  /** Nome original do arquivo (usado em PDF/vídeo/áudio). */
  attachmentName?: string;
}

export interface Notification {
  id: string;
  // Tipo livre vindo do banco (ex.: 'redness', 'bleeding', 'itching', 'message', 'fever'...).
  type: string;
  title: string;
  description: string;
  patientName: string;
  patientId?: string;
  time: string;
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  type: 'return' | 'consultation' | 'surgery' | 'alert';
  doctor: string;
  patientName: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string; // rótulo do tipo: 'Admin geral' | 'Profissional'
  active: boolean;
  lastAccess: string;
  clinicName?: string;
}

export interface CannedResponse {
  id: string;
  title: string;
  body: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  crm: string;
  phone: string;
  email: string;
  active: boolean;
  clinicId?: string;
  clinicName?: string;
}

export interface ClinicInfo {
  id: string;
  name: string;
  plan: string;
  activePatientLimit: number;
  activePatients: number;
}

export interface DashboardMetrics {
  /** Contatos do WhatsApp que ainda não agendaram (funil 'lead'). */
  contacts: number;
  /** Quem já confirmou agendamento ou tem procedimento (fora de 'lead' e 'cancelled'). */
  patients: number;
  clinicalAlerts: number;
  /** Atendimento que a IA não resolveu (dúvida, agenda, pedido de atendente, falha). */
  serviceAlerts: number;
  todayAppointments: number;
  /** Conversas cuja última mensagem é do paciente e ainda não foi respondida. */
  awaitingReply: number;
}
