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
import { AlertTriangle, Check, Clock, Lightbulb, RefreshCw, Save } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ProtocolStep, DispatchSummary } from '@/lib/types';
import {
  getProtocolSteps,
  updateProtocolStep,
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
      </PageHeader>

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
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhuma sequência de mensagens cadastrada para esta clínica.
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
        </div>
      </CardHeader>

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
