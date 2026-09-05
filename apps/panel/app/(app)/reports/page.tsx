'use client';

import * as React from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { FileText, FileSpreadsheet, Download, Users, Clock, AlertTriangle, Activity } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getProtocols, getWeeklyActivity, getReportStats, getFunnelDistribution } from '@/lib/queries';

export default function ReportsPage() {
  const [recoveryTimeData, setRecoveryTimeData] = React.useState<{ name: string; tempo: number; pacientes: number }[]>([]);
  const [funnelData, setFunnelData] = React.useState<{ name: string; value: number; color: string }[]>([]);
  const [weeklyChartData, setWeeklyChartData] = React.useState<{ day: string; pacientes: number; alertas: number; mensagens: number }[]>([]);
  const [summary, setSummary] = React.useState<{ totalPatients: number; avgRecoveryDays: number; alertsCount: number; protocolsCount: number } | null>(null);

  React.useEffect(() => {
    getProtocols().then((protocols) => {
      setRecoveryTimeData(protocols.map((p) => ({ name: p.name, tempo: p.duration, pacientes: p.patientCount })));
    });
    getFunnelDistribution().then(setFunnelData).catch(() => {});
    getWeeklyActivity().then(setWeeklyChartData);
    getReportStats().then(setSummary);
  }, []);

  const stats = [
    { label: 'Total de pacientes', value: String(summary?.totalPatients ?? 0), icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Tempo médio de recuperação', value: `${summary?.avgRecoveryDays ?? 0} dias`, icon: Clock, color: 'text-secondary', bg: 'bg-secondary/10' },
    { label: 'Alertas emitidos', value: String(summary?.alertsCount ?? 0), icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Protocolos ativos', value: String(summary?.protocolsCount ?? 0), icon: Activity, color: 'text-warning', bg: 'bg-warning/10' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" description="Análise completa do acompanhamento pós-operatório">
        <Button variant="outline" size="sm">
          <FileSpreadsheet className="mr-1.5 h-4 w-4" />
          Exportar Excel
        </Button>
        <Button size="sm">
          <FileText className="mr-1.5 h-4 w-4" />
          Exportar PDF
        </Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={stat.label} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
            <CardContent className="p-5">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} style={{ width: 20, height: 20 }} />
              </div>
              <p className="mt-4 text-2xl font-bold">{stat.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recovery Time by Surgery */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Tempo médio de recuperação por cirurgia</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100" height={300}>
              <BarChart data={recoveryTimeData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  angle={-20}
                  textAnchor="end"
                  height={60}
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
                <Bar dataKey="tempo" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Dias" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribuição do funil — com um procedimento só, é o que varia. */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Pacientes por etapa do funil</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100" height={300}>
              <PieChart>
                <Pie
                  data={funnelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {funnelData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '13px',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Activity */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Atividade semanal — pacientes vs. alertas</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100" height={280}>
            <BarChart data={weeklyChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
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
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="pacientes" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Pacientes" />
              <Bar dataKey="alertas" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} name="Alertas" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Exportar relatórios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ExportCard
              icon={FileText}
              title="Relatório completo (PDF)"
              description="Todos os dados de acompanhamento em formato PDF"
              color="text-destructive"
              bg="bg-destructive/10"
            />
            <ExportCard
              icon={FileSpreadsheet}
              title="Dados em planilha (Excel)"
              description="Métricas e indicadores para análise detalhada"
              color="text-success"
              bg="bg-success/10"
            />
            <ExportCard
              icon={Download}
              title="Histórico de pacientes (CSV)"
              description="Lista completa para importação em outros sistemas"
              color="text-primary"
              bg="bg-primary/10"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExportCard({
  icon: Icon,
  title,
  description,
  color,
  bg,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border p-4 transition-all hover:shadow-md">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} style={{ width: 20, height: 20 }} />
      </div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 flex-1 text-xs text-muted-foreground">{description}</p>
      <Button variant="outline" size="sm" className="mt-3 w-full">
        <Download className="mr-1.5 h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
        Baixar
      </Button>
    </div>
  );
}
