// Edge Function: cria um usuário de SISTEMA (auth) já confirmado, com senha aleatória
// enviada por e-mail (Resend). Só o ADMIN GERAL (is_superadmin) pode chamar. verify_jwt=true.
// Tipos: 'admin' (admin geral) | 'professional' (médico de uma clínica existente).
// Para profissional em NOVA clínica, use a função provision-clinic.
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
    .select('clinic_id, is_superadmin')
    .eq('id', caller.id)
    .maybeSingle();
  if (!prof || (prof as any).is_superadmin !== true) {
    return json({ error: 'Apenas o admin geral pode criar usuários.' }, 403);
  }
  const callerClinic = (prof as any).clinic_id as string;

  // 3) Valida entrada.
  let name = '', email = '', type = 'professional', clinicId = '';
  let specialty = '', crm = '', phone = '';
  try {
    const b = await req.json();
    name = String(b.name ?? '').trim();
    email = String(b.email ?? '').trim().toLowerCase();
    type = String(b.type ?? 'professional').trim();
    clinicId = String(b.clinicId ?? '').trim();
    specialty = String(b.specialty ?? '').trim();
    crm = String(b.crm ?? '').trim();
    phone = String(b.phone ?? '').trim();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  if (!name) return json({ error: 'Informe o nome.' }, 400);
  if (!email || !email.includes('@')) return json({ error: 'Informe um e-mail válido.' }, 400);
  if (type !== 'admin' && type !== 'professional') return json({ error: 'Tipo inválido.' }, 400);

  // Clínica de destino: admin -> clínica do autor; profissional -> clínica escolhida.
  let targetClinic = callerClinic;
  if (type === 'professional') {
    if (!clinicId) return json({ error: 'Selecione a clínica do profissional.' }, 400);
    targetClinic = clinicId;
    // Já existe um médico com este e-mail? (cobre médicos sem login, ex.: seed)
    const { data: existingDoc } = await admin.from('doctors').select('id').eq('email', email).limit(1);
    if (existingDoc && existingDoc.length > 0) {
      return json({ error: 'Já existe um médico com este e-mail.' }, 409);
    }
  }
  const jobTitle = type === 'admin' ? 'Administrador' : 'Médico';

  // 4) Cria o usuário (confirmado). O trigger cria o profile a partir do metadata.
  const tempPassword = randomPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: name, role: 'staff', clinic_id: targetClinic, job_title: jobTitle },
  });
  if (createErr) {
    const msg = createErr.message.toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return json({ error: 'Este e-mail já está cadastrado.' }, 409);
    }
    return json({ error: 'Não foi possível criar o usuário.' }, 400);
  }
  const newId = created.user?.id;

  // 5) Ajustes por tipo.
  if (type === 'admin' && newId) {
    await admin.from('profiles').update({ is_superadmin: true }).eq('id', newId);
  }
  if (type === 'professional' && newId) {
    await admin.from('doctors').insert({
      clinic_id: targetClinic,
      full_name: name,
      specialty: specialty || 'Transplante capilar',
      crm: crm || null,
      phone: phone || null,
      email,
      active: true,
    });
  }

  // 6) Envia a senha por e-mail (Resend). Sem secret -> devolve para repasse manual.
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const senderEmail = Deno.env.get('RESEND_SENDER_EMAIL') ?? 'onboarding@resend.dev';
  const senderName = Deno.env.get('RESEND_SENDER_NAME') ?? 'PostCare Pro';
  if (!apiKey) return json({ ok: true, emailed: false, tempPassword });

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0F172A">
      <h1 style="font-size:20px;margin:0 0 8px">Bem-vindo(a), ${name}!</h1>
      <p style="color:#475569;font-size:14px;line-height:1.6">Uma conta foi criada para voce no PostCare Pro. Use a senha temporaria abaixo para entrar e troque-a no primeiro acesso.</p>
      <div style="margin:24px 0;padding:16px;text-align:center;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px">
        <span style="font-size:24px;font-weight:700;letter-spacing:2px;color:#1D4ED8">${tempPassword}</span>
      </div>
      <p style="color:#475569;font-size:14px">E-mail de acesso: <strong>${email}</strong></p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${senderName} <${senderEmail}>`, to: [email], subject: 'Seu acesso ao PostCare Pro', html }),
  }).catch(() => null);

  if (!res || !res.ok) return json({ ok: true, emailed: false, tempPassword });
  return json({ ok: true, emailed: true });
});
