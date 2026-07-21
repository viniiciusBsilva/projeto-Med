'use client';

import * as React from 'react';
import {
  Building2,
  Users,
  Shield,
  Stethoscope,
  Plug,
  CreditCard,
  User,
  Upload,
  Plus,
  MoreVertical,
  Check,
  Crown,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { User as UserType, ClinicInfo } from '@/lib/types';
import { getTeam, getClinicInfo } from '@/lib/queries';

const rolePermissions: Record<string, { label: string; permissions: { label: string; enabled: boolean }[] }> = {
  Administrador: {
    label: 'Administrador',
    permissions: [
      { label: 'Gerenciar usuários', enabled: true },
      { label: 'Gerenciar protocolos', enabled: true },
      { label: 'Visualizar pacientes', enabled: true },
      { label: 'Editar pacientes', enabled: true },
      { label: 'Gerar relatórios', enabled: true },
      { label: 'Gerenciar assinatura', enabled: true },
    ],
  },
  Médico: {
    label: 'Médico',
    permissions: [
      { label: 'Gerenciar usuários', enabled: false },
      { label: 'Gerenciar protocolos', enabled: true },
      { label: 'Visualizar pacientes', enabled: true },
      { label: 'Editar pacientes', enabled: true },
      { label: 'Gerar relatórios', enabled: true },
      { label: 'Gerenciar assinatura', enabled: false },
    ],
  },
  Enfermeiro: {
    label: 'Enfermeiro',
    permissions: [
      { label: 'Gerenciar usuários', enabled: false },
      { label: 'Gerenciar protocolos', enabled: false },
      { label: 'Visualizar pacientes', enabled: true },
      { label: 'Editar pacientes', enabled: true },
      { label: 'Gerar relatórios', enabled: false },
      { label: 'Gerenciar assinatura', enabled: false },
    ],
  },
  Secretária: {
    label: 'Secretária',
    permissions: [
      { label: 'Gerenciar usuários', enabled: false },
      { label: 'Gerenciar protocolos', enabled: false },
      { label: 'Visualizar pacientes', enabled: true },
      { label: 'Editar pacientes', enabled: true },
      { label: 'Gerar relatórios', enabled: false },
      { label: 'Gerenciar assinatura', enabled: false },
    ],
  },
};

const integrations = [
  { name: 'WhatsApp Business', description: 'Envio automático de mensagens', connected: true, icon: '💬' },
  { name: 'Google Calendar', description: 'Sincronização de agenda', connected: true, icon: '📅' },
  { name: 'Telegram', description: 'Notificações alternativas', connected: false, icon: '✈️' },
  { name: 'Zapier', description: 'Automação de fluxos', connected: false, icon: '⚡' },
];

export default function SettingsPage() {
  const [team, setTeam] = React.useState<UserType[]>([]);
  const [clinic, setClinic] = React.useState<ClinicInfo | null>(null);

  React.useEffect(() => {
    getTeam().then(setTeam).catch(() => {});
    getClinicInfo().then(setClinic).catch(() => {});
  }, []);

  const usagePct = clinic && clinic.activePatientLimit > 0
    ? Math.min(100, Math.round((clinic.activePatients / clinic.activePatientLimit) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Gerencie sua clínica, usuários e preferências" />

      <Tabs defaultValue="clinic">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:grid-cols-6">
          <TabsTrigger value="clinic" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
            <span className="hidden sm:inline">Clínica</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
            <span className="hidden sm:inline">Usuários</span>
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
            <span className="hidden sm:inline">Permissões</span>
          </TabsTrigger>
          <TabsTrigger value="protocols" className="gap-1.5">
            <Stethoscope className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
            <span className="hidden sm:inline">Protocolos</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5">
            <Plug className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
            <span className="hidden sm:inline">Integrações</span>
          </TabsTrigger>
          <TabsTrigger value="plan" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
            <span className="hidden sm:inline">Plano</span>
          </TabsTrigger>
        </TabsList>

        {/* Clinic Settings */}
        <TabsContent value="clinic" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Dados da clínica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="h-8 w-8 text-primary" style={{ width: 32, height: 32 }} />
                </div>
                <div>
                  <Button variant="outline" size="sm">
                    <Upload className="mr-1.5 h-4 w-4" />
                    Carregar logo
                  </Button>
                  <p className="mt-1.5 text-xs text-muted-foreground">PNG ou SVG. Recomendado 256x256px.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="clinic-name">Nome da clínica</Label>
                  <Input key={clinic?.id ?? 'c'} id="clinic-name" defaultValue={clinic?.name ?? ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clinic-cnpj">CNPJ</Label>
                  <Input id="clinic-cnpj" defaultValue="12.345.678/0001-90" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clinic-phone">Telefone</Label>
                  <Input id="clinic-phone" defaultValue="(11) 3000-0000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clinic-email">Email</Label>
                  <Input id="clinic-email" type="email" defaultValue="contato@clinicavitalis.com.br" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="clinic-address">Endereço</Label>
                  <Input id="clinic-address" defaultValue="Av. Paulista, 1000 - São Paulo, SP" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button>Salvar alterações</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-base font-semibold">Usuários do sistema</CardTitle>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Novo usuário
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {team.length === 0 && (
                  <p className="p-6 text-sm text-muted-foreground">Nenhum membro na equipe ainda.</p>
                )}
                {team.map((user) => (
                  <div key={user.id} className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors">
                    <Avatar className="h-10 w-10 border">
                      <AvatarFallback>
                        {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{user.name}</p>
                        <Badge variant="secondary" className="text-xs">{user.role}</Badge>
                        {!user.active && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Inativo</Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">Membro desde {user.lastAccess}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" style={{ width: 16, height: 16 }} />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Permissions */}
        <TabsContent value="permissions" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(rolePermissions).map(([role, config]) => (
              <Card key={role}>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" style={{ width: 16, height: 16 }} />
                    <CardTitle className="text-base font-semibold">{config.label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {config.permissions.map((perm, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm">{perm.label}</span>
                      <Switch defaultChecked={perm.enabled} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Protocols */}
        <TabsContent value="protocols" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Configurações de protocolos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">Questionários automáticos</p>
                  <p className="text-xs text-muted-foreground">Enviar questionários nos dias definidos do protocolo</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">Lembrete de fotos</p>
                  <p className="text-xs text-muted-foreground">Solicitar fotos obrigatórias automaticamente</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">Alertas de não resposta</p>
                  <p className="text-xs text-muted-foreground">Notificar quando paciente não responde em 24h</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">IA de análise de evolução</p>
                  <p className="text-xs text-muted-foreground">Gerar resumos automáticos com inteligência artificial</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {integrations.map((integration) => (
              <Card key={integration.name}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-2xl">
                        {integration.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">{integration.description}</p>
                      </div>
                    </div>
                    {integration.connected && (
                      <Badge className="gap-1 bg-success/10 text-success">
                        <Check className="h-3 w-3" style={{ width: 12, height: 12 }} />
                        Conectado
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant={integration.connected ? 'outline' : 'default'}
                    size="sm"
                    className="mt-4 w-full"
                  >
                    {integration.connected ? 'Desconectar' : 'Conectar'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Plan */}
        <TabsContent value="plan" className="mt-4">
          <div className="space-y-6">
            <Card className="overflow-hidden border-primary/30">
              <div className="bg-gradient-to-br from-primary/10 to-secondary/10 p-6">
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" style={{ width: 20, height: 20 }} />
                  <span className="text-sm font-semibold text-primary capitalize">Plano {clinic?.plan ?? '—'}</span>
                </div>
                <p className="mt-2 text-3xl font-bold">R$ 497<span className="text-lg font-normal text-muted-foreground">/mês</span></p>
                <p className="mt-1 text-sm text-muted-foreground">Assinatura mensal por limite de pacientes ativos</p>
              </div>
              <CardContent className="p-6">
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Pacientes ativos</span>
                    <span className="font-medium">{clinic?.activePatients ?? 0} / {clinic?.activePatientLimit ?? 0}</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${usagePct}%` }} />
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    'Até 100 pacientes ativos',
                    'Protocolos ilimitados',
                    'IA de análise de evolução',
                    'Mensagens automáticas',
                    'Exportação PDF e Excel',
                    'Suporte prioritário',
                  ].map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-success" style={{ width: 16, height: 16 }} />
                      {feature}
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex gap-2">
                  <Button className="flex-1">Fazer upgrade</Button>
                  <Button variant="outline">Gerenciar assinatura</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Perfil</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2">
                    <AvatarImage src="https://images.pexels.com/photos/6234600/pexels-photo-6234600.jpeg?auto=compress&cs=tinysrgb&w=100" />
                    <AvatarFallback>RM</AvatarFallback>
                  </Avatar>
                  <div>
                    <Button variant="outline" size="sm">
                      <Upload className="mr-1.5 h-4 w-4" />
                      Alterar foto
                    </Button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Nome</Label>
                    <Input id="profile-name" defaultValue="Dr. Rafael Mendes" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-specialty">Especialidade</Label>
                    <Input id="profile-specialty" defaultValue="Cirurgia Plástica" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input id="profile-email" type="email" defaultValue="rafael@clinicavitalis.com.br" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-phone">Telefone</Label>
                    <Input id="profile-phone" defaultValue="(11) 98765-4321" />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button>Salvar perfil</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
