// Edge Function: cria conta de staff já confirmada (sem depender de e-mail de confirmação).
// Usa service_role -> admin.createUser({ email_confirm: true }). O trigger on_auth_user_created
// cria o profile (role 'staff', clínica demo por padrão). verify_jwt=false (usuário deslogado).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let email = '', password = '', fullName = '';
  try {
    const b = await req.json();
    email = String(b.email ?? '').trim().toLowerCase();
    password = String(b.password ?? '');
    fullName = String(b.fullName ?? '').trim();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  if (!email || !email.includes('@')) return json({ error: 'Informe um e-mail válido.' }, 400);
  if (password.length < 8) return json({ error: 'A senha deve ter ao menos 8 caracteres.' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // marca como confirmado -> login imediato, sem e-mail
    user_metadata: { full_name: fullName || null, role: 'staff' },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return json({ error: 'Este e-mail já está cadastrado. Faça login.' }, 409);
    }
    return json({ error: 'Não foi possível criar a conta.' }, 400);
  }

  return json({ ok: true });
});
