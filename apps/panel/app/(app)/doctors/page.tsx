'use client';

import * as React from 'react';
import { Plus, MoreVertical, Stethoscope, Copy, Check } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Doctor } from '@/lib/types';
import { getDoctors, updateDoctor, setDoctorActive, createUser, getClinics, type ClinicRow } from '@/lib/queries';
import { formatPhoneBR } from '@/lib/utils';

const EMPTY = { name: '', specialty: '', crm: '', phone: '', email: '' };

export default function DoctorsPage() {
  const [doctors, setDoctors] = React.useState<Doctor[]>([]);
  const [clinics, setClinics] = React.useState<ClinicRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Doctor | null>(null);
  const [form, setForm] = React.useState({ ...EMPTY });
  const [clinicId, setClinicId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ tempPassword?: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const copyPassword = async () => {
    if (!result?.tempPassword) return;
    try {
      await navigator.clipboard.writeText(result.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponível */
    }
  };

  const refresh = React.useCallback(() => {
    getDoctors()
      .then(setDoctors)
      .catch(() => {})
      .finally(() => setLoading(false));
    getClinics().then(setClinics).catch(() => {});
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setClinicId('');
    setError(null);
    setResult(null);
    setOpen(true);
  };

  const openEdit = (d: Doctor) => {
    setEditing(d);
    setForm({ name: d.name, specialty: d.specialty, crm: d.crm, phone: d.phone, email: d.email });
    setError(null);
    setResult(null);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('Informe o nome do médico.');
      return;
    }
    if (!editing) {
      if (!clinicId) {
        setError('Selecione a clínica.');
        return;
      }
      if (!form.email.trim()) {
        setError('Informe o e-mail (usado para o acesso do médico).');
        return;
      }
    }
    setSubmitting(true);
    try {
      if (editing) {
        await updateDoctor(editing.id, form);
        setOpen(false);
      } else {
        const res = await createUser({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          type: 'professional',
          clinicId,
          specialty: form.specialty.trim() || undefined,
          crm: form.crm.trim() || undefined,
          phone: form.phone.trim() || undefined,
        });
        if (res.emailed) {
          setOpen(false);
        } else {
          setResult({ tempPassword: res.tempPassword });
        }
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (d: Doctor) => {
    try {
      await setDoctorActive(d.id, !d.active);
      refresh();
    } catch {
      /* silencioso */
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Médicos" description="Cadastre os médicos (com acesso ao painel) de cada clínica">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" />
              Novo médico
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar médico' : 'Novo médico'}</DialogTitle>
            </DialogHeader>

            {result ? (
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Médico criado com acesso ao painel. O envio de e-mail não está configurado — copie a
                  senha temporária e repasse ao médico. Ele deve trocá-la no primeiro acesso.
                </p>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Senha temporária</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="select-all font-mono text-lg font-semibold">{result.tempPassword}</p>
                    <Button type="button" variant="outline" size="sm" onClick={copyPassword} className="shrink-0">
                      {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                      {copied ? 'Copiado' : 'Copiar'}
                    </Button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => { setOpen(false); setResult(null); }}>Concluir</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 py-2">
                {!editing && (
                  <div className="space-y-2">
                    <Label htmlFor="d-clinic">Clínica</Label>
                    <Select value={clinicId} onValueChange={setClinicId}>
                      <SelectTrigger id="d-clinic">
                        <SelectValue placeholder="Selecione a clínica" />
                      </SelectTrigger>
                      <SelectContent>
                        {clinics.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="d-name">Nome completo</Label>
                  <Input id="d-name" placeholder="Dr(a). Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="d-specialty">Especialidade</Label>
                    <Input id="d-specialty" placeholder="Ex: Cirurgia capilar" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="d-crm">CRM</Label>
                    <Input id="d-crm" placeholder="CRM-SP 000000" value={form.crm} onChange={(e) => setForm({ ...form, crm: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="d-phone">Telefone</Label>
                    <Input id="d-phone" placeholder="(00) 00000-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhoneBR(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="d-email">E-mail {!editing && <span className="text-destructive">*</span>}</Label>
                    <Input id="d-email" type="email" placeholder="medico@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editing} />
                  </div>
                </div>
                {!editing && (
                  <p className="text-xs text-muted-foreground">
                    Um acesso ao painel será criado com este e-mail e uma senha temporária.
                  </p>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Salvando...' : editing ? 'Salvar' : 'Criar médico'}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Carregando médicos...
            </div>
          ) : doctors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Stethoscope className="h-8 w-8 text-muted-foreground" style={{ width: 32, height: 32 }} />
              </div>
              <p className="mt-4 text-sm font-medium">Nenhum médico cadastrado</p>
              <p className="mt-1 text-xs text-muted-foreground">Cadastre o primeiro médico.</p>
            </div>
          ) : (
            <div className="divide-y">
              {doctors.map((d) => (
                <div key={d.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-accent/50">
                  <Avatar className="h-10 w-10 border">
                    <AvatarFallback>
                      {d.name.replace(/^Dr[a]?\.?\s*/i, '').split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      {d.clinicName && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {d.clinicName}
                        </span>
                      )}
                      {!d.active && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Inativo</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[d.specialty, d.crm].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <span className="hidden text-xs text-muted-foreground md:block">{d.phone}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" style={{ width: 16, height: 16 }} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => openEdit(d)}>Editar</DropdownMenuItem>
                      <DropdownMenuItem className={d.active ? 'text-destructive' : ''} onSelect={() => toggleActive(d)}>
                        {d.active ? 'Inativar' : 'Ativar'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
