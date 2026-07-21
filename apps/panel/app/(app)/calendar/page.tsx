'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Stethoscope, AlertTriangle, RotateCcw, Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CalendarEvent } from '@/lib/types';
import { getCalendarEvents } from '@/lib/queries';
import { cn } from '@/lib/utils';

const todayIso = new Date().toISOString().slice(0, 10);

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

  React.useEffect(() => {
    getCalendarEvents().then(setCalendarEvents).catch(() => {});
  }, []);

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
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Novo agendamento
        </Button>
      </PageHeader>

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
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(dateStr)}
                    className={cn(
                      'relative flex min-h-[80px] flex-col items-center rounded-lg border p-2 transition-all hover:shadow-sm',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-transparent hover:border-border'
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
