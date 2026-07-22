'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Thermometer,
  Clock,
  Camera,
  CheckCircle2,
  MessageSquare,
  Bell,
  CheckCheck,
  Droplet,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Notification } from '@/lib/types';
import { getNotifications, markNotificationRead } from '@/lib/queries';
import { cn } from '@/lib/utils';

type TypeStyle = { icon: React.ElementType; color: string; bg: string };

const typeConfig: Record<string, TypeStyle> = {
  pain: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
  fever: { icon: Thermometer, color: 'text-destructive', bg: 'bg-destructive/10' },
  bleeding: { icon: Droplet, color: 'text-destructive', bg: 'bg-destructive/10' },
  redness: { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
  itching: { icon: Sparkles, color: 'text-warning', bg: 'bg-warning/10' },
  'no-response': { icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
  photo: { icon: Camera, color: 'text-primary', bg: 'bg-primary/10' },
  protocol: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  message: { icon: MessageSquare, color: 'text-secondary', bg: 'bg-secondary/10' },
};

const defaultTypeStyle: TypeStyle = { icon: Bell, color: 'text-muted-foreground', bg: 'bg-muted' };

const severityConfig: Record<Notification['severity'], { label: string; className: string }> = {
  info: { label: 'Info', className: 'bg-primary/10 text-primary' },
  warning: { label: 'Atenção', className: 'bg-warning/10 text-warning' },
  critical: { label: 'Urgente', className: 'bg-destructive/10 text-destructive' },
};

export default function NotificationsPage() {
  const [filter, setFilter] = React.useState<'all' | 'unread' | 'critical'>('all');
  const [notifications, setNotifications] = React.useState<Notification[]>([]);

  React.useEffect(() => {
    getNotifications().then(setNotifications).catch(() => {});
  }, []);

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => markNotificationRead(n.id)));
    setNotifications(await getNotifications());
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    if (filter === 'critical') return n.severity === 'critical';
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const criticalCount = notifications.filter((n) => n.severity === 'critical').length;

  return (
    <div className="space-y-6">
      <PageHeader title="Notificações" description={`${unreadCount} não lidas · ${criticalCount} urgentes`}>
        <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
          <CheckCheck className="mr-1.5 h-4 w-4" />
          Marcar todas como lidas
        </Button>
      </PageHeader>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { label: 'Todas', value: 'all' as const },
          { label: 'Não lidas', value: 'unread' as const },
          { label: 'Urgentes', value: 'critical' as const },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-all',
              filter === tab.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border text-muted-foreground hover:bg-accent'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notifications */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Bell className="h-8 w-8 text-muted-foreground" style={{ width: 32, height: 32 }} />
              </div>
              <p className="mt-4 text-sm font-medium">Nenhuma notificação</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Você está em dia com todos os acompanhamentos
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((notification, i) => {
                const config = typeConfig[notification.type] ?? defaultTypeStyle;
                const sevConfig = severityConfig[notification.severity];
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      'flex items-start gap-4 p-4 transition-colors hover:bg-accent/50 animate-fade-in',
                      !notification.read && 'bg-primary/[0.02]'
                    )}
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', config.bg)}>
                      <config.icon className={cn('h-5 w-5', config.color)} style={{ width: 20, height: 20 }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{notification.title}</p>
                        <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium', sevConfig.className)}>
                          {sevConfig.label}
                        </span>
                        {!notification.read && (
                          <span className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{notification.description}</p>
                      <p className="mt-1.5 text-xs text-muted-foreground/70">{notification.time}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0 text-xs">
                      Ver paciente
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
