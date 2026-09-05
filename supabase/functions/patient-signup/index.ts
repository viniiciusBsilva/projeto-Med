// Edge Function: cadastro do paciente (transplante capilar).
// Cria auth (role=patient, confirmado), a linha em patients, liga profiles.patient_id e grava o intake.
// O paciente entra na clínica do `clinicCode` (código de convite do profissional); sem código -> demo.
// O app faz signin em seguida (com a senha) e envia as fotos ao Storage. verify_jwt=false.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const DEMO_CLINIC = '00000000-0000-0000-0000-000000000001';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any;
  try {
    b = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  const fullName = String(b.fullName ?? '').trim();
  const clinicCode = String(b.clinicCode ?? '').trim().toUpperCase();
  if (!fullName) return json({ error: 'Informe o nome completo.' }, 400);
  if (!email || !email.includes('@')) return json({ error: 'Informe um e-mail válido.' }, 400);
  if (password.length < 8) return json({ error: 'A senha deve ter ao menos 8 caracteres.' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 0) Resolve a clínica pelo código de convite (sem código -> demo).
  let clinicId = DEMO_CLINIC;
  if (clinicCode) {
    const { data: clinic } = await admin
      .from('clinics')
      .select('id')
      .eq('invite_code', clinicCode)
      .maybeSingle();
    if (!clinic) return json({ error: 'Código de clínica inválido.' }, 400);
    clinicId = (clinic as { id: string }).id;
  }

  // 1) cria o usuário (confirmado) como paciente da clínica resolvida
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'patient', clinic_id: clinicId },
  });
  if (createErr || !created?.user) {
    const msg = (createErr?.message ?? '').toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return json({ error: 'Este e-mail já está cadastrado.' }, 409);
    }
    return json({ error: 'Não foi possível criar a conta.' }, 400);
  }
  const userId = created.user.id;

  // 2) cria a linha em patients
  const { data: patient, error: pErr } = await admin
    .from('patients')
    .insert({
      clinic_id: clinicId,
      full_name: fullName,
      cpf: b.cpf || null,
      birth_date: b.birthDate || null,
      phone: b.phone || null,
      email,
    })
    .select('id')
    .single();
  if (pErr || !patient) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return json({ error: 'Falha ao registrar o paciente.' }, 400);
  }
  const patientId = patient.id as string;

  // 3) liga o profile ao patient (o trigger já criou o profile com role=patient)
  await admin.from('profiles').update({ patient_id: patientId }).eq('id', userId);

  // 4) grava o intake do transplante
  await admin.from('surgery_intake').insert({
    patient_id: patientId,
    clinic_id: clinicId,
    technique: b.technique || null,
    region: b.region || null,
    grafts_estimate: b.graftsEstimate ? Number(b.graftsEstimate) : null,
    medications: b.medications || null,
    allergies: b.allergies || null,
    comorbidities: b.comorbidities || null,
    smoker: !!b.smoker,
    notes: b.notes || null,
  });

  return json({ ok: true, patientId });
});
