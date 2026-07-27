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
  questions: string[];
  medications: string[];
  alerts: string[];
  care: string[];
  requiredPhotos: string[];
  hasVideo: boolean;
  hasFiles: boolean;
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

export interface Message {
  id: string;
  patientId: string;
  sender: 'patient' | 'doctor' | 'system';
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
}

export interface ClinicInfo {
  id: string;
  name: string;
  plan: string;
  activePatientLimit: number;
  activePatients: number;
}

export interface DashboardMetrics {
  activePatients: number;
  alertPatients: number;
  finishedPatients: number;
  todayAppointments: number;
  pendingMessages: number;
}
