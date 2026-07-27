import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface SessionProfile {
  userId: string;
  clinicId: string | null;
  role: string | null;
  jobTitle: string | null;
  isSuperadmin: boolean;
}

// Perfil do usuário logado no servidor (layout/guards).
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('clinic_id, role, job_title, is_superadmin')
    .eq('id', user.id)
    .maybeSingle();
  const p = data as { clinic_id?: string; role?: string; job_title?: string; is_superadmin?: boolean } | null;
  return {
    userId: user.id,
    clinicId: p?.clinic_id ?? null,
    role: p?.role ?? null,
    jobTitle: p?.job_title ?? null,
    isSuperadmin: p?.is_superadmin === true,
  };
}

// Guarda de rota: só admin geral. Médico é redirecionado ao dashboard.
export async function requireSuperadmin(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect('/');
  if (!profile.isSuperadmin) redirect('/dashboard');
  return profile;
}
