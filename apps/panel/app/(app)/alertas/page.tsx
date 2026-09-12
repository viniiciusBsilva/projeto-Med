'use client';

// Fila de trabalho da equipe. Dois tipos de entrada:
// - clínico: triagem automática do check-in (`checkin_triage`) ou `raise_alert`
//   do agente, que se pausa naquela conversa;
// - atendimento: o que a IA não resolveu sozinha — dúvida fora do FAQ, agenda
//   sem vaga, pedido de atendente, falha técnica. A IA segue atendendo, mas o
//   paciente espera a resposta da equipe sobre aquele ponto.
// Sem esta tela, o alerta fica invisível e o paciente espera uma resposta que
// nunca chega.

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BotOff,
  CalendarX,
  Check,
  HelpCircle,
  MessageSquare,
  Paperclip,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AlertItem, AlertKind } from '@/lib/types';
import { getOpenAlerts, resolveAlert, relativeTime } from '@/lib/queries';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const SEVERITY: Record<AlertItem['severity'], { label: string; badge: string; card: string }> = {
  critical: {
    label: 'Crítico',
    badge: 'bg-destructive text-destructive-foreground hover:bg-destructive',
    card: 'border-destructive/40',
  },
  high: {
    label: 'Alto',
    badge: 'bg-warning text-warning-foreground hover:bg-warning',
    card: 'border-warning/40',
  },
  medium: { label: 'Médio', badge: 'bg-muted text-muted-foreground hover:bg-muted', card: '' },
};

const KIND: Record<AlertKind, { label: string; icon: React.ElementType }> = {
  clinical: { label: 'Clínico', icon: Stethoscope },
  question: { label: 'Dúvida sem resposta', icon: HelpCircle },
  scheduling: { label: 'Agendamento', icon: CalendarX },
  handoff: { label: 'Aguarda a equipe', icon: UserRound },
  technical: { label: 'Falha técnica', icon: Wrench },
  review: { label: 'Arquivo para o médico', icon: Paperclip },
};

type Filter = 'all' | 'clinical' | 'service';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'clinical', label: 'Clínicos' },
  { value: 'service', label: 'Atendimento' },
];

function matches(alert: AlertItem, filter: Filter) {
  if (filter === 'all') return true;
  return filter === 'clinical' ? alert.kind === 'clinical' : alert.kind !== 'clinical';
}

export default function AlertasPage() {
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [resolving, setResolving] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Filter>('all');

  const load = React.useCallback(
    () => getOpenAlerts().then(setAlerts).catch(() => {}),
    [],
  );

  React.useEffect(() => {
    load().finally(() => setLoading(false));

    // O alerta nasce de uma conversa que ninguém está olhando — precisa aparecer
    // sozinho na tela.
    const supabase = createClient();
    const channel = supabase
      .channel('alerts-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const handleResolve = async (id: string) => {
    setResolving(id);
    // Otimista: o realtime confirma em seguida.
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await resolveAlert(id);
    } catch {
      await load();
    } finally {
      setResolving(null);
    }
  };

  const visible = alerts.filter((a) => matches(a, filter));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas"
        description="Sinais clínicos e atendimentos que o assistente não conseguiu resolver sozinho"
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = alerts.filter((a) => matches(a, f.value)).length;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-all',
                filter === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'border bg-card text-muted-foreground hover:bg-accent',
              )}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && alerts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ShieldCheck className="h-8 w-8 text-success" style={{ width: 32, height: 32 }} />
            <p className="text-sm font-medium">Nenhum alerta aberto</p>
            <p className="text-xs text-muted-foreground">
              Quando o assistente identificar um sinal clínico ou não conseguir resolver um
              atendimento, ele aparece aqui.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && alerts.length > 0 && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum alerta neste filtro.</p>
      )}

      <div className="space-y-3">
        {visible.map((alert) => {
          const sev = SEVERITY[alert.severity];
          const kind = KIND[alert.kind] ?? KIND.clinical;
          return (
            <Card key={alert.id} className={cn(sev.card)}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1 text-xs">
                      <kind.icon className="h-3 w-3" style={{ width: 12, height: 12 }} />
                      {kind.label}
                    </Badge>
                    <Badge className={sev.badge}>{sev.label}</Badge>
                    <span className="text-sm font-semibold">{alert.patientName}</span>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(alert.createdAt)}
                    </span>
                    {alert.fromCheckin && (
                      <Badge variant="outline" className="text-xs">
                        triagem de sintomas
                      </Badge>
                    )}
                  </div>

                  {/* Casos repetidos do mesmo tipo entram no mesmo alerta, um por linha. */}
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{alert.reason}</p>

                  {alert.aiPaused && (
                    <p className="flex items-center gap-1.5 text-xs text-warning">
                      <BotOff className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                      Assistente pausado nesta conversa — reative pelo chat depois de responder
                    </p>
                  )}
                  {alert.aiPaused === false && alert.kind !== 'clinical' && (
                    <p className="text-xs text-muted-foreground">
                      O assistente segue atendendo; responda este ponto pelo chat.
                    </p>
                  )}
                  {alert.aiPaused === null && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                      Paciente sem conversa de WhatsApp
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/messages?patient=${alert.patientId}`}>
                      <MessageSquare className="mr-1.5 h-4 w-4" style={{ width: 16, height: 16 }} />
                      Abrir conversa
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleResolve(alert.id)}
                    disabled={resolving === alert.id}
                  >
                    <Check className="mr-1.5 h-4 w-4" style={{ width: 16, height: 16 }} />
                    Resolver
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
