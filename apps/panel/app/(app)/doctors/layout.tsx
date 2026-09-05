import { requireSuperadmin } from '@/lib/auth';

// Só o admin geral acessa Médicos. Médico é redirecionado ao dashboard.
export default async function DoctorsLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return <>{children}</>;
}
