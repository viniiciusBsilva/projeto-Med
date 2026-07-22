// Edge Function: cria um membro da equipe (staff) já confirmado, com senha aleatória
// enviada por e-mail (Brevo). Só um staff autenticado pode chamar; o novo usuário entra
// SEMPRE na clínica do autor (o clinic_id do client é ignorado). verify_jwt=true.
// Secrets: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME? (opcional).
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

function randomPassword(len = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const specials = '!@#$%&*';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len - 2; i++) out += chars[bytes[i] % chars.length];
  // garante ao menos 1 dígito e 1 especial
  out += String(bytes[len - 2] % 10);
  out += specials[bytes[len - 1] % specials.length];
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // 1) Identifica o autor pelo JWT do header Authorization.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser();
  const caller = userData?.user;
  if (!caller) return json({ error: 'Não autenticado.' }, 401);

  const admin = createClient(url, serviceKey);

  // 2) Autor precisa ser staff; usamos a clínica DELE.
  const { data: prof } = await admin
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', caller.id)
    .maybeSingle();
  if (!prof || (prof as any).role !== 'staff') {
    return json({ error: 'Apenas membros da equipe podem criar usuários.' }, 403);
  }
  const clinicId = (prof as any).clinic_id as string;

  // 3) Valida entrada.
  let email = '', name = '', permission = '';
  try {
    const b = await req.json();
    email = String(b.email ?? '').trim().toLowerCase();
    name = String(b.name ?? '').trim();
    permission = String(b.permission ?? '').trim();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  if (!name) return json({ error: 'Informe o nome.' }, 400);
  if (!email || !email.includes('@')) return json({ error: 'Informe um e-mail válido.' }, 400);

  // 4) Cria o usuário (confirmado) com senha aleatória. O trigger cria o profile na clínica do autor.
  const tempPassword = randomPassword();
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: name, role: 'staff', clinic_id: clinicId, job_title: permission || null },
  });
  if (createErr) {
    const msg = createErr.message.toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return json({ error: 'Este e-mail já está cadastrado.' }, 409);
    }
    return json({ error: 'Não foi possível criar o usuário.' }, 400);
  }

  // 5) Envia a senha por e-mail (Brevo). Sem secrets -> devolve a senha para repasse manual.
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const senderEmail = Deno.env.get('RESEND_SENDER_EMAIL') ?? 'onboarding@resend.dev';
  const senderName = Deno.env.get('RESEND_SENDER_NAME') ?? 'PostCare Pro';
  if (!apiKey) {
    return json({ ok: true, emailed: false, tempPassword });
  }

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0F172A">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px">
        <div style="width:36px;height:36px;border-radius:10px;background:#2563EB;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">P</div>
        <span style="font-size:18px;font-weight:700">PostCare <span style="color:#2563EB">Pro</span></span>
      </div>
      <h1 style="font-size:20px;margin:0 0 8px">Bem-vindo(a), ${name}!</h1>
      <p style="color:#475569;font-size:14px;line-height:1.6">Uma conta foi criada para voce no PostCare Pro. Use a senha temporaria abaixo para entrar e troque-a no primeiro acesso em "Esqueci minha senha".</p>
      <div style="margin:24px 0;padding:16px;text-align:center;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px">
        <span style="font-size:24px;font-weight:700;letter-spacing:2px;color:#1D4ED8">${tempPassword}</span>
      </div>
      <p style="color:#475569;font-size:14px">E-mail de acesso: <strong>${email}</strong></p>
      <p style="color:#94A3B8;font-size:13px;line-height:1.6">Se voce nao esperava este e-mail, ignore-o.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${senderName} <${senderEmail}>`,
      to: [email],
      subject: 'Seu acesso ao PostCare Pro',
      html,
    }),
  }).catch(() => null);

  if (!res || !res.ok) {
    // Usuário criado, mas o e-mail falhou: devolve a senha para repasse manual.
    return json({ ok: true, emailed: false, tempPassword });
  }
  return json({ ok: true, emailed: true });
});
