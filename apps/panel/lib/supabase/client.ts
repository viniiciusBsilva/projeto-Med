import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Falso quando o bundle foi construído sem as variáveis públicas — o caso
 * típico é a Netlify/Vercel sem as env configuradas no projeto.
 *
 * Vale saber: `NEXT_PUBLIC_*` é embutido em tempo de BUILD, não lido em
 * runtime. Se faltou no build, falta em todo lugar, e configurar depois exige
 * um novo deploy.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Client Supabase para Client Components (browser).
 * Só chaves públicas (anon). Ver docs/PROJECT_STANDARDS.md §7.
 */
export function createClient() {
  // As páginas públicas (`/` e `/reset-password`) criam o client num `useMemo`,
  // que roda também na pré-renderização do build. Com `!` nas env ausentes o
  // `createBrowserClient` lançava ali e derrubava o build INTEIRO: o
  // `index.html` da tela de login não era gerado e o site subia sem nada —
  // exatamente o sintoma de "página em HTML puro".
  //
  // Aqui o client é construído mesmo sem configuração, para o build passar.
  // Quem avisa o usuário é a própria tela, via `isSupabaseConfigured` — o erro
  // fica visível em vez de virar uma tela morta.
  return createBrowserClient<Database>(
    SUPABASE_URL ?? 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
  );
}
