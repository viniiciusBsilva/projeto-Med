import { requireSuperadmin } from '@/lib/auth';

// Só o admin geral acessa Cirurgias. Médico é redirecionado ao dashboard.
export default async function SurgeriesLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return <>{children}</>;
}
