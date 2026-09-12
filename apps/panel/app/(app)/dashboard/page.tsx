'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Plus,
  Activity,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusBadge, FunnelBadge } from '@/components/status-badges';
import type { Patient, CalendarEvent, DashboardMetrics } from '@/lib/types';
import {
  getDashboardMetrics,
  getWeeklyActivity,
  getUpcomingAppointments,
  getPatients,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const [metrics, setMetrics] = React.useState<DashboardMetrics | null>(null);
  const [weekly, setWeekly] = React.useState<{ day: string; checkins: number; alertas: number; mensagens: number }[]>([]);
  const [upcomingEvents, setUpcomingEvents] = React.useState<CalendarEvent[]>([]);
  const [recentPatients, setRecentPatients] = React.useState<Patient[]>([]);

  React.useEffect(() => {
    getDashboardMetrics().then(setMetrics).catch(() => {});
    getWeeklyActivity().then(setWeekly).catch(() => {});
    getUpcomingAppointments(4).then(setUpcomingEvents).catch(() => {});
    getPatients().then((p) => setRecentPatients(p.slice(0, 5))).catch(() => {});
  }, []);

  const kpis: { label: string; value: number; hint?: string; icon: React.ElementType; color: string; bg: string }[] = [
    { label: 'Contatos (leads)', value: metrics?.contacts ?? 0, icon: MessageSquare, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Pacientes', value: metrics?.patients ?? 0, icon: Users, color: 'text-success', bg: 'bg-success/10' },
    {
      label: 'Alertas abertos',
      value: (metrics?.clinicalAlerts ?? 0) + (metrics?.serviceAlerts ?? 0),
      hint: metrics ? `${metrics.clinicalAlerts} clínicos · ${metrics.serviceAlerts} de atendimento` : undefined,
      icon: AlertTriangle,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
    { label: 'Consultas de hoje', value: metrics?.todayAppointments ?? 0, icon: CalendarClock, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Aguardando resposta', value: metrics?.awaitingReply ?? 0, icon: MessageSquare, color: 'text-secondary', bg: 'bg-secondary/10' },
  ];

  // Retrato de agora, montado a partir das métricas — não é gerado por IA.
  const summary = metrics
    ? `${metrics.contacts} contato(s) ainda sem agendamento e ${metrics.patients} paciente(s). ` +
      `${metrics.clinicalAlerts} alerta(s) clínico(s) e ${metrics.serviceAlerts} de atendimento em aberto. ` +
      `${metrics.awaitingReply} conversa(s) aguardando resposta.`
    : 'Carregando…';

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão geral do acompanhamento pós-operatório">
        <Button asChild size="sm">
          <Link href="/patients/new">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo paciente
          </Link>
        </Button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi, i) => (
          <Card
            key={kpi.label}
            className={cn('animate-fade-in hover:shadow-md transition-shadow', `stagger-${i + 1}`)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', kpi.bg)}>
                  <kpi.icon className={cn('h-5 w-5', kpi.color)} style={{ width: 20, height: 20 }} />
                </div>
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight">{kpi.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{kpi.label}</p>
              {kpi.hint && <p className="mt-0.5 text-xs text-muted-foreground/80">{kpi.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Summary Banner */}
      <Card className="overflow-hidden border-primary/20">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Activity className="h-5 w-5 text-primary" style={{ width: 20, height: 20 }} />
            </div>
            <div>
              <p className="text-sm font-semibold">Resumo de agora</p>
              <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/alertas">Ver alertas</Link>
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Weekly Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-semibold">Atividade semanal</CardTitle>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                Check-ins
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
                Alertas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
                Mensagens
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={weekly} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPacientes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorAlertas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorMensagens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '13px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="checkins"
                  name="Check-ins"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#colorPacientes)"
                />
                <Area
                  type="monotone"
                  dataKey="alertas"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  fill="url(#colorAlertas)"
                />
                <Area
                  type="monotone"
                  dataKey="mensagens"
                  stroke="hsl(var(--secondary))"
                  strokeWidth={2}
                  fill="url(#colorMensagens)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Upcoming Returns */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Próximos retornos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingEvents.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum retorno agendado.</p>
            )}
            {upcomingEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/50"
              >
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {/* 'YYYY-MM-DD' puro vira meia-noite UTC — no Brasil, o dia anterior. */}
                  <span className="text-xs font-semibold leading-none">
                    {new Date(`${event.date}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit' })}
                  </span>
                  <span className="text-[10px] leading-none">
                    {new Date(`${event.date}T00:00:00`).toLocaleDateString('pt-BR', { month: 'short' })}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {event.time} · {event.doctor}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Patients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-semibold">Atividade recente</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/patients">
              Ver todos
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentPatients.map((patient) => (
              <Link
                key={patient.id}
                href={`/patients/${patient.id}`}
                className="flex items-center gap-4 rounded-xl p-2.5 transition-colors hover:bg-accent/50"
              >
                <Avatar className="h-10 w-10 border">
                  <AvatarImage src={patient.photo} />
                  <AvatarFallback>
                    {patient.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{patient.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {patient.surgeryDate
                      ? `${patient.surgeryType} · Dia ${patient.currentDay}`
                      : 'Sem procedimento marcado'}
                  </p>
                </div>
                <div className="hidden sm:block">
                  {patient.status === 'alert' ? (
                    <StatusBadge status={patient.status} />
                  ) : (
                    <FunnelBadge stage={patient.funnelStatus} />
                  )}
                </div>
                <span className="hidden text-xs text-muted-foreground md:block">
                  {patient.lastUpdate}
                </span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
