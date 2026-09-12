'use client';

// Configura quando a clínica atende. O agente do WhatsApp só oferece horários
// dentro destes intervalos, fora dos dias bloqueados e sem conflito com a agenda.

import * as React from 'react';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TimeInput } from '@/components/ui/time-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SLOT_OPTIONS,
  WEEKDAYS,
  sortIntervals,
  validateAvailability,
  type ClinicAvailability,
  type TimeInterval,
} from '@/lib/availability';
import { saveAvailability } from '@/lib/queries';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface AvailabilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ClinicAvailability;
  onSaved: (availability: ClinicAvailability) => void;
}

export function AvailabilityDialog({ open, onOpenChange, value, onSaved }: AvailabilityDialogProps) {
  const [draft, setDraft] = React.useState<ClinicAvailability>(value);
  const [newBlock, setNewBlock] = React.useState({ date: '', reason: '' });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reabrir descarta o rascunho: parte sempre do que está salvo.
  React.useEffect(() => {
    if (open) {
      setDraft(JSON.parse(JSON.stringify(value)));
      setNewBlock({ date: '', reason: '' });
      setError(null);
    }
  }, [open, value]);

  const setDay = (key: string, intervals: TimeInterval[]) =>
    setDraft((d) => ({ ...d, weekly: { ...d.weekly, [key]: intervals } }));

  const updateInterval = (key: string, index: number, patch: Partial<TimeInterval>) =>
    setDay(key, (draft.weekly[key] ?? []).map((iv, i) => (i === index ? { ...iv, ...patch } : iv)));

  const today = todayStr();
  const upcomingBlocks = draft.blocked_dates
    .filter((b) => b.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const blockExists = draft.blocked_dates.some((b) => b.date === newBlock.date);

  const addBlock = () => {
    if (!newBlock.date || blockExists) return;
    const reason = newBlock.reason.trim();
    setDraft((d) => ({
      ...d,
      blocked_dates: [...d.blocked_dates, reason ? { date: newBlock.date, reason } : { date: newBlock.date }],
    }));
    setNewBlock({ date: '', reason: '' });
  };

  const handleSave = async () => {
    const problem = validateAvailability(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    // Dia bloqueado que já passou não serve para nada; sai no salvamento.
    const clean = sortIntervals({ ...draft, blocked_dates: upcomingBlocks });
    try {
      await saveAvailability(clean);
      onSaved(clean);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a disponibilidade.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Disponibilidade para atendimento</DialogTitle>
          <DialogDescription>
            O assistente do WhatsApp só oferece horários dentro destes períodos. Agendamentos já
            marcados não mudam.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-1">
          <div className="space-y-2">
            <Label htmlFor="slot-minutes">Duração de cada atendimento</Label>
            <Select
              value={String(draft.slot_minutes)}
              onValueChange={(v) => setDraft((d) => ({ ...d, slot_minutes: Number(v) }))}
            >
              <SelectTrigger id="slot-minutes" className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m < 60 ? `${m} minutos` : m === 60 ? '1 hora' : `${m / 60} horas`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Também é o intervalo entre os horários oferecidos (ex.: 30 min → 9:00, 9:30, 10:00…).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Dias e horários</Label>
            <div className="divide-y rounded-xl border">
              {WEEKDAYS.map(({ key, label }) => {
                const intervals = draft.weekly[key] ?? [];
                const open = intervals.length > 0;
                return (
                  <div key={key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                    <div className="flex w-36 shrink-0 items-center gap-2 pt-1.5">
                      <Switch
                        id={`day-${key}`}
                        checked={open}
                        onCheckedChange={(on) => setDay(key, on ? [{ start: '09:00', end: '18:00' }] : [])}
                      />
                      <Label htmlFor={`day-${key}`} className="text-sm font-medium">
                        {label}
                      </Label>
                    </div>

                    <div className="flex-1 space-y-2">
                      {!open && <p className="pt-2 text-sm text-muted-foreground">Sem atendimento</p>}
                      {intervals.map((iv, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <TimeInput
                            value={iv.start}
                            onChange={(v) => updateInterval(key, i, { start: v })}
                            className="h-9"
                            aria-label={`${label}: início`}
                          />
                          <span className="text-sm text-muted-foreground">até</span>
                          <TimeInput
                            value={iv.end}
                            onChange={(v) => updateInterval(key, i, { end: v })}
                            className="h-9"
                            aria-label={`${label}: fim`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            onClick={() => setDay(key, intervals.filter((_, j) => j !== i))}
                            title="Remover intervalo"
                          >
                            <Trash2 className="h-4 w-4" style={{ width: 16, height: 16 }} />
                          </Button>
                        </div>
                      ))}
                      {open && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          // Uso mais comum: a pausa do almoço divide o dia em dois.
                          onClick={() =>
                            setDay(key, [...intervals, { start: intervals[intervals.length - 1]?.end ?? '14:00', end: '18:00' }])
                          }
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                          Adicionar intervalo
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dias sem atendimento</Label>
            <p className="text-xs text-muted-foreground">Feriados, folgas e férias. Vale o dia inteiro.</p>
            {upcomingBlocks.length > 0 && (
              <div className="divide-y rounded-xl border">
                {upcomingBlocks.map((b) => (
                  <div key={b.date} className="flex items-center gap-3 px-3 py-2">
                    <CalendarOff className="h-4 w-4 shrink-0 text-muted-foreground" style={{ width: 16, height: 16 }} />
                    <span className="text-sm font-medium">
                      {new Date(`${b.date}T00:00:00`).toLocaleDateString('pt-BR', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{b.reason}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setDraft((d) => ({ ...d, blocked_dates: d.blocked_dates.filter((x) => x.date !== b.date) }))
                      }
                      title="Remover bloqueio"
                    >
                      <Trash2 className="h-4 w-4" style={{ width: 16, height: 16 }} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                min={today}
                value={newBlock.date}
                onChange={(e) => setNewBlock((n) => ({ ...n, date: e.target.value }))}
                className="h-9 w-40"
                aria-label="Data sem atendimento"
              />
              <Input
                value={newBlock.reason}
                onChange={(e) => setNewBlock((n) => ({ ...n, reason: e.target.value }))}
                placeholder="Motivo (opcional)"
                className="h-9 min-w-0 flex-1"
                aria-label="Motivo"
              />
              <Button type="button" variant="outline" size="sm" onClick={addBlock} disabled={!newBlock.date || blockExists}>
                <Plus className="mr-1 h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                Bloquear dia
              </Button>
            </div>
            {blockExists && <p className="text-xs text-muted-foreground">Esse dia já está bloqueado.</p>}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar disponibilidade'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
