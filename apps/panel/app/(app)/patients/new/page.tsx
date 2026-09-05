'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Upload, Save, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { Protocol, Doctor } from '@/lib/types';
import { getProtocols, getDoctors, createPatient } from '@/lib/queries';

export default function NewPatientPage() {
  const router = useRouter();
  const [protocols, setProtocols] = React.useState<Protocol[]>([]);
  const [protocolId, setProtocolId] = React.useState<string>('');
  const [doctors, setDoctors] = React.useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getProtocols().then(setProtocols).catch(() => {});
    getDoctors(true).then(setDoctors).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const doctor = doctors.find((d) => d.id === doctorId);
    setSubmitting(true);
    try {
      await createPatient({
        fullName: String(fd.get('name') || '').trim(),
        cpf: String(fd.get('cpf') || ''),
        birthDate: String(fd.get('birthDate') || ''),
        phone: String(fd.get('phone') || fd.get('whatsapp') || ''),
        email: String(fd.get('email') || ''),
        notes: String(fd.get('notes') || ''),
        // Um procedimento por clínica: o protocolo é resolvido no createPatient.
        surgeryDate: String(fd.get('surgeryDate') || ''),
        surgeon: doctor?.name,
        doctorId: doctorId || undefined,
      });
      router.push('/patients');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar paciente.');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader title="Cadastrar paciente" description="Preencha os dados para iniciar o acompanhamento" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photo */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Foto do paciente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-2">
                <AvatarFallback>
                  <User className="h-8 w-8 text-muted-foreground" style={{ width: 32, height: 32 }} />
                </AvatarFallback>
              </Avatar>
              <div>
                <Button type="button" variant="outline" size="sm">
                  <Upload className="mr-1.5 h-4 w-4" />
                  Carregar foto
                </Button>
                <p className="mt-1.5 text-xs text-muted-foreground">JPG, PNG ou WEBP. Máx 5MB.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal Data */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Dados pessoais</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name">Nome completo *</Label>
                <Input id="name" name="name" placeholder="Nome do paciente" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" name="cpf" placeholder="000.000.000-00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">Data de nascimento</Label>
                <Input id="birthDate" name="birthDate" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" name="phone" placeholder="(00) 0000-0000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input id="whatsapp" name="whatsapp" placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="paciente@email.com" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">Endereço</Label>
                <Input id="address" name="address" placeholder="Rua, número - Cidade, Estado" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Procedimento — um único tipo (transplante capilar), então nada de
            catálogo. A data pode ficar em branco: leads que chegam pelo
            WhatsApp ainda não têm procedimento marcado. */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Procedimento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="surgeryDate">Data do procedimento</Label>
                <Input id="surgeryDate" name="surgeryDate" type="date" />
                <p className="text-xs text-muted-foreground">
                  Define o início dos disparos automáticos. Pode ser preenchida depois.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="doctor">Médico responsável</Label>
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger id="doctor">
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
              <div className="space-y-2">
                <Label htmlFor="team">Equipe responsável</Label>
                <Input id="team" name="team" placeholder="Equipe A, B, C..." />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="notes"
              placeholder="Alergias, comorbidades, histórico médico relevante..."
              className="min-h-[120px]"
            />
          </CardContent>
        </Card>

        {/* Actions */}
        {error && (
          <p className="text-right text-sm text-destructive">{error}</p>
        )}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
            <X className="mr-1.5 h-4 w-4" />
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            <Save className="mr-1.5 h-4 w-4" />
            {submitting ? 'Salvando...' : 'Salvar paciente'}
          </Button>
        </div>
      </form>
    </div>
  );
}
