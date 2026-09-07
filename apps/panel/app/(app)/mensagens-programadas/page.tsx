'use client';

// Editor das mensagens que saem sozinhas, ancoradas na data do procedimento.
// É a tela que destrava o produto: enquanto uma mensagem estiver com o
// placeholder, a Edge Function `wa-send` se recusa a enviá-la ao paciente — de
// propósito, para nunca mandar "[TEXTO A DEFINIR PELO MÉDICO]" para alguém em
// pós-operatório.
//
// No banco isso vive em `protocols` / `protocol_steps`. O nome técnico
// ("protocolo") ficou só na camada de dados: na interface, "protocolo" é
// ambíguo para um médico, que pensa em técnica cirúrgica ou esquema de
// medicação — não numa régua de mensagens.

import * as React from 'react';
import { AlertTriangle, Check, Clock, Lightbulb, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
import type { ProtocolStep, DispatchSummary } from '@/lib/types';
import {
  getProtocolSteps,
  updateProtocolStep,
  createProtocolStep,
  deleteProtocolStep,
  phaseForDay,
  getDispatchSummary,
  reprocessDispatches,
  getCareTipSuggestions,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

const PHASE_LABEL: Record<string, string> = {
  preop: 'Pré-operatório',
  postop: 'Pós-operatório',
  followup: 'Acompanhamento',
};

export default function MensagensProgramadasPage() {
  const [steps, setSteps] = React.useState<ProtocolStep[]>([]);
  const [dispatch, setDispatch] = React.useState<DispatchSummary | null>(null);
  const [tips, setTips] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reprocessing, setReprocessing] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(() => {
    return Promise.all([getProtocolSteps(), getDispatchSummary()]).then(([s, d]) => {
      setSteps(s);
      setDispatch(d);
    });
  }, []);

  React.useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
    getCareTipSuggestions().then(setTips).catch(() => {});
  }, [load]);

  const pending = steps.filter((s) => s.pending).length;

  const handleReprocess = async () => {
    setReprocessing(true);
    setNotice(null);
    try {
      const n = await reprocessDispatches();
      await load();
      setNotice(
        n === 0
          ? 'Nenhum procedimento ativo para reprocessar.'
          : `${n} procedimento(s) reprocessado(s). As mensagens pendentes voltaram para a fila.`,
      );
    } catch {
      setNotice('Não foi possível reprocessar. Tente de novo.');
    } finally {
      setReprocessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mensagens programadas"
        description="O que o assistente envia sozinho a cada dia, contado a partir da data do procedimento"
      >
        <Button size="sm" variant="outline" onClick={handleReprocess} disabled={reprocessing}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', reprocessing && 'animate-spin')} />
          Reprocessar pendentes
        </Button>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nova mensagem
        </Button>
      </PageHeader>

      <NewStepDialog
        open={creating}
        onOpenChange={setCreating}
        diasUsados={steps.map((s) => s.dayOffset)}
        onCreated={load}
      />

      {notice && (
        <div className="rounded-xl border bg-muted/50 px-4 py-3 text-sm">{notice}</div>
      )}

      {/* Sem texto escrito, o envio automático é decorativo — deixar isso na cara. */}
      {!loading && pending > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" style={{ width: 20, height: 20 }} />
          <div className="text-sm">
            <p className="font-medium text-warning">
              {pending} {pending === 1 ? 'mensagem ainda sem texto' : 'mensagens ainda sem texto'}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Enquanto o texto não for escrito, essa mensagem <strong>não é enviada</strong> ao
              paciente. Depois de escrever, use <em>Reprocessar pendentes</em> para devolvê-la à fila.
            </p>
          </div>
        </div>
      )}

      {dispatch && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Agendados', value: dispatch.scheduled, icon: Clock, tone: 'text-primary' },
            { label: 'Enviados', value: dispatch.sent, icon: Check, tone: 'text-success' },
            { label: 'Falharam', value: dispatch.failed, icon: AlertTriangle, tone: 'text-destructive' },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <s.icon className={cn('h-5 w-5', s.tone)} style={{ width: 20, height: 20 }} />
                <div>
                  <p className="text-xl font-semibold leading-none">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && steps.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Clock className="h-8 w-8 text-muted-foreground" style={{ width: 32, height: 32 }} />
            <div>
              <p className="text-sm font-medium">Nenhuma mensagem programada</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Crie a primeira e ela passa a ser enviada sozinha, contada a partir da data do
                procedimento de cada paciente.
              </p>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nova mensagem
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {steps.map((step) => (
          <StepCard key={step.id} step={step} tips={tips} onSaved={load} />
        ))}
      </div>
    </div>
  );
}

function StepCard({
  step,
  tips,
  onSaved,
}: {
  step: ProtocolStep;
  tips: string[];
  onSaved: () => Promise<unknown>;
}) {
  const [body, setBody] = React.useState(step.pending ? '' : step.body);
  const [sendTime, setSendTime] = React.useState(step.sendTime);
  const [active, setActive] = React.useState(step.active);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [showTips, setShowTips] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const dirty = body !== (step.pending ? '' : step.body) || sendTime !== step.sendTime || active !== step.active;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProtocolStep(step.id, { body: body.trim(), sendTime, active });
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // A mensagem que explica a queda dos fios antes do paciente entrar em pânico
  // merece destaque. O DIA é decisão do médico, não nossa: o CLAUDE.md supunha
  // D+60, mas o protocolo real desta clínica usa D+30. Por isso reconhecemos
  // pelo título que o próprio médico escreveu, não por um dia fixo no código.
  const isShockLoss = step.title.toLowerCase().includes('shock loss');

  return (
    <Card className={cn(step.pending && 'border-warning/40', !active && 'opacity-60')}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <div className="flex items-center gap-2.5">
          <Badge variant="outline" className="font-mono text-xs">
            {step.label}
          </Badge>
          <CardTitle className="text-sm font-semibold">{step.title}</CardTitle>
          {step.phase && (
            <span className="text-xs text-muted-foreground">{PHASE_LABEL[step.phase]}</span>
          )}
          {isShockLoss && (
            <Badge className="bg-primary/10 text-primary hover:bg-primary/10">shock loss</Badge>
          )}
          {step.pending && (
            <Badge variant="outline" className="border-warning/40 text-warning">
              sem texto
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`active-${step.id}`} className="text-xs text-muted-foreground">
            Ativo
          </Label>
          <Switch id={`active-${step.id}`} checked={active} onCheckedChange={setActive} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            title="Excluir esta mensagem"
          >
            <Trash2 className="h-4 w-4" style={{ width: 16, height: 16 }} />
          </Button>
        </div>
      </CardHeader>

      <DeleteStepDialog
        step={step}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onDeleted={onSaved}
      />

      <CardContent className="space-y-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Mensagem que o paciente vai receber no WhatsApp neste dia…"
          className="min-h-[90px]"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" style={{ width: 16, height: 16 }} />
            <Label htmlFor={`time-${step.id}`} className="text-xs text-muted-foreground">
              Horário
            </Label>
            <Input
              id={`time-${step.id}`}
              type="time"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              className="h-8 w-28"
            />
          </div>

          <div className="flex items-center gap-2">
            {tips.length > 0 && step.phase === 'postop' && (
              <Button variant="ghost" size="sm" onClick={() => setShowTips((v) => !v)}>
                <Lightbulb className="mr-1.5 h-4 w-4" style={{ width: 16, height: 16 }} />
                Sugestões
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saved ? (
                <Check className="mr-1.5 h-4 w-4" style={{ width: 16, height: 16 }} />
              ) : (
                <Save className="mr-1.5 h-4 w-4" style={{ width: 16, height: 16 }} />
              )}
              {saved ? 'Salvo' : 'Salvar'}
            </Button>
          </div>
        </div>

        {/* Textos que a própria clínica já forneceu (migration 0015). */}
        {showTips && (
          <div className="space-y-1.5 rounded-xl border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              Cuidados já cadastrados pela clínica — clique para usar como base:
            </p>
            {tips.map((t, i) => (
              <button
                key={i}
                onClick={() => {
                  setBody(t);
                  setShowTips(false);
                }}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Nova mensagem
// ---------------------------------------------------------------------------
// O dia é a chave: `unique (protocol_id, day_offset)` garante uma mensagem por
// dia. Validamos no formulário para o usuário não descobrir isso por um erro
// do banco depois de escrever o texto todo.

function NewStepDialog({
  open,
  onOpenChange,
  diasUsados,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  diasUsados: number[];
  onCreated: () => Promise<unknown>;
}) {
  const [day, setDay] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [sendTime, setSendTime] = React.useState('09:00');
  const [phase, setPhase] = React.useState<'preop' | 'postop' | 'followup'>('postop');
  const [phaseTocada, setPhaseTocada] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const dayNum = day.trim() === '' || day.trim() === '-' ? null : Number(day);
  const dayValido = dayNum !== null && Number.isInteger(dayNum);
  const diaOcupado = dayValido && diasUsados.includes(dayNum);
  const label = dayValido ? (dayNum < 0 ? `D${dayNum}` : `D+${dayNum}`) : '';

  // Sugere a fase pelo dia até o usuário escolher uma explicitamente.
  React.useEffect(() => {
    if (!phaseTocada && dayValido) setPhase(phaseForDay(dayNum));
  }, [dayNum, dayValido, phaseTocada]);

  const reset = () => {
    setDay(''); setTitle(''); setBody(''); setSendTime('09:00');
    setPhase('postop'); setPhaseTocada(false); setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dayValido || diaOcupado || !title.trim() || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createProtocolStep({
        dayOffset: dayNum,
        title: title.trim(),
        body: body.trim(),
        sendTime,
        phase,
      });
      await onCreated();
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a mensagem.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova mensagem programada</DialogTitle>
          <DialogDescription>
            Enviada automaticamente no dia escolhido, contado a partir da data do procedimento.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-day">Dia</Label>
              <Input
                id="new-day"
                type="number"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                placeholder="Ex: 3"
                required
              />
              <p className="text-xs text-muted-foreground">
                {dayValido
                  ? `${label} — ${dayNum < 0 ? 'antes' : dayNum === 0 ? 'no dia' : 'depois'} do procedimento`
                  : 'Negativo para pré-operatório (ex.: -7)'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-time">Horário</Label>
              <Input
                id="new-time"
                type="time"
                value={sendTime}
                onChange={(e) => setSendTime(e.target.value)}
                required
              />
            </div>
          </div>

          {diaOcupado && (
            <p className="text-sm text-destructive">
              Já existe uma mensagem em {label}. Só cabe uma por dia — edite a existente ou escolha
              outro.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-phase">Fase</Label>
            <Select
              value={phase}
              onValueChange={(v) => {
                setPhase(v as typeof phase);
                setPhaseTocada(true);
              }}
            >
              <SelectTrigger id="new-phase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preop">Pré-operatório</SelectItem>
                <SelectItem value="postop">Pós-operatório</SelectItem>
                <SelectItem value="followup">Acompanhamento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-title">Título</Label>
            <Input
              id="new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: D+3 — cuidados com o edema"
              required
            />
            <p className="text-xs text-muted-foreground">
              Só para você identificar na lista; o paciente não vê.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-body">Mensagem</Label>
            <Textarea
              id="new-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Texto que o paciente vai receber no WhatsApp neste dia…"
              className="min-h-[110px]"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || diaOcupado || !dayValido}>
              {saving ? 'Criando...' : 'Criar mensagem'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Excluir mensagem
// ---------------------------------------------------------------------------
// `protocol_messages.step_id` tem `on delete cascade`: apagar o passo apaga
// junto os disparos dele, INCLUSIVE o registro dos já enviados a pacientes.
// Por isso o diálogo mostra o impacto e sugere desativar quando há histórico.

function DeleteStepDialog({
  step,
  open,
  onOpenChange,
  onDeleted,
}: {
  step: ProtocolStep;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted: () => Promise<unknown>;
}) {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteProtocolStep(step.id);
      await onDeleted();
      onOpenChange(false);
    } catch {
      setError('Não foi possível excluir. Tente de novo.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir a mensagem de {step.label}?</DialogTitle>
          <DialogDescription>
            {step.title || 'Sem título'} — esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1 text-sm">
          {step.sentCount > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ width: 16, height: 16 }} />
              <div>
                <p className="font-medium">
                  {step.sentCount} {step.sentCount === 1 ? 'envio já feito' : 'envios já feitos'} a
                  pacientes
                </p>
                <p className="mt-0.5 text-destructive/80">
                  O registro desses envios some junto. Para parar de enviar sem perder o histórico,
                  desligue o botão <strong>Ativo</strong> em vez de excluir.
                </p>
              </div>
            </div>
          )}

          {step.scheduledCount > 0 && (
            <p className="text-muted-foreground">
              {step.scheduledCount}{' '}
              {step.scheduledCount === 1 ? 'disparo agendado será cancelado' : 'disparos agendados serão cancelados'}.
            </p>
          )}

          {step.sentCount === 0 && step.scheduledCount === 0 && (
            <p className="text-muted-foreground">
              Nenhum disparo depende desta mensagem — pode excluir com segurança.
            </p>
          )}

          {error && <p className="text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="mr-1.5 h-4 w-4" style={{ width: 16, height: 16 }} />
            {deleting ? 'Excluindo...' : 'Excluir'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
