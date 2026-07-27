import { requireSuperadmin } from '@/lib/auth';

// Área do admin geral: gestão de clínicas e onboarding de profissionais.
export default async function ClinicsLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();
  return <>{children}</>;
}
