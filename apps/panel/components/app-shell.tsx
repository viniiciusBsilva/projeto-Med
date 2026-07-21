'use client';

import * as React from 'react';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';

interface AppShellProps {
  children: React.ReactNode;
  userName?: string;
  userEmail?: string;
  roleLabel?: string;
}

export function AppShell({ children, userName, userEmail, roleLabel }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-72">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          userName={userName}
          userEmail={userEmail}
          roleLabel={roleLabel}
        />
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
