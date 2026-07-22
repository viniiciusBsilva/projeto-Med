'use client';

import * as React from 'react';
import { Plus, MoreVertical, Stethoscope } from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Doctor } from '@/lib/types';
import { getDoctors, createDoctor, updateDoctor, setDoctorActive } from '@/lib/queries';

const EMPTY = { name: '', specialty: '', crm: '', phone: '', email: '' };

export default function DoctorsPage() {
  const [doctors, setDoctors] = React.useState<Doctor[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Doctor | null>(null);
  const [form, setForm] = React.useState({ ...EMPTY });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    getDoctors()
      .then(setDoctors)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setError(null);
    setOpen(true);
  };

  const openEdit = (d: Doctor) => {
    setEditing(d);
    setForm({ name: d.name, specialty: d.specialty, crm: d.crm, phone: d.phone, email: d.email });
    setError(null);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('Informe o nome do médico.');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) await updateDoctor(editing.id, form);
      else await createDoctor(form);
      setOpen(false);
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
      <PageHeader title="Médicos" description="Cadastre os médicos que atendem os pacientes e aparecem na agenda">
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
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="d-name">Nome completo</Label>
                <Input
                  id="d-name"
                  placeholder="Dr(a). Nome"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="d-specialty">Especialidade</Label>
                  <Input
                    id="d-specialty"
                    placeholder="Ex: Cirurgia capilar"
                    value={form.specialty}
                    onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d-crm">CRM</Label>
                  <Input
                    id="d-crm"
                    placeholder="CRM-SP 000000"
                    value={form.crm}
                    onChange={(e) => setForm({ ...form, crm: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="d-phone">Telefone</Label>
                  <Input
                    id="d-phone"
                    placeholder="(00) 0000-0000"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d-email">E-mail</Label>
                  <Input
                    id="d-email"
                    type="email"
                    placeholder="medico@email.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </form>
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
              <p className="mt-1 text-xs text-muted-foreground">Cadastre o primeiro médico da clínica.</p>
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
                      {!d.active && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Inativo
                        </Badge>
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
                      <DropdownMenuItem
                        className={d.active ? 'text-destructive' : ''}
                        onSelect={() => toggleActive(d)}
                      >
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
