'use client';

// Fila de trabalho da equipe. Quando o agente escala (tool `raise_alert`, ou a
// triagem automática do trigger `checkin_triage`), ele PAUSA a si mesmo naquela
// conversa. Sem esta tela, o alerta fica invisível e o paciente espera uma
// resposta que nunca chega.

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, BotOff, Check, MessageSquare, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AlertItem } from '@/lib/types';
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

export default function AlertasPage() {
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [resolving, setResolving] = React.useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertas"
        description="Situações em que o assistente parou e passou o atendimento para a equipe"
      />

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && alerts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ShieldCheck className="h-8 w-8 text-success" style={{ width: 32, height: 32 }} />
            <p className="text-sm font-medium">Nenhum alerta aberto</p>
            <p className="text-xs text-muted-foreground">
              Quando o assistente identificar um sinal de alerta, ele aparece aqui e a IA é pausada
              naquela conversa.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {alerts.map((alert) => {
          const sev = SEVERITY[alert.severity];
          return (
            <Card key={alert.id} className={cn(sev.card)}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
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

                  <p className="text-sm text-muted-foreground">{alert.reason}</p>

                  {alert.aiPaused && (
                    <p className="flex items-center gap-1.5 text-xs text-warning">
                      <BotOff className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                      Assistente pausado nesta conversa — reative pelo chat depois de responder
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
