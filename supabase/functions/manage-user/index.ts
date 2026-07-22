// Edge Function: gerenciar membros da equipe. Só ADMINISTRADOR (staff + job_title 'Administrador').
// Ações: 'update' (nome/permissão) e 'setActive' (ativar/inativar = ban/unban no Auth).
// Regras: não pode alterar a própria permissão nem inativar a si mesmo. Mesmo clinic_id apenas.
// verify_jwt=true.
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

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser();
  const caller = userData?.user;
  if (!caller) return json({ error: 'Não autenticado.' }, 401);

  const admin = createClient(url, serviceKey);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('clinic_id, role, job_title')
    .eq('id', caller.id)
    .maybeSingle();
  const cp = callerProfile as { clinic_id: string; role: string; job_title: string | null } | null;
  if (!cp || cp.role !== 'staff' || cp.job_title !== 'Administrador') {
    return json({ error: 'Apenas administradores podem gerenciar usuários.' }, 403);
  }

  let body: { userId?: string; action?: string; name?: string; permission?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  const { userId, action } = body;
  if (!userId || !action) return json({ error: 'Parâmetros ausentes.' }, 400);

  // Alvo precisa estar na mesma clínica.
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('clinic_id')
    .eq('id', userId)
    .maybeSingle();
  const tp = targetProfile as { clinic_id: string } | null;
  if (!tp || tp.clinic_id !== cp.clinic_id) {
    return json({ error: 'Usuário não encontrado nesta clínica.' }, 404);
  }

  const isSelf = userId === caller.id;

  if (action === 'update') {
    const patch: Record<string, unknown> = {};
    const meta: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) {
      patch.full_name = body.name.trim();
      meta.full_name = body.name.trim();
    }
    // Não permite alterar a própria permissão.
    if (typeof body.permission === 'string' && !isSelf) {
      patch.job_title = body.permission.trim() || null;
      meta.job_title = body.permission.trim() || null;
    }
    if (Object.keys(patch).length === 0) return json({ error: 'Nada para atualizar.' }, 400);

    const { error } = await admin.from('profiles').update(patch).eq('id', userId);
    if (error) return json({ error: 'Não foi possível atualizar o usuário.' }, 400);
    // Mantém o metadata do Auth em sincronia (best-effort).
    await admin.auth.admin.updateUserById(userId, { user_metadata: meta }).catch(() => {});
    return json({ ok: true });
  }

  if (action === 'setActive') {
    if (isSelf) return json({ error: 'Você não pode inativar a si mesmo.' }, 400);
    const active = body.active !== false;
    const { error } = await admin.from('profiles').update({ active }).eq('id', userId);
    if (error) return json({ error: 'Não foi possível alterar o status.' }, 400);
    // Bloqueia/desbloqueia o login no Auth.
    await admin.auth.admin
      .updateUserById(userId, { ban_duration: active ? 'none' : '876000h' })
      .catch(() => {});
    return json({ ok: true, active });
  }

  return json({ error: 'Ação desconhecida.' }, 400);
});
