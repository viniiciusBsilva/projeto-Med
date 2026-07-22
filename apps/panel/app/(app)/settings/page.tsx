'use client';

import * as React from 'react';
import {
  Building2,
  Users,
  Shield,
  Stethoscope,
  User,
  Upload,
  Plus,
  MoreVertical,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import type { User as UserType, ClinicInfo } from '@/lib/types';
import {
  getTeam,
  getClinicInfo,
  createTeamMember,
  getCurrentProfile,
  updateTeamMember,
  setTeamMemberActive,
} from '@/lib/queries';

const PERMISSIONS = ['Administrador', 'Secretária'];

const rolePermissions: Record<string, { label: string; permissions: { label: string; enabled: boolean }[] }> = {
  Administrador: {
    label: 'Administrador',
    permissions: [
      { label: 'Gerenciar usuários', enabled: true },
      { label: 'Gerenciar protocolos', enabled: true },
      { label: 'Visualizar pacientes', enabled: true },
      { label: 'Editar pacientes', enabled: true },
      { label: 'Gerar relatórios', enabled: true },
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
    ],
  },
};

export default function SettingsPage() {
  const [team, setTeam] = React.useState<UserType[]>([]);
  const [clinic, setClinic] = React.useState<ClinicInfo | null>(null);

  // Modal "Novo usuário"
  const [open, setOpen] = React.useState(false);
  const [nuName, setNuName] = React.useState('');
  const [nuEmail, setNuEmail] = React.useState('');
  const [nuPermission, setNuPermission] = React.useState('');
  const [nuSubmitting, setNuSubmitting] = React.useState(false);
  const [nuError, setNuError] = React.useState<string | null>(null);
  const [nuResult, setNuResult] = React.useState<{ emailed: boolean; tempPassword?: string } | null>(null);

  // Usuário logado (para regras de gerência)
  const [me, setMe] = React.useState<{ id: string; isAdmin: boolean } | null>(null);

  // Modal de edição
  const [editOpen, setEditOpen] = React.useState(false);
  const [editUser, setEditUser] = React.useState<UserType | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editPermission, setEditPermission] = React.useState('');
  const [editSubmitting, setEditSubmitting] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  const refreshTeam = React.useCallback(() => {
    getTeam().then(setTeam).catch(() => {});
  }, []);

  React.useEffect(() => {
    refreshTeam();
    getClinicInfo().then(setClinic).catch(() => {});
    getCurrentProfile().then((p) => p && setMe({ id: p.id, isAdmin: p.isAdmin })).catch(() => {});
  }, [refreshTeam]);

  const openEdit = (user: UserType) => {
    setEditUser(user);
    setEditName(user.name === '—' ? '' : user.name);
    setEditPermission(PERMISSIONS.includes(user.role) ? user.role : '');
    setEditError(null);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setEditError(null);
    if (!editName.trim()) {
      setEditError('Informe o nome.');
      return;
    }
    setEditSubmitting(true);
    try {
      const isSelf = me?.id === editUser.id;
      await updateTeamMember({
        userId: editUser.id,
        name: editName.trim(),
        permission: isSelf ? undefined : editPermission,
      });
      refreshTeam();
      setEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleToggleActive = async (user: UserType) => {
    try {
      await setTeamMemberActive(user.id, !user.active);
      refreshTeam();
    } catch {
      /* silencioso: a lista não muda se falhar */
    }
  };

  const resetModal = () => {
    setNuName('');
    setNuEmail('');
    setNuPermission('');
    setNuError(null);
    setNuResult(null);
    setNuSubmitting(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNuError(null);
    if (!nuName.trim() || !nuEmail.trim()) {
      setNuError('Informe nome e e-mail.');
      return;
    }
    setNuSubmitting(true);
    try {
      const res = await createTeamMember({
        name: nuName.trim(),
        email: nuEmail.trim().toLowerCase(),
        permission: nuPermission,
      });
      refreshTeam();
      if (res.emailed) {
        setOpen(false);
        resetModal();
      } else {
        // Brevo não configurado: mostra a senha para repasse manual.
        setNuResult(res);
      }
    } catch (err) {
      setNuError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setNuSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Gerencie sua clínica, usuários e preferências" />

      <Tabs defaultValue="clinic">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:grid-cols-4">
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
              <Dialog
                open={open}
                onOpenChange={(o) => {
                  setOpen(o);
                  if (!o) resetModal();
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Novo usuário
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Novo usuário</DialogTitle>
                  </DialogHeader>

                  {nuResult && !nuResult.emailed ? (
                    <div className="space-y-4 py-2">
                      <p className="text-sm text-muted-foreground">
                        Usuário criado. O envio de e-mail não está configurado — copie a senha
                        temporária e repasse ao usuário. Ele deve trocá-la no primeiro acesso.
                      </p>
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">Senha temporária</p>
                        <p className="mt-1 select-all font-mono text-lg font-semibold">
                          {nuResult.tempPassword}
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          onClick={() => {
                            setOpen(false);
                            resetModal();
                          }}
                        >
                          Concluir
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateUser} className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="nu-name">Nome completo</Label>
                        <Input
                          id="nu-name"
                          placeholder="Nome do usuário"
                          value={nuName}
                          onChange={(e) => setNuName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nu-email">E-mail</Label>
                        <Input
                          id="nu-email"
                          type="email"
                          placeholder="usuario@email.com"
                          value={nuEmail}
                          onChange={(e) => setNuEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nu-permission">Permissão</Label>
                        <Select value={nuPermission} onValueChange={setNuPermission}>
                          <SelectTrigger id="nu-permission">
                            <SelectValue placeholder="Selecione a permissão" />
                          </SelectTrigger>
                          <SelectContent>
                            {PERMISSIONS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {nuError && <p className="text-sm text-destructive">{nuError}</p>}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setOpen(false);
                            resetModal();
                          }}
                          disabled={nuSubmitting}
                        >
                          Cancelar
                        </Button>
                        <Button type="submit" disabled={nuSubmitting}>
                          {nuSubmitting ? 'Criando...' : 'Criar usuário'}
                        </Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
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
                    {me?.isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" style={{ width: 16, height: 16 }} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => openEdit(user)}>
                            Editar
                          </DropdownMenuItem>
                          {me.id !== user.id && (
                            <DropdownMenuItem
                              className={user.active ? 'text-destructive' : ''}
                              onSelect={() => handleToggleActive(user)}
                            >
                              {user.active ? 'Inativar' : 'Ativar'}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Editar usuário */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Editar usuário</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEdit} className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="ed-name">Nome completo</Label>
                  <Input
                    id="ed-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ed-permission">Permissão</Label>
                  <Select
                    value={editPermission}
                    onValueChange={setEditPermission}
                    disabled={me?.id === editUser?.id}
                  >
                    <SelectTrigger id="ed-permission">
                      <SelectValue placeholder="Selecione a permissão" />
                    </SelectTrigger>
                    <SelectContent>
                      {PERMISSIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {me?.id === editUser?.id && (
                    <p className="text-xs text-muted-foreground">
                      Você não pode alterar a própria permissão.
                    </p>
                  )}
                </div>
                {editError && <p className="text-sm text-destructive">{editError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={editSubmitting}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={editSubmitting}>
                    {editSubmitting ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
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

      </Tabs>
    </div>
  );
}
