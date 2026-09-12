'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search, Filter, Users, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusBadge, RiskBadge, FunnelBadge } from '@/components/status-badges';
import type { Patient, PatientStatus } from '@/lib/types';
import { getPatients, getCurrentProfile } from '@/lib/queries';
import { cn } from '@/lib/utils';

const filters: { label: string; value: PatientStatus | 'all'; icon: React.ElementType }[] = [
  { label: 'Todos', value: 'all', icon: Users },
  { label: 'Ativos', value: 'active', icon: Clock },
  { label: 'Em Alerta', value: 'alert', icon: AlertTriangle },
  { label: 'Finalizados', value: 'completed', icon: CheckCircle2 },
];

export default function PatientsPage() {
  const [search, setSearch] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState<PatientStatus | 'all'>('all');
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSuperadmin, setIsSuperadmin] = React.useState(false);
  // Todo "oi" no WhatsApp gera um registro; só vira paciente quem confirmou um
  // agendamento (o trigger do banco tira do funil 'lead' nesse momento).
  const [group, setGroup] = React.useState<'patients' | 'contacts'>('patients');

  React.useEffect(() => {
    getPatients()
      .then(setPatients)
      .finally(() => setLoading(false));
    getCurrentProfile().then((p) => setIsSuperadmin(!!p?.isSuperadmin)).catch(() => {});
  }, []);

  const isContact = (p: Patient) => p.funnelStatus === 'lead';
  const contactsCount = patients.filter(isContact).length;
  const inGroup = patients.filter((p) => (group === 'contacts') === isContact(p));

  const filtered = inGroup.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.surgeryType.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = activeFilter === 'all' || p.status === activeFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pacientes"
        description="Paciente é quem confirmou um agendamento. Contatos do WhatsApp ficam à parte até agendar."
      >
        <Button asChild size="sm">
          <Link href="/patients/new">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo paciente
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {[
          { value: 'patients' as const, label: `Pacientes (${patients.length - contactsCount})` },
          { value: 'contacts' as const, label: `Contatos do WhatsApp (${contactsCount})` },
        ].map((g) => (
          <button
            key={g.value}
            onClick={() => {
              setGroup(g.value);
              setActiveFilter('all');
            }}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-all',
              group === g.value
                ? 'bg-primary text-primary-foreground'
                : 'border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {filters.map((f) => {
          const count =
            f.value === 'all'
              ? inGroup.length
              : inGroup.filter((p) => p.status === f.value).length;
          return (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-sm',
                activeFilter === f.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'bg-card hover:border-border'
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg',
                  f.value === 'alert'
                    ? 'bg-destructive/10 text-destructive'
                    : f.value === 'completed'
                    ? 'bg-success/10 text-success'
                    : f.value === 'active'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <f.icon className="h-5 w-5" style={{ width: 20, height: 20 }} />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{count}</p>
                <p className="mt-1 text-xs text-muted-foreground">{f.label}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou tipo de cirurgia..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Patient List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Carregando pacientes...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Users className="h-8 w-8 text-muted-foreground" style={{ width: 32, height: 32 }} />
              </div>
              <p className="mt-4 text-sm font-medium">
                {inGroup.length > 0
                  ? 'Nenhum resultado'
                  : group === 'contacts'
                    ? 'Nenhum contato aguardando agendamento'
                    : 'Nenhum paciente ainda'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {inGroup.length > 0
                  ? 'Tente ajustar a busca ou os filtros'
                  : group === 'contacts'
                    ? 'Quem escreve no WhatsApp aparece aqui até confirmar um agendamento.'
                    : 'Contatos viram pacientes ao confirmar um agendamento.'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((patient, i) => (
                <Link
                  key={patient.id}
                  href={`/patients/${patient.id}`}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-accent/50 animate-fade-in"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <Avatar className="h-12 w-12 border">
                    <AvatarImage src={patient.photo} />
                    <AvatarFallback>
                      {patient.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{patient.name}</p>
                      {/* "Ativo" dizia o mesmo de um lead e de um operado; o funil diferencia. */}
                      <FunnelBadge stage={patient.funnelStatus} />
                      {patient.status !== 'active' && <StatusBadge status={patient.status} />}
                      {isSuperadmin && patient.clinicName && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {patient.clinicName}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {[
                        patient.surgeryDate
                          ? `${patient.surgeryType} · Dia ${patient.currentDay}`
                          : 'Sem procedimento marcado',
                        patient.doctor,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="hidden md:block">
                    <RiskBadge risk={patient.risk} />
                  </div>
                  <div className="hidden text-right lg:block">
                    <p className="text-xs text-muted-foreground">Última atualização</p>
                    <p className="text-sm font-medium">{patient.lastUpdate}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
