// Edge Function: valida o código OTP de reset SEM trocar a senha (etapa 2 do fluxo).
// Não marca o código como usado — quem consome é o password-reset-confirm na etapa 3.
// verify_jwt=false. Secret opcional: RESET_CODE_PEPPER (deve casar com o request).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_ATTEMPTS = 5;

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let email = '', code = '';
  try {
    const b = await req.json();
    email = String(b.email ?? '').trim().toLowerCase();
    code = String(b.code ?? '').trim();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  if (!email || !code) return json({ error: 'Informe o e-mail e o código.' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: row } = await admin
    .from('password_reset_codes')
    .select('*')
    .eq('email', email)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return json({ error: 'Código inválido ou expirado.' }, 400);

  if (row.attempts >= MAX_ATTEMPTS) {
    await admin.from('password_reset_codes').update({ used: true }).eq('id', row.id);
    return json({ error: 'Muitas tentativas. Solicite um novo código.' }, 429);
  }

  const pepper = Deno.env.get('RESET_CODE_PEPPER') ?? '';
  const codeHash = await sha256(code + pepper);
  if (codeHash !== row.code_hash) {
    await admin.from('password_reset_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return json({ error: 'Código inválido ou expirado.' }, 400);
  }

  // Código válido — não consome aqui; o confirm troca a senha e marca como usado.
  return json({ ok: true });
});
