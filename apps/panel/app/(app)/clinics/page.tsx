'use client';

import * as React from 'react';
import { Building2, Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getClinics, provisionClinic, type ClinicRow } from '@/lib/queries';

export default function ClinicsPage() {
  const [clinics, setClinics] = React.useState<ClinicRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [open, setOpen] = React.useState(false);
  const [clinicName, setClinicName] = React.useState('');
  const [profName, setProfName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [specialty, setSpecialty] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ emailed: boolean; tempPassword?: string } | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    getClinics()
      .then(setClinics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setClinicName('');
    setProfName('');
    setEmail('');
    setSpecialty('');
    setError(null);
    setResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!clinicName.trim() || !profName.trim() || !email.trim()) {
      setError('Preencha clínica, profissional e e-mail.');
      return;
    }
    setSubmitting(true);
    try {
      const r = await provisionClinic({
        clinicName: clinicName.trim(),
        professionalName: profName.trim(),
        email: email.trim(),
        specialty: specialty.trim() || undefined,
      });
      setResult({ emailed: r.emailed, tempPassword: r.tempPassword });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Clínicas" description="Gerencie as clínicas e cadastre novos profissionais">
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Nova clínica
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nova clínica + profissional</DialogTitle>
            </DialogHeader>
            {result ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  Clínica criada com sucesso.
                  {result.emailed
                    ? ' A senha de acesso foi enviada por e-mail ao profissional.'
                    : ' Repasse a senha temporária abaixo ao profissional:'}
                </p>
                {!result.emailed && result.tempPassword && (
                  <div className="rounded-lg border bg-muted/40 p-3 text-center text-lg font-bold tracking-wider">
                    {result.tempPassword}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => setOpen(false)}>Fechar</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="c-name">Nome da clínica</Label>
                  <Input id="c-name" value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="Ex: Clínica Capilar São Paulo" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-prof">Profissional (médico)</Label>
                  <Input id="c-prof" value={profName} onChange={(e) => setProfName(e.target.value)} placeholder="Ex: Dr. João Silva" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-email">E-mail de acesso</Label>
                  <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="profissional@clinica.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-spec">Especialidade (opcional)</Label>
                  <Input id="c-spec" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Transplante capilar" />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Cadastrando...' : 'Cadastrar'}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </PageHeader>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : clinics.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Nenhuma clínica ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">Cadastre a primeira em &quot;Nova clínica&quot;.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clinics.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">Plano {c.plan}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {c.patientCount} paciente{c.patientCount === 1 ? '' : 's'}
                  </div>
                  <span
                    className="select-all rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold tracking-wider"
                    title="Código de convite da clínica"
                  >
                    {c.inviteCode}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
