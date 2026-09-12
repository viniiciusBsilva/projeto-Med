'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Hospital,
  User,
  Users,
  FileText,
  MessageSquare,
  Download,
  Stethoscope,
  Camera,
  AlertTriangle,
  Pill,
  FileCheck,
  Sparkles,
  Send,
  ClipboardList,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge, RiskBadge, TimelineStatusBadge } from '@/components/status-badges';
import type { Patient, Protocol, TimelineStep } from '@/lib/types';
import {
  getPatient,
  getPatientAiSummary,
  getPatientTimeline,
  getProtocols,
  updateProcedureDate,
} from '@/lib/queries';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function PatientDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [patient, setPatient] = React.useState<Patient | null>(null);
  const [timelineSteps, setTimelineSteps] = React.useState<TimelineStep[]>([]);
  const [protocol, setProtocol] = React.useState<Protocol | undefined>(undefined);
  const [waSummary, setWaSummary] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(
    () =>
      Promise.all([
        getPatient(id),
        getPatientTimeline(id),
        getProtocols(),
        getPatientAiSummary(id).catch(() => null),
      ]).then(([p, steps, protocols, summary]) => {
        setPatient(p);
        setTimelineSteps(steps);
        setWaSummary(summary);
        if (p) setProtocol(protocols.find((pr) => pr.id === p.protocolId));
      }),
    [id],
  );

  React.useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Carregando paciente...</div>;
  }
  if (!patient) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium">Paciente não encontrado</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/patients">Voltar para pacientes</Link>
        </Button>
      </div>
    );
  }

  const aiSummary = {
    evolution:
      `Paciente em D+${patient.currentDay} de ${patient.surgeryType}. ` +
      `${timelineSteps.length} check-in(s) registrado(s) no acompanhamento. ` +
      (patient.status === 'alert'
        ? 'Há sinais de alerta em aberto que exigem avaliação da equipe.'
        : 'Evolução sem alertas em aberto no momento.'),
    riskClassification:
      patient.risk === 'high' ? 'Alto risco' : patient.risk === 'medium' ? 'Risco moderado' : 'Baixo risco',
    riskReason:
      patient.risk === 'high'
        ? 'Check-in recente com febre/sangramento ou dor intensa. A decisão clínica é sempre humana.'
        : patient.risk === 'medium'
        ? 'Desconforto relatado em check-in recente. Monitorar evolução.'
        : 'Sem sinais de risco relevantes nos check-ins recentes.',
    complications: Array.from(new Set(timelineSteps.flatMap((s) => s.alerts ?? []))),
    recommendations:
      patient.status === 'alert'
        ? ['Avaliar retorno presencial', 'Revisar medicação prescrita', 'Monitorar temperatura']
        : ['Manter acompanhamento pelos check-ins diários'],
    suggestedResponse:
      `Olá, ${patient.name.split(' ')[0]}. Recebemos suas respostas do acompanhamento. ` +
      'Continue registrando seus check-ins e nos avise em caso de febre, sangramento ou dor intensa.',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/patients">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <PageHeader title={patient.name} description={`${patient.surgeryType} · Dia ${patient.currentDay} de acompanhamento`} />
      </div>

      {/* Patient Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <Avatar className="h-20 w-20 border-2">
              <AvatarImage src={patient.photo} />
              <AvatarFallback className="text-lg">
                {patient.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold">{patient.name}</h2>
                <StatusBadge status={patient.status} />
                <RiskBadge risk={patient.risk} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {/* Editável: é a âncora de todo o D+n. Remarcar o procedimento
                    regenera os disparos pendentes pelo trigger do banco. */}
                <ProcedureDateItem
                  patientId={patient.id}
                  value={patient.surgeryDate}
                  onSaved={reload}
                />
                <InfoItem icon={User} label="Médico responsável" value={patient.doctor} />
                <InfoItem icon={Phone} label="Telefone" value={patient.phone} />
                <InfoItem icon={Mail} label="Email" value={patient.email} />
                <InfoItem icon={MapPin} label="Endereço" value={patient.address} />
              </div>

              {patient.notes && (
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs font-medium text-muted-foreground">Observações</p>
                  <p className="mt-1 text-sm">{patient.notes}</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button size="sm">
                <MessageSquare className="mr-1.5 h-4 w-4" />
                Enviar mensagem
              </Button>
              <Button variant="outline" size="sm">
                <FileText className="mr-1.5 h-4 w-4" />
                Gerar PDF
              </Button>
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" />
                Exportar histórico
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* O que o paciente contou à assistente no WhatsApp, resumido a cada resposta. */}
      {waSummary && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-primary" style={{ width: 16, height: 16 }} />
              Quadro relatado no WhatsApp
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Resumo feito pela assistente a partir das conversas. Não é avaliação clínica — confira
              a conversa antes de decidir.
            </p>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-relaxed">{waSummary}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="timeline">
        <TabsList className="grid w-full grid-cols-3 md:w-auto">
          <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
          <TabsTrigger value="photos">Fotos</TabsTrigger>
          <TabsTrigger value="ai">Análise IA</TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Linha do tempo do acompanhamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-6 pl-8">
                {/* Vertical line */}
                <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

                {timelineSteps.map((step, i) => (
                  <div
                    key={i}
                    className="relative animate-fade-in"
                    style={{ animationDelay: `${i * 0.08}s` }}
                  >
                    {/* Dot */}
                    <div
                      className={cn(
                        'absolute -left-[1.6rem] top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background',
                        step.status === 'completed' && 'bg-success',
                        step.status === 'current' && 'bg-primary animate-pulse-soft',
                        step.status === 'pending' && 'bg-muted',
                        step.status === 'overdue' && 'bg-destructive'
                      )}
                    >
                      {step.status === 'completed' && (
                        <FileCheck className="h-3 w-3 text-white" style={{ width: 12, height: 12 }} />
                      )}
                      {step.status === 'current' && (
                        <span className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </div>

                    <div
                      className={cn(
                        'rounded-xl border p-4 transition-all',
                        step.status === 'current'
                          ? 'border-primary/30 bg-primary/5 shadow-sm'
                          : 'bg-card hover:shadow-sm'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Dia {step.day}</p>
                          <p className="text-xs text-muted-foreground">{step.title}</p>
                        </div>
                        <TimelineStatusBadge status={step.status} />
                      </div>

                      {step.questionnaire && (
                        <div className="mt-4 space-y-2">
                          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <ClipboardList className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                            Questionário respondido
                          </p>
                          {step.questionnaire.map((q, j) => (
                            <div key={j} className="rounded-lg bg-muted/50 p-2.5">
                              <p className="text-xs text-muted-foreground">{q.question}</p>
                              <p className="mt-0.5 text-sm font-medium">{q.answer}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {step.photos && step.photos.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Camera className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                            Fotos enviadas
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {step.photos.map((photo, j) => (
                              <div key={j} className="group relative">
                                <img
                                  src={photo.url}
                                  alt={photo.label}
                                  className="h-20 w-20 rounded-lg border object-cover transition-transform group-hover:scale-105"
                                />
                                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                                  {photo.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {step.medications && (
                        <div className="mt-4">
                          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Pill className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                            Medicamentos
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {step.medications.map((med, j) => (
                              <span key={j} className="rounded-md bg-secondary/10 px-2 py-1 text-xs text-secondary">
                                {med}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {step.alerts && step.alerts.length > 0 && (
                        <div className="mt-4 space-y-1.5">
                          {step.alerts.map((alert, j) => (
                            <div
                              key={j}
                              className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                            >
                              <AlertTriangle className="h-4 w-4 shrink-0" style={{ width: 16, height: 16 }} />
                              {alert}
                            </div>
                          ))}
                        </div>
                      )}

                      {step.observations && (
                        <div className="mt-4 rounded-lg bg-muted/50 p-3">
                          <p className="text-xs font-medium text-muted-foreground">Observações</p>
                          <p className="mt-1 text-sm">{step.observations}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>


        {/* Photos Tab */}
        <TabsContent value="photos" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Galeria de fotos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {['Frontal', 'Lateral Direita', 'Lateral Esquerda', 'Superior', 'Inferior'].map((label, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border">
                    <img
                      src={`https://images.pexels.com/photos/4173251/pexels-photo-4173251.jpeg?auto=compress&cs=tinysrgb&w=400`}
                      alt={label}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <span className="absolute bottom-2 left-2 text-sm font-medium text-white">{label}</span>
                  </div>
                ))}
                {/* Before/After comparison */}
                <div className="group relative aspect-square overflow-hidden rounded-xl border-2 border-dashed border-primary/30">
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <Camera className="h-8 w-8 text-primary/50" style={{ width: 32, height: 32 }} />
                    <p className="text-xs font-medium text-primary">Comparativo</p>
                    <p className="text-xs text-muted-foreground">Antes × Depois</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Analysis Tab */}
        <TabsContent value="ai" className="mt-4 space-y-4">
          <Card className="border-primary/20">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" style={{ width: 16, height: 16 }} />
                </div>
                <CardTitle className="text-base font-semibold">Resumo de evolução por IA</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed">{aiSummary.evolution}</p>

              <div className="rounded-xl bg-destructive/5 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" style={{ width: 16, height: 16 }} />
                  <p className="text-sm font-semibold text-destructive">{aiSummary.riskClassification}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{aiSummary.riskReason}</p>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Possíveis complicações identificadas</p>
                <ul className="space-y-1.5">
                  {aiSummary.complications.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Recomendações</p>
                <ul className="space-y-1.5">
                  {aiSummary.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Resposta sugerida para o paciente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-sm leading-relaxed">{aiSummary.suggestedResponse}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm">
                  <Send className="mr-1.5 h-4 w-4" />
                  Enviar resposta
                </Button>
                <Button variant="outline" size="sm">
                  Editar resposta
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Data do procedimento — editável.
 *
 * Não é um campo qualquer: é a âncora de todo o D+n. Salvar dispara o trigger
 * `trg_surgery_protocol_schedule`, que recalcula os disparos ainda não enviados.
 * Remarcar cirurgia é rotina, e antes não havia como fazer isso pelo painel.
 */
function ProcedureDateItem({
  patientId,
  value,
  onSaved,
}: {
  patientId: string;
  value: string;
  onSaved: () => Promise<unknown>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [date, setDate] = React.useState(value ? value.slice(0, 10) : '');
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (!date) return;
    setSaving(true);
    try {
      await updateProcedureDate(patientId, date);
      await onSaved();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Calendar className="h-4 w-4 text-muted-foreground" style={{ width: 16, height: 16 }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">Data do procedimento</p>
        {editing ? (
          <div className="mt-1 flex items-center gap-1.5">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 w-36"
            />
            <Button size="sm" className="h-8" onClick={save} disabled={saving || !date}>
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setDate(value ? value.slice(0, 10) : '');
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="truncate text-sm font-medium underline-offset-2 hover:underline"
          >
            {value ? new Date(value).toLocaleDateString('pt-BR') : 'Definir data'}
          </button>
        )}
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" style={{ width: 16, height: 16 }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
