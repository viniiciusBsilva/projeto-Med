import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  // Nome exibido: full_name do profile, com fallback pro e-mail.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, is_superadmin')
    .eq('id', user.id)
    .maybeSingle();

  const p = profile as { full_name?: string | null; role?: string; is_superadmin?: boolean } | null;
  const displayName = p?.full_name ?? user.email ?? 'Usuário';
  const isSuperadmin = p?.is_superadmin === true;
  const roleLabel = isSuperadmin ? 'Admin geral' : p?.role === 'staff' ? 'Profissional' : 'Paciente';

  return (
    <AppShell userName={displayName} userEmail={user.email ?? ''} roleLabel={roleLabel} isSuperadmin={isSuperadmin}>
      {children}
    </AppShell>
  );
}
