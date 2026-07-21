'use client';

import * as React from 'react';
import {
  Plus,
  Stethoscope,
  Calendar,
  HelpCircle,
  Pill,
  AlertTriangle,
  Heart,
  Camera,
  Video,
  FileText,
  Clock,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Protocol } from '@/lib/types';
import { getProtocols } from '@/lib/queries';

export default function SurgeriesPage() {
  const [selected, setSelected] = React.useState<Protocol | null>(null);
  const [protocols, setProtocols] = React.useState<Protocol[]>([]);

  React.useEffect(() => {
    getProtocols().then(setProtocols).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Cirurgias e Protocolos" description="Gerencie os protocolos de acompanhamento personalizados">
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Novo protocolo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo protocolo de cirurgia</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="protocol-name">Nome do protocolo</Label>
                <Input id="protocol-name" placeholder="Ex: Blefaroplastia" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="protocol-category">Categoria</Label>
                <Input id="protocol-category" placeholder="Ex: Cirurgia Plástica" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="protocol-duration">Duração (dias)</Label>
                  <Input id="protocol-duration" type="number" placeholder="60" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="protocol-days">Dias de acompanhamento</Label>
                  <Input id="protocol-days" placeholder="1, 3, 7, 15, 30" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="protocol-questions">Perguntas do questionário</Label>
                <Textarea id="protocol-questions" placeholder="Uma pergunta por linha" className="min-h-[100px]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="protocol-medications">Medicamentos</Label>
                <Textarea id="protocol-medications" placeholder="Um medicamento por linha" className="min-h-[80px]" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline">Cancelar</Button>
                <Button>Salvar protocolo</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Protocol Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {protocols.map((protocol, i) => (
          <Card
            key={protocol.id}
            className="group cursor-pointer animate-fade-in transition-all hover:shadow-md"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: protocol.color }}>
                  <Stethoscope className="h-5 w-5" style={{ width: 20, height: 20 }} />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">{protocol.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{protocol.category}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" style={{ width: 12, height: 12 }} />
                  {protocol.duration} dias
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" style={{ width: 12, height: 12 }} />
                  {protocol.patientCount} pacientes
                </Badge>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {protocol.days.map((d) => (
                  <span
                    key={d}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-medium"
                  >
                    {d}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
                <div>
                  <HelpCircle className="mx-auto h-4 w-4 text-muted-foreground" style={{ width: 16, height: 16 }} />
                  <p className="mt-1 text-sm font-semibold">{protocol.questions.length}</p>
                  <p className="text-xs text-muted-foreground">Perguntas</p>
                </div>
                <div>
                  <Pill className="mx-auto h-4 w-4 text-muted-foreground" style={{ width: 16, height: 16 }} />
                  <p className="mt-1 text-sm font-semibold">{protocol.medications.length}</p>
                  <p className="text-xs text-muted-foreground">Médicos</p>
                </div>
                <div>
                  <Camera className="mx-auto h-4 w-4 text-muted-foreground" style={{ width: 16, height: 16 }} />
                  <p className="mt-1 text-sm font-semibold">{protocol.requiredPhotos.length}</p>
                  <p className="text-xs text-muted-foreground">Fotos</p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                {protocol.hasVideo && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Video className="h-3 w-3" style={{ width: 12, height: 12 }} />
                    Vídeo
                  </Badge>
                )}
                {protocol.hasFiles && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <FileText className="h-3 w-3" style={{ width: 12, height: 12 }} />
                    Arquivos
                  </Badge>
                )}
              </div>

              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setSelected(protocol)}
                  >
                    Ver detalhes
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: protocol.color }}>
                        <Stethoscope className="h-4 w-4" style={{ width: 16, height: 16 }} />
                      </div>
                      {protocol.name}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-5 py-2">
                    <ProtocolSection icon={Calendar} title="Dias de acompanhamento">
                      <div className="flex flex-wrap gap-1.5">
                        {protocol.days.map((d) => (
                          <span key={d} className="rounded-md bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
                            Dia {d}
                          </span>
                        ))}
                      </div>
                    </ProtocolSection>

                    <ProtocolSection icon={HelpCircle} title="Perguntas do questionário">
                      <ul className="space-y-1.5">
                        {protocol.questions.map((q, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                              {i + 1}
                            </span>
                            {q}
                          </li>
                        ))}
                      </ul>
                    </ProtocolSection>

                    <ProtocolSection icon={Pill} title="Medicamentos">
                      <div className="flex flex-wrap gap-1.5">
                        {protocol.medications.map((m, i) => (
                          <span key={i} className="rounded-md bg-secondary/10 px-2.5 py-1 text-sm text-secondary">
                            {m}
                          </span>
                        ))}
                      </div>
                    </ProtocolSection>

                    <ProtocolSection icon={AlertTriangle} title="Alertas automáticos">
                      <ul className="space-y-1.5">
                        {protocol.alerts.map((a, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ width: 14, height: 14 }} />
                            {a}
                          </li>
                        ))}
                      </ul>
                    </ProtocolSection>

                    <ProtocolSection icon={Heart} title="Cuidados recomendados">
                      <ul className="space-y-1.5">
                        {protocol.care.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </ProtocolSection>

                    <ProtocolSection icon={Camera} title="Fotos obrigatórias">
                      <div className="flex flex-wrap gap-1.5">
                        {protocol.requiredPhotos.map((p, i) => (
                          <span key={i} className="rounded-md bg-muted px-2.5 py-1 text-sm">
                            {p}
                          </span>
                        ))}
                      </div>
                    </ProtocolSection>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProtocolSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" style={{ width: 16, height: 16 }} />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}
