// Edge Function: onboarding de uma nova clínica + seu profissional (médico).
// Só o ADMIN GERAL (profiles.is_superadmin) pode chamar. verify_jwt=true.
// Cria: clinics -> auth user (staff da nova clínica) -> registro em doctors.
// Secrets (opcionais p/ e-mail): RESEND_API_KEY, RESEND_SENDER_EMAIL, RESEND_SENDER_NAME.
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
  out += String(bytes[len - 2] % 10);
  out += specials[bytes[len - 1] % specials.length];
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // 1) Identifica o autor pelo JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser();
  const caller = userData?.user;
  if (!caller) return json({ error: 'Não autenticado.' }, 401);

  const admin = createClient(url, serviceKey);

  // 2) Só admin geral (super-admin).
  const { data: prof } = await admin
    .from('profiles')
    .select('is_superadmin')
    .eq('id', caller.id)
    .maybeSingle();
  if (!prof || (prof as any).is_superadmin !== true) {
    return json({ error: 'Apenas o admin geral pode cadastrar clínicas.' }, 403);
  }

  // 3) Valida entrada.
  let clinicName = '', plan = 'starter', profName = '', email = '', specialty = '', crm = '', phone = '';
  try {
    const b = await req.json();
    clinicName = String(b.clinicName ?? '').trim();
    plan = String(b.plan ?? 'starter').trim() || 'starter';
    profName = String(b.professionalName ?? '').trim();
    email = String(b.email ?? '').trim().toLowerCase();
    specialty = String(b.specialty ?? '').trim();
    crm = String(b.crm ?? '').trim();
    phone = String(b.phone ?? '').trim();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  if (!clinicName) return json({ error: 'Informe o nome da clínica.' }, 400);
  if (!profName) return json({ error: 'Informe o nome do profissional.' }, 400);
  if (!email || !email.includes('@')) return json({ error: 'Informe um e-mail válido.' }, 400);

  // 4) Cria a clínica.
  const { data: clinic, error: clinicErr } = await admin
    .from('clinics')
    .insert({ name: clinicName, plan })
    .select('id')
    .single();
  if (clinicErr || !clinic) return json({ error: 'Não foi possível criar a clínica.' }, 400);
  const clinicId = (clinic as any).id as string;

  // 5) Cria o profissional (staff da nova clínica). NÃO é super-admin (default false).
  const tempPassword = randomPassword();
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: profName, role: 'staff', clinic_id: clinicId, job_title: 'Médico' },
  });
  if (createErr) {
    // rollback da clínica se o usuário falhar
    await admin.from('clinics').delete().eq('id', clinicId);
    const msg = createErr.message.toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return json({ error: 'Este e-mail já está cadastrado.' }, 409);
    }
    return json({ error: 'Não foi possível criar o profissional.' }, 400);
  }

  // 6) Registra o profissional na tabela de médicos da clínica (para a agenda).
  await admin.from('doctors').insert({
    clinic_id: clinicId,
    full_name: profName,
    specialty: specialty || 'Transplante capilar',
    crm: crm || null,
    phone: phone || null,
    email,
    active: true,
  });

  // 7) Envia a senha por e-mail (Resend). Sem secret -> devolve para repasse manual.
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const senderEmail = Deno.env.get('RESEND_SENDER_EMAIL') ?? 'onboarding@resend.dev';
  const senderName = Deno.env.get('RESEND_SENDER_NAME') ?? 'PostCare Pro';
  if (!apiKey) return json({ ok: true, clinicId, emailed: false, tempPassword });

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0F172A">
      <h1 style="font-size:20px;margin:0 0 8px">Bem-vindo(a), ${profName}!</h1>
      <p style="color:#475569;font-size:14px;line-height:1.6">A clínica <strong>${clinicName}</strong> foi criada no PostCare Pro. Use a senha temporária abaixo para entrar e troque-a no primeiro acesso.</p>
      <div style="margin:24px 0;padding:16px;text-align:center;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px">
        <span style="font-size:24px;font-weight:700;letter-spacing:2px;color:#1D4ED8">${tempPassword}</span>
      </div>
      <p style="color:#475569;font-size:14px">E-mail de acesso: <strong>${email}</strong></p>
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

  if (!res || !res.ok) return json({ ok: true, clinicId, emailed: false, tempPassword });
  return json({ ok: true, clinicId, emailed: true });
});
