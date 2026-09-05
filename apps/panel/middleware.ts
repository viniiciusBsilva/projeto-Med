import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Rotas do painel autenticado (grupo (app)). Sem sessão -> volta pro login.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/patients',
  '/alertas',
  '/mensagens-programadas',
  '/doctors',
  '/calendar',
  '/messages',
  '/notifications',
  '/reports',
  '/settings',
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  // Deploy sem as variáveis públicas (env não configurada na Netlify/Vercel):
  // o middleware roda em TODA requisição, e criar o client aqui lançava e
  // devolvia 500 em todas as páginas. Sem configuração não há sessão para
  // validar — deixa passar e a tela de login exibe o aviso de configuração.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  // Atualiza a sessão (refresh de token) e obtém o usuário.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  const isLogin = path === '/';

  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (user && isLogin) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  // Ignora estáticos, imagens e favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
