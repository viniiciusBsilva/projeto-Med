'use client';

import * as React from 'react';
import { Users, Stethoscope, User, Plus, MoreVertical, KeyRound } from 'lucide-react';
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
import type { User as UserType } from '@/lib/types';
import {
  getTeam,
  getCurrentProfile,
  updateTeamMember,
  setTeamMemberActive,
  getMyProfile,
  updateMyProfile,
  getMyClinic,
  updateMyClinic,
  sendMyPasswordReset,
  createUser,
  provisionClinic,
  getClinics,
  type ClinicRow,
} from '@/lib/queries';

export default function SettingsPage() {
  const [me, setMe] = React.useState<{ id: string; isSuperadmin: boolean } | null>(null);

  // Meu perfil
  const [email, setEmail] = React.useState('');
  const [pfName, setPfName] = React.useState('');
  const [pfPhone, setPfPhone] = React.useState('');
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [profileMsg, setProfileMsg] = React.useState<string | null>(null);

  // Dados da clínica (profissional)
  const [clName, setClName] = React.useState('');
  const [clCnpj, setClCnpj] = React.useState('');
  const [clPhone, setClPhone] = React.useState('');
  const [clEmail, setClEmail] = React.useState('');
  const [clAddress, setClAddress] = React.useState('');
  const [savingClinic, setSavingClinic] = React.useState(false);
  const [clinicMsg, setClinicMsg] = React.useState<string | null>(null);

  // Usuários (admin geral)
  const [team, setTeam] = React.useState<UserType[]>([]);
  const [clinics, setClinics] = React.useState<ClinicRow[]>([]);

  // Modal "Novo usuário"
  const [open, setOpen] = React.useState(false);
  const [nuName, setNuName] = React.useState('');
  const [nuEmail, setNuEmail] = React.useState('');
  const [nuType, setNuType] = React.useState<'admin' | 'professional'>('professional');
  const [nuClinicMode, setNuClinicMode] = React.useState<'new' | 'existing'>('new');
  const [nuNewClinic, setNuNewClinic] = React.useState('');
  const [nuClinicId, setNuClinicId] = React.useState('');
  const [nuSubmitting, setNuSubmitting] = React.useState(false);
  const [nuError, setNuError] = React.useState<string | null>(null);
  const [nuResult, setNuResult] = React.useState<{ emailed: boolean; tempPassword?: string } | null>(null);

  // Modal de edição (nome)
  const [editOpen, setEditOpen] = React.useState(false);
  const [editUser, setEditUser] = React.useState<UserType | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editSubmitting, setEditSubmitting] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  const refreshTeam = React.useCallback(() => {
    getTeam().then(setTeam).catch(() => {});
  }, []);

  React.useEffect(() => {
    getMyProfile().then((p) => {
      if (!p) return;
      setEmail(p.email);
      setPfName(p.fullName);
      setPfPhone(p.phone);
    }).catch(() => {});
    getMyClinic().then((c) => {
      if (!c) return;
      setClName(c.name);
      setClCnpj(c.cnpj);
      setClPhone(c.phone);
      setClEmail(c.email);
      setClAddress(c.address);
    }).catch(() => {});
    getCurrentProfile().then((p) => {
      if (!p) return;
      setMe({ id: p.id, isSuperadmin: p.isSuperadmin });
      if (p.isSuperadmin) {
        refreshTeam();
        getClinics().then(setClinics).catch(() => {});
      }
    }).catch(() => {});
  }, [refreshTeam]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      await updateMyProfile({ fullName: pfName, phone: pfPhone });
      setProfileMsg('Perfil salvo.');
    } catch {
      setProfileMsg('Erro ao salvar o perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    setClinicMsg(null);
    setSavingClinic(true);
    try {
      await updateMyClinic({ name: clName, cnpj: clCnpj, phone: clPhone, email: clEmail, address: clAddress });
      setClinicMsg('Dados da clínica salvos.');
    } catch {
      setClinicMsg('Erro ao salvar a clínica.');
    } finally {
      setSavingClinic(false);
    }
  };

  const handleChangePassword = async () => {
    setProfileMsg(null);
    try {
      await sendMyPasswordReset();
      setProfileMsg('Enviamos um link de redefinição de senha para o seu e-mail.');
    } catch {
      setProfileMsg('Não foi possível enviar o link de redefinição.');
    }
  };

  const resetModal = () => {
    setNuName('');
    setNuEmail('');
    setNuType('professional');
    setNuClinicMode('new');
    setNuNewClinic('');
    setNuClinicId('');
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
    if (nuType === 'professional' && nuClinicMode === 'new' && !nuNewClinic.trim()) {
      setNuError('Informe o nome da nova clínica.');
      return;
    }
    if (nuType === 'professional' && nuClinicMode === 'existing' && !nuClinicId) {
      setNuError('Selecione a clínica.');
      return;
    }
    setNuSubmitting(true);
    try {
      const name = nuName.trim();
      const mail = nuEmail.trim().toLowerCase();
      let res: { emailed: boolean; tempPassword?: string };
      if (nuType === 'professional' && nuClinicMode === 'new') {
        res = await provisionClinic({ clinicName: nuNewClinic.trim(), professionalName: name, email: mail });
      } else if (nuType === 'professional') {
        res = await createUser({ name, email: mail, type: 'professional', clinicId: nuClinicId });
      } else {
        res = await createUser({ name, email: mail, type: 'admin' });
      }
      refreshTeam();
      getClinics().then(setClinics).catch(() => {});
      if (res.emailed) {
        setOpen(false);
        resetModal();
      } else {
        setNuResult(res);
      }
    } catch (err) {
      setNuError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setNuSubmitting(false);
    }
  };

  const openEdit = (user: UserType) => {
    setEditUser(user);
    setEditName(user.name === '—' ? '' : user.name);
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
      await updateTeamMember({ userId: editUser.id, name: editName.trim() });
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
      /* silencioso */
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Gerencie seu perfil, usuários e preferências" />

      <Tabs defaultValue="profile">
        <TabsList className={me?.isSuperadmin ? 'grid w-full grid-cols-3 md:w-auto' : 'inline-flex'}>
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
            <span className="hidden sm:inline">Meu perfil</span>
          </TabsTrigger>
          {me?.isSuperadmin && (
            <>
              <TabsTrigger value="users" className="gap-1.5">
                <Users className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                <span className="hidden sm:inline">Usuários</span>
              </TabsTrigger>
              <TabsTrigger value="protocols" className="gap-1.5">
                <Stethoscope className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                <span className="hidden sm:inline">Protocolos</span>
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {/* Meu perfil */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Meu perfil</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pf-name">Nome</Label>
                    <Input id="pf-name" value={pfName} onChange={(e) => setPfName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pf-phone">Telefone</Label>
                    <Input id="pf-phone" value={pfPhone} onChange={(e) => setPfPhone(e.target.value)} placeholder="(11) 90000-0000" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="pf-email">E-mail</Label>
                    <Input id="pf-email" value={email} disabled />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button type="button" variant="outline" onClick={handleChangePassword}>
                    <KeyRound className="mr-1.5 h-4 w-4" />
                    Alterar senha
                  </Button>
                  <div className="flex items-center gap-3">
                    {profileMsg && <span className="text-sm text-muted-foreground">{profileMsg}</span>}
                    <Button type="submit" disabled={savingProfile}>
                      {savingProfile ? 'Salvando...' : 'Salvar alterações'}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Dados da clínica — só profissional (admin geral gerencia em "Clínicas") */}
          {me && !me.isSuperadmin && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Dados da clínica</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveClinic} className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cl-name">Nome da clínica</Label>
                      <Input id="cl-name" value={clName} onChange={(e) => setClName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cl-cnpj">CNPJ</Label>
                      <Input id="cl-cnpj" value={clCnpj} onChange={(e) => setClCnpj(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cl-phone">Telefone</Label>
                      <Input id="cl-phone" value={clPhone} onChange={(e) => setClPhone(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cl-email">E-mail</Label>
                      <Input id="cl-email" type="email" value={clEmail} onChange={(e) => setClEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="cl-address">Endereço</Label>
                      <Input id="cl-address" value={clAddress} onChange={(e) => setClAddress(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    {clinicMsg && <span className="text-sm text-muted-foreground">{clinicMsg}</span>}
                    <Button type="submit" disabled={savingClinic}>
                      {savingClinic ? 'Salvando...' : 'Salvar alterações'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Usuários (admin geral) */}
        {me?.isSuperadmin && (
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
                          <p className="mt-1 select-all font-mono text-lg font-semibold">{nuResult.tempPassword}</p>
                        </div>
                        <div className="flex justify-end">
                          <Button onClick={() => { setOpen(false); resetModal(); }}>Concluir</Button>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleCreateUser} className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label htmlFor="nu-type">Tipo</Label>
                          <Select value={nuType} onValueChange={(v) => setNuType(v as 'admin' | 'professional')}>
                            <SelectTrigger id="nu-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="professional">Profissional</SelectItem>
                              <SelectItem value="admin">Admin geral</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nu-name">Nome completo</Label>
                          <Input id="nu-name" value={nuName} onChange={(e) => setNuName(e.target.value)} placeholder="Nome do usuário" required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nu-email">E-mail</Label>
                          <Input id="nu-email" type="email" value={nuEmail} onChange={(e) => setNuEmail(e.target.value)} placeholder="usuario@email.com" required />
                        </div>

                        {nuType === 'professional' && (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="nu-clinic-mode">Clínica</Label>
                              <Select value={nuClinicMode} onValueChange={(v) => setNuClinicMode(v as 'new' | 'existing')}>
                                <SelectTrigger id="nu-clinic-mode">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="new">Nova clínica</SelectItem>
                                  <SelectItem value="existing">Clínica existente</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {nuClinicMode === 'new' ? (
                              <div className="space-y-2">
                                <Label htmlFor="nu-new-clinic">Nome da nova clínica</Label>
                                <Input id="nu-new-clinic" value={nuNewClinic} onChange={(e) => setNuNewClinic(e.target.value)} placeholder="Ex: Clínica Capilar SP" />
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <Label htmlFor="nu-clinic">Selecione a clínica</Label>
                                <Select value={nuClinicId} onValueChange={setNuClinicId}>
                                  <SelectTrigger id="nu-clinic">
                                    <SelectValue placeholder="Escolha a clínica" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {clinics.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </>
                        )}

                        {nuError && <p className="text-sm text-destructive">{nuError}</p>}
                        <div className="flex justify-end gap-2 pt-2">
                          <Button type="button" variant="outline" onClick={() => { setOpen(false); resetModal(); }} disabled={nuSubmitting}>
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
                    <p className="p-6 text-sm text-muted-foreground">Nenhum usuário de sistema ainda.</p>
                  )}
                  {team.map((user) => (
                    <div key={user.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-accent/50">
                      <Avatar className="h-10 w-10 border">
                        <AvatarFallback>{user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{user.name}</p>
                          <Badge variant="secondary" className="text-xs">{user.role}</Badge>
                          {user.clinicName && (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              {user.clinicName}
                            </span>
                          )}
                          {!user.active && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Inativo</Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">Membro desde {user.lastAccess}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" style={{ width: 16, height: 16 }} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => openEdit(user)}>Editar nome</DropdownMenuItem>
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
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Protocolos (admin geral) */}
        {me?.isSuperadmin && (
          <TabsContent value="protocols" className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Configurações de protocolos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  ['Questionários automáticos', 'Enviar questionários nos dias definidos do protocolo'],
                  ['Lembrete de fotos', 'Solicitar fotos obrigatórias automaticamente'],
                  ['Alertas de não resposta', 'Notificar quando paciente não responde em 24h'],
                  ['IA de análise de evolução', 'Gerar resumos automáticos com inteligência artificial'],
                ].map(([title, desc]) => (
                  <div key={title} className="flex items-center justify-between rounded-xl border p-4">
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Modal de edição de nome */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input id="edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
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
    </div>
  );
}
