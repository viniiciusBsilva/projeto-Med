'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Stethoscope, AlertTriangle, RotateCcw, Plus, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CalendarEvent, Patient, Doctor } from '@/lib/types';
import { getCalendarEvents, getPatients, getDoctors, createAppointment, getAvailability } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { describeDay, type ClinicAvailability } from '@/lib/availability';
import { AvailabilityDialog } from '@/components/availability-dialog';
import { TimeInput } from '@/components/ui/time-input';

// Data local no formato YYYY-MM-DD (evita o off-by-one do toISOString(), que usa UTC).
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayIso = toDateStr(new Date());

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const eventTypeConfig: Record<CalendarEvent['type'], { label: string; color: string; bg: string; icon: React.ElementType }> = {
  return: { label: 'Retorno', color: 'text-primary', bg: 'bg-primary/10', icon: RotateCcw },
  consultation: { label: 'Consulta', color: 'text-secondary', bg: 'bg-secondary/10', icon: Stethoscope },
  surgery: { label: 'Cirurgia', color: 'text-warning', bg: 'bg-warning/10', icon: User },
  alert: { label: 'Alerta', color: 'text-destructive', bg: 'bg-destructive/10', icon: AlertTriangle },
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedDate, setSelectedDate] = React.useState<string | null>(todayIso);
  const [calendarEvents, setCalendarEvents] = React.useState<CalendarEvent[]>([]);
  // Quando a clínica atende — é o que o agente do WhatsApp oferece aos pacientes.
  const [availability, setAvailability] = React.useState<ClinicAvailability | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = React.useState(false);

  // Modal "Novo agendamento"
  const [open, setOpen] = React.useState(false);
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [doctors, setDoctors] = React.useState<Doctor[]>([]);
  const [apPatient, setApPatient] = React.useState('');
  const [apDoctor, setApDoctor] = React.useState('');
  const [apType, setApType] = React.useState<'return' | 'consultation'>('return');
  const [apTitle, setApTitle] = React.useState('');
  const [apDate, setApDate] = React.useState(selectedDate ?? todayIso);
  const [apTime, setApTime] = React.useState('09:00');
  const [apPhase, setApPhase] = React.useState<'none' | 'preop' | 'postop'>('none');
  const [apPhaseStart, setApPhaseStart] = React.useState(selectedDate ?? todayIso);
  const [apPhaseEnd, setApPhaseEnd] = React.useState('');
  const [apSubmitting, setApSubmitting] = React.useState(false);
  const [apError, setApError] = React.useState<string | null>(null);

  const refreshEvents = React.useCallback(() => {
    getCalendarEvents().then(setCalendarEvents).catch(() => {});
  }, []);

  React.useEffect(() => {
    refreshEvents();
    getPatients().then(setPatients).catch(() => {});
    getDoctors(true).then(setDoctors).catch(() => {});
    getAvailability().then(setAvailability).catch(() => {});
  }, [refreshEvents]);

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setApError(null);
    if (!apPatient || !apDoctor) {
      setApError('Selecione o paciente e o médico.');
      return;
    }
    if (apPhase !== 'none') {
      if (!apPhaseStart || !apPhaseEnd) {
        setApError('Informe o período (início e fim) da fase.');
        return;
      }
      if (apPhaseEnd < apPhaseStart) {
        setApError('O fim da fase deve ser igual ou após o início.');
        return;
      }
    }
    const patientName = patients.find((p) => p.id === apPatient)?.name ?? 'Paciente';
    const title = apTitle.trim() || `${apType === 'return' ? 'Retorno' : 'Consulta'} - ${patientName}`;
    setApSubmitting(true);
    try {
      await createAppointment({
        patientId: apPatient,
        doctorId: apDoctor,
        title,
        type: apType,
        scheduledAt: new Date(`${apDate}T${apTime}:00`).toISOString(),
        phase: apPhase === 'none' ? null : apPhase,
        phaseStart: apPhase === 'none' ? null : apPhaseStart,
        phaseEnd: apPhase === 'none' ? null : apPhaseEnd,
      });
      setOpen(false);
      setApPatient('');
      setApDoctor('');
      setApTitle('');
      setApPhase('none');
      refreshEvents();
    } catch (err) {
      setApError(err instanceof Error ? err.message : 'Erro ao agendar.');
    } finally {
      setApSubmitting(false);
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const getDateString = (day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getEventsForDate = (dateStr: string) => calendarEvents.filter((e) => e.date === dateStr);
  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="space-y-6">
      <PageHeader title="Agenda" description="Retornos, consultas, cirurgias e alertas">
        <Button size="sm" variant="outline" onClick={() => setAvailabilityOpen(true)} disabled={!availability}>
          <Settings2 className="mr-1.5 h-4 w-4" />
          Disponibilidade
        </Button>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            // Ao abrir, o campo de data assume o dia selecionado no calendário (não o "hoje" do mount).
            if (o) setApDate(selectedDate ?? todayIso);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Novo agendamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo agendamento</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAppointment} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="ap-patient">Paciente</Label>
                <Select value={apPatient} onValueChange={setApPatient}>
                  <SelectTrigger id="ap-patient">
                    <SelectValue placeholder="Selecione o paciente" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ap-doctor">Médico</Label>
                <Select value={apDoctor} onValueChange={setApDoctor}>
                  <SelectTrigger id="ap-doctor">
                    <SelectValue placeholder="Selecione o médico" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhum médico ativo. Cadastre em Médicos.
                      </div>
                    )}
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ap-type">Tipo</Label>
                  <Select value={apType} onValueChange={(v) => setApType(v as 'return' | 'consultation')}>
                    <SelectTrigger id="ap-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="return">Retorno</SelectItem>
                      <SelectItem value="consultation">Consulta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ap-date">Data</Label>
                  <Input id="ap-date" type="date" value={apDate} onChange={(e) => setApDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ap-time">Hora</Label>
                  <TimeInput id="ap-time" value={apTime} onChange={setApTime} className="w-full justify-center" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ap-phase">Fase (opcional)</Label>
                <Select
                  value={apPhase}
                  onValueChange={(v) => {
                    const p = v as 'none' | 'preop' | 'postop';
                    setApPhase(p);
                    if (p !== 'none' && !apPhaseEnd) {
                      const start = apDate || todayIso;
                      setApPhaseStart(start);
                      const d = new Date(`${start}T00:00:00`);
                      d.setDate(d.getDate() + 30);
                      setApPhaseEnd(toDateStr(d));
                    }
                  }}
                >
                  <SelectTrigger id="ap-phase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    <SelectItem value="preop">Pré-operatório</SelectItem>
                    <SelectItem value="postop">Pós-operatório</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {apPhase !== 'none' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="ap-phase-start">Início da fase</Label>
                      <Input
                        id="ap-phase-start"
                        type="date"
                        value={apPhaseStart}
                        onChange={(e) => setApPhaseStart(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ap-phase-end">Fim da fase</Label>
                      <Input
                        id="ap-phase-end"
                        type="date"
                        value={apPhaseEnd}
                        onChange={(e) => setApPhaseEnd(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Durante o período, o paciente recebe um lembrete diário do checklist no app.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="ap-title">Título (opcional)</Label>
                <Input
                  id="ap-title"
                  placeholder="Ex: Retorno D+15"
                  value={apTitle}
                  onChange={(e) => setApTitle(e.target.value)}
                />
              </div>
              {apError && <p className="text-sm text-destructive">{apError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={apSubmitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={apSubmitting}>
                  {apSubmitting ? 'Agendando...' : 'Agendar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {availability && (
        <AvailabilityDialog
          open={availabilityOpen}
          onOpenChange={setAvailabilityOpen}
          value={availability}
          onSaved={setAvailability}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <CalendarIcon className="h-4 w-4" style={{ width: 16, height: 16 }} />
              {monthNames[month]} {year}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" style={{ width: 16, height: 16 }} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" style={{ width: 16, height: 16 }} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="mb-2 grid grid-cols-7 gap-1">
              {dayNames.map((day) => (
                <div key={day} className="py-2 text-center text-xs font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, i) => {
                if (day === null) return <div key={i} />;
                const dateStr = getDateString(day);
                const events = getEventsForDate(dateStr);
                const isSelected = selectedDate === dateStr;
                const isToday = dateStr === todayIso;
                const dayInfo = availability ? describeDay(availability, dateStr) : null;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(dateStr)}
                    title={dayInfo?.text}
                    className={cn(
                      'relative flex min-h-[80px] flex-col items-center rounded-lg border p-2 transition-all hover:shadow-sm',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-transparent hover:border-border',
                      // Dia sem atendimento (fim de semana, feriado, folga): o agente não oferece.
                      dayInfo && !dayInfo.open && !isSelected && 'bg-muted/50 text-muted-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium',
                        isToday && 'bg-primary text-primary-foreground'
                      )}
                    >
                      {day}
                    </span>
                    {events.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap justify-center gap-0.5">
                        {events.slice(0, 3).map((e) => {
                          const config = eventTypeConfig[e.type];
                          return (
                            <span
                              key={e.id}
                              className={cn('h-1.5 w-1.5 rounded-full', config.color.replace('text-', 'bg-'))}
                            />
                          );
                        })}
                        {events.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{events.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3 border-t pt-4">
              {Object.entries(eventTypeConfig).map(([key, config]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={cn('h-2.5 w-2.5 rounded-full', config.color.replace('text-', 'bg-'))} />
                  <span className="text-xs text-muted-foreground">{config.label}</span>
                </div>
              ))}
              {availability && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border bg-muted" />
                  <span className="text-xs text-muted-foreground">Sem atendimento</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Day Events */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">
              {selectedDate
                ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
                : 'Selecione um dia'}
            </CardTitle>
            {selectedDate && availability && (
              <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                {describeDay(availability, selectedDate).text}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {selectedEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <CalendarIcon className="h-6 w-6 text-muted-foreground" style={{ width: 24, height: 24 }} />
                </div>
                <p className="mt-3 text-sm font-medium">Nenhum agendamento</p>
                <p className="mt-1 text-xs text-muted-foreground">Não há eventos neste dia</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((event) => {
                  const config = eventTypeConfig[event.type];
                  return (
                    <div
                      key={event.id}
                      className="flex gap-3 rounded-xl border p-3 transition-colors hover:bg-accent/50 animate-fade-in"
                    >
                      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', config.bg)}>
                        <config.icon className={cn('h-5 w-5', config.color)} style={{ width: 20, height: 20 }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{event.title}</p>
                          <Badge variant="outline" className={cn('text-xs', config.color)}>
                            {config.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" style={{ width: 12, height: 12 }} />
                          {event.time}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{event.doctor}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
