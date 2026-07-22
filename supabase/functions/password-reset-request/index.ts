// Edge Function: solicita reset de senha por código (OTP).
// Gera um código de 6 dígitos, grava o hash em password_reset_codes e envia por e-mail (Resend).
// verify_jwt=false (usuário deslogado chama). Respostas sempre genéricas (não enumera e-mails).
// Secrets: RESEND_API_KEY, RESEND_SENDER_EMAIL?, RESEND_SENDER_NAME?, RESET_CODE_PEPPER?
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CODE_TTL_MIN = 15;
const RESEND_THROTTLE_SEC = 60;

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

  let email = '';
  try {
    email = String((await req.json()).email ?? '').trim().toLowerCase();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  if (!email || !email.includes('@')) return json({ error: 'Informe um e-mail válido.' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Resposta genérica padrão (não revela se o e-mail existe).
  const generic = json({ ok: true });

  const { data: userId } = await admin.rpc('user_id_by_email', { p_email: email });
  if (!userId) return generic;

  // Throttle de reenvio: se já houve código há menos de RESEND_THROTTLE_SEC, não reenvia.
  const { data: recent } = await admin
    .from('password_reset_codes')
    .select('created_at')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_THROTTLE_SEC * 1000) {
    return generic;
  }

  // Invalida códigos anteriores e cria um novo.
  await admin.from('password_reset_codes').update({ used: true }).eq('email', email).eq('used', false);

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
  const pepper = Deno.env.get('RESET_CODE_PEPPER') ?? '';
  const codeHash = await sha256(code + pepper);
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString();

  const { error: insErr } = await admin.from('password_reset_codes').insert({
    email,
    user_id: userId,
    code_hash: codeHash,
    expires_at: expiresAt,
  });
  if (insErr) return json({ error: 'Não foi possível iniciar a recuperação.' }, 500);

  // Envia o e-mail via Resend.
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const senderEmail = Deno.env.get('RESEND_SENDER_EMAIL') ?? 'onboarding@resend.dev';
  const senderName = Deno.env.get('RESEND_SENDER_NAME') ?? 'PostCare Pro';
  if (apiKey) {
    const html = `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0F172A">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px">
          <div style="width:36px;height:36px;border-radius:10px;background:#2563EB;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">P</div>
          <span style="font-size:18px;font-weight:700">PostCare <span style="color:#2563EB">Pro</span></span>
        </div>
        <h1 style="font-size:20px;margin:0 0 8px">Recuperação de senha</h1>
        <p style="color:#475569;font-size:14px;line-height:1.6">Use o código abaixo para redefinir sua senha. Ele expira em ${CODE_TTL_MIN} minutos.</p>
        <div style="margin:24px 0;padding:16px;text-align:center;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px">
          <span style="font-size:34px;font-weight:700;letter-spacing:8px;color:#1D4ED8">${code}</span>
        </div>
        <p style="color:#94A3B8;font-size:13px;line-height:1.6">Se você não solicitou a recuperação, ignore este e-mail — sua senha continua a mesma.</p>
      </div>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [email],
        subject: 'Seu código de recuperação — PostCare Pro',
        html,
      }),
    }).catch(() => {});
  }

  return generic;
});
