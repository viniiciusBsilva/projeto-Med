'use client';

// Aba "Assistente de IA" (só admin geral): o que a clínica diz ao agente do
// WhatsApp sobre identidade, tom, informações e comportamento. As regras de
// segurança clínica ficam fixas no código do agente e aparecem aqui só para
// leitura — nenhuma orientação escrita nesta tela passa por cima delas.

import * as React from 'react';
import { Bot, Lock, RotateCcw, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AI_NAME_LIMIT,
  AI_TEXT_LIMIT,
  DEFAULT_AI_SETTINGS,
  FIXED_RULES,
  TONE_OPTIONS,
  type AiSettings,
  type AiTone,
} from '@/lib/ai-settings';
import {
  getClinics,
  getMyClinicId,
  getClinicAiConfig,
  saveClinicAiConfig,
  type ClinicRow,
} from '@/lib/queries';
import { formatPhoneBR } from '@/lib/utils';

function TextField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, AI_TEXT_LIMIT))}
        placeholder={placeholder}
        className="min-h-[96px]"
      />
      <p className="text-right text-[11px] text-muted-foreground">
        {value.length}/{AI_TEXT_LIMIT}
      </p>
    </div>
  );
}

export function AiSettingsTab() {
  const [clinics, setClinics] = React.useState<ClinicRow[]>([]);
  const [clinicId, setClinicId] = React.useState('');
  const [settings, setSettings] = React.useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [address, setAddress] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  // Começa pela clínica do próprio admin; troca pelo seletor quando há várias.
  React.useEffect(() => {
    Promise.all([getClinics(), getMyClinicId()])
      .then(([list, mine]) => {
        setClinics(list);
        const first = mine && list.some((c) => c.id === mine) ? mine : list[0]?.id ?? '';
        setClinicId(first);
        if (!first) setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setMessage({ ok: false, text: 'Não foi possível carregar as clínicas.' });
      });
  }, []);

  React.useEffect(() => {
    if (!clinicId) return;
    setLoading(true);
    setMessage(null);
    getClinicAiConfig(clinicId)
      .then((config) => {
        setSettings(config.settings);
        setAddress(config.address);
        setPhone(config.phone);
      })
      .catch(() => setMessage({ ok: false, text: 'Não foi possível carregar a configuração.' }))
      .finally(() => setLoading(false));
  }, [clinicId]);

  const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const handleSave = async () => {
    if (!clinicId) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveClinicAiConfig(clinicId, { settings, address: address.trim(), phone: phone.trim() });
      setMessage({ ok: true, text: 'Configuração salva. Vale a partir da próxima mensagem do paciente.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const tone = TONE_OPTIONS.find((t) => t.value === settings.tone);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Bot className="h-4 w-4" style={{ width: 16, height: 16 }} />
            Assistente do WhatsApp
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Como o assistente se apresenta, fala e age com os pacientes. Os campos já vêm com o
            comportamento atual; edite o que quiser mudar. As respostas sobre saúde continuam vindo
            só do FAQ aprovado (aba FAQ do assistente).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {clinics.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="ai-clinic">Clínica</Label>
              <Select value={clinicId} onValueChange={setClinicId}>
                <SelectTrigger id="ai-clinic" className="w-full sm:w-80">
                  <SelectValue placeholder="Escolha a clínica" />
                </SelectTrigger>
                <SelectContent>
                  {clinics.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
            <div>
              <Label htmlFor="ai-enabled" className="text-sm font-medium">
                Assistente ativo nesta clínica
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Desligado, ele não responde ninguém: as mensagens continuam chegando no painel e a
                equipe responde por lá. Mensagens programadas continuam sendo enviadas.
              </p>
            </div>
            <Switch
              id="ai-enabled"
              checked={settings.enabled}
              onCheckedChange={(v) => set('enabled', v)}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Identidade e tom</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ai-name">Nome da assistente</Label>
                  <Input
                    id="ai-name"
                    value={settings.assistant_name}
                    maxLength={AI_NAME_LIMIT}
                    onChange={(e) => set('assistant_name', e.target.value)}
                    placeholder="Ex.: Ana (vazio = só 'assistente virtual')"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-tone">Tom de voz</Label>
                  <Select value={settings.tone} onValueChange={(v) => set('tone', v as AiTone)}>
                    <SelectTrigger id="ai-tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {tone && <p className="text-xs text-muted-foreground">{tone.description}</p>}
                </div>
              </div>
              <TextField
                id="ai-greeting"
                label="Apresentação"
                hint="Base para a primeira mensagem da conversa. O assistente adapta ao que o paciente escreveu."
                value={settings.greeting}
                onChange={(v) => set('greeting', v)}
                placeholder="Ex.: Oi! Eu sou a Ana, assistente virtual da clínica. Posso te ajudar com dúvidas e agendamentos."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Informações da clínica</CardTitle>
              <p className="text-xs text-muted-foreground">
                O que o assistente pode informar sobre a clínica. O endereço vai na confirmação de
                todo agendamento.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ai-address">Endereço</Label>
                  <Input
                    id="ai-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, número, bairro — cidade"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-phone">Telefone</Label>
                  <Input
                    id="ai-phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
              <TextField
                id="ai-clinic-info"
                label="Outras informações"
                hint="Como chegar, estacionamento, formas de pagamento, acessibilidade…"
                value={settings.clinic_info}
                onChange={(v) => set('clinic_info', v)}
                placeholder="Ex.: Estacionamento conveniado no subsolo. Aceitamos Pix e cartão em até 12x."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Comportamento</CardTitle>
              <p className="text-xs text-muted-foreground">
                Orientações da clínica para o assistente. Se alguma conflitar com as regras fixas de
                segurança, as regras vencem.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <TextField
                id="ai-instructions"
                label="Instruções gerais"
                value={settings.custom_instructions}
                onChange={(v) => set('custom_instructions', v)}
                placeholder="Ex.: Quando o paciente mostrar interesse, ofereça a avaliação. Pergunte como conheceu a clínica."
              />
              <TextField
                id="ai-pricing"
                label="Política de valores"
                hint="O assistente nunca passa orçamento de cirurgia. Aqui você diz o que ele pode informar."
                value={settings.pricing_policy}
                onChange={(v) => set('pricing_policy', v)}
                placeholder="Ex.: A avaliação custa R$ 200 e é abatida do valor do procedimento. O valor do transplante só é passado na avaliação."
              />
              <TextField
                id="ai-handoff"
                label="Quando passar para a equipe"
                hint="Situações em que o assistente para e chama um atendente, além dos sinais de alerta."
                value={settings.handoff_rules}
                onChange={(v) => set('handoff_rules', v)}
                placeholder="Ex.: Pedido de desconto, reclamação, dúvidas sobre outro procedimento."
              />
              <TextField
                id="ai-forbidden"
                label="Nunca fazer ou dizer"
                value={settings.forbidden}
                onChange={(v) => set('forbidden', v)}
                placeholder="Ex.: Não comentar sobre outras clínicas. Não prometer número de fios ou resultado."
              />
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Lock className="h-4 w-4" style={{ width: 16, height: 16 }} />
                Regras fixas de segurança
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Não editáveis: protegem o paciente e a clínica, e valem acima de qualquer orientação.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {FIXED_RULES.map((rule) => (
                  <li key={rule} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                    {rule}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {message && (
          <span className={message.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
            {message.text}
          </span>
        )}
        {/* Volta os textos ao padrão sem mexer em nome, ativação, endereço e telefone. */}
        <Button
          variant="outline"
          onClick={() => {
            setSettings((s) => ({
              ...DEFAULT_AI_SETTINGS,
              enabled: s.enabled,
              assistant_name: s.assistant_name,
              clinic_info: s.clinic_info,
            }));
            setMessage({ ok: true, text: 'Textos padrão restaurados. Salve para aplicar.' });
          }}
          disabled={saving || loading || !clinicId}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" style={{ width: 16, height: 16 }} />
          Restaurar padrão
        </Button>
        <Button onClick={handleSave} disabled={saving || loading || !clinicId}>
          <Save className="mr-1.5 h-4 w-4" style={{ width: 16, height: 16 }} />
          {saving ? 'Salvando...' : 'Salvar configuração'}
        </Button>
      </div>
    </div>
  );
}
