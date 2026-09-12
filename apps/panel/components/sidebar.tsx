'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserRound,
  Calendar,
  MessageSquare,
  Settings,
  Activity,
  CalendarClock,
  Building2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { getOpenAlertsCount } from '@/lib/queries';

// adminOnly = visível só para o admin geral (super-admin). O médico não vê no menu
// e as rotas são bloqueadas por layout server (ver app/(app)/<rota>/layout.tsx).
// Ordem por rotina do médico: primeiro o que exige ação hoje (alertas), depois
// a comunicação com o paciente, depois consulta e administração.
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/patients', label: 'Pacientes', icon: Users },
  // Fila de trabalho: a IA se pausa sozinha ao escalar, e alguém precisa assumir.
  { href: '/alertas', label: 'Alertas', icon: AlertTriangle },
  // As duas faces da conversa com o paciente, lado a lado de propósito:
  // "Mensagens" é o que acontece ao vivo, "Mensagens programadas" é o que sai
  // sozinho no D+n. Sem escrever o segundo, nada é enviado.
  { href: '/messages', label: 'Mensagens', icon: MessageSquare },
  { href: '/mensagens-programadas', label: 'Mensagens programadas', icon: CalendarClock },
  { href: '/calendar', label: 'Agenda', icon: Calendar },
  // Notificações saiu do menu: o acesso é pelo sino do topo, que já lista as
  // recentes. O que exige ação da equipe está em Alertas.
  // Relatórios oculto a pedido da clínica; a rota /reports continua existindo.
  { href: '/doctors', label: 'Médicos', icon: UserRound, adminOnly: true },
  { href: '/clinics', label: 'Clínicas', icon: Building2, adminOnly: true },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  isSuperadmin?: boolean;
}

export function Sidebar({ open, onClose, isSuperadmin }: SidebarProps) {
  const pathname = usePathname();
  const items = navItems.filter((item) => !item.adminOnly || isSuperadmin);

  // Alertas abertos: a IA se pausa ao escalar, então esse número é a fila de
  // trabalho da equipe. Realtime porque o alerta nasce de uma conversa que a
  // equipe não está necessariamente olhando.
  const [openAlerts, setOpenAlerts] = React.useState(0);

  React.useEffect(() => {
    const refresh = () => getOpenAlertsCount().then(setOpenAlerts).catch(() => {});
    refresh();
    const supabase = createClient();
    const channel = supabase
      .channel('sidebar-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const badgeFor = (href: string) => (href === '/alertas' ? openAlerts : 0);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r bg-card transition-transform duration-300 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-6">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">PostCare</span>
              <span className="ml-1 text-lg font-bold text-primary">Pro</span>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <item.icon className={cn('h-4.5 w-4.5 shrink-0', active ? 'text-primary-foreground' : '')} style={{ width: 18, height: 18 }} />
                <span className="flex-1">{item.label}</span>
                {badgeFor(item.href) > 0 && (
                  <span
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                      active
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-primary text-primary-foreground'
                    )}
                  >
                    {badgeFor(item.href)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
