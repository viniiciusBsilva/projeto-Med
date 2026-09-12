import { cn } from '@/lib/utils';
import type { PatientStatus, RiskLevel, TimelineStepStatus } from '@/lib/types';
import { FUNNEL_LABELS } from '@/lib/queries';

/** Etapa do funil. Texto neutro e ponto colorido: as cores do funil são claras demais para texto. */
export function FunnelBadge({ stage }: { stage: string }) {
  const f = FUNNEL_LABELS[stage] ?? { label: stage, color: '#94a3b8' };
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: f.color }} />
      {f.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: PatientStatus }) {
  const config: Record<PatientStatus, { label: string; className: string; dot: string }> = {
    active: {
      label: 'Ativo',
      className: 'bg-success/10 text-success border-success/20',
      dot: 'bg-success',
    },
    alert: {
      label: 'Em Alerta',
      className: 'bg-destructive/10 text-destructive border-destructive/20',
      dot: 'bg-destructive',
    },
    completed: {
      label: 'Finalizado',
      className: 'bg-muted text-muted-foreground border-border',
      dot: 'bg-muted-foreground',
    },
    pending: {
      label: 'Pendente',
      className: 'bg-warning/10 text-warning border-warning/20',
      dot: 'bg-warning',
    },
  };
  const c = config[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        c.className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      {c.label}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const config: Record<RiskLevel, { label: string; className: string }> = {
    low: { label: 'Baixo Risco', className: 'bg-success/10 text-success' },
    medium: { label: 'Médio Risco', className: 'bg-warning/10 text-warning' },
    high: { label: 'Alto Risco', className: 'bg-destructive/10 text-destructive' },
  };
  const c = config[risk];
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', c.className)}>
      {c.label}
    </span>
  );
}

export function TimelineStatusBadge({ status }: { status: TimelineStepStatus }) {
  const config: Record<TimelineStepStatus, { label: string; className: string }> = {
    completed: { label: 'Concluído', className: 'bg-success/10 text-success' },
    pending: { label: 'Pendente', className: 'bg-muted text-muted-foreground' },
    overdue: { label: 'Em Atraso', className: 'bg-destructive/10 text-destructive' },
    current: { label: 'Atual', className: 'bg-primary/10 text-primary' },
  };
  const c = config[status];
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', c.className)}>
      {c.label}
    </span>
  );
}
