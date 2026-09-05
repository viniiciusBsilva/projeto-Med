// Edge Function: ÚNICO caminho de saída para o WhatsApp.
// Envia pela Z-API e grava a mensagem no histórico, numa operação só. O cron de
// protocolo e o painel passam por aqui; o agente chama `deliver()` direto, sem
// o salto HTTP, mas pelo mesmo código.
//
// verify_jwt=false — a autenticação é feita aqui, em dois modos:
//   x-wa-secret == WA_HOOK_SECRET     -> chamador servidor (cron pg_net)
//   Authorization: Bearer <jwt staff> -> painel (o segredo NUNCA vai ao browser)
//
// Secrets: WA_HOOK_SECRET, ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN.
//
// Corpo, um dos dois:
//   { protocolMessageId }                              -> disparo do protocolo
//   { conversationId|patientId, body, attachment?, sender? }
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json, secretMatches, safeLog } from '../_shared/http.ts';
import { deliver, type Conversation, type OutgoingAttachment } from '../_shared/deliver.ts';
import { toE164BRStrict } from '../_shared/phone.ts';

const MEDIA_KINDS = ['image', 'pdf', 'video', 'audio'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // deno-lint-ignore no-explicit-any
  let b: any;
  try {
    b = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  // --- autenticação -------------------------------------------------------
  const isServerCaller = secretMatches(req.headers.get('x-wa-secret'), Deno.env.get('WA_HOOK_SECRET'));
  let staff: { clinicId: string; isSuperadmin: boolean } | null = null;

  if (!isServerCaller) {
    staff = await authenticateStaff(admin, req.headers.get('Authorization'));
    if (!staff) return json({ error: 'unauthorized' }, 401);
  }

  // -------------------------------------------------------------------------
  // Modo protocolo (só chamador servidor): resolve o disparo e fecha o status.
  // -------------------------------------------------------------------------
  if (b.protocolMessageId) {
    if (!isServerCaller) return json({ error: 'forbidden' }, 403);
    const id = String(b.protocolMessageId);

    const { data: pm } = await admin
      .from('protocol_messages')
      .select('id, clinic_id, patient_id, status, step_id')
      .eq('id', id)
      .maybeSingle();

    if (!pm) return json({ error: 'protocol_message não encontrada.' }, 404);
    // O claim atômico já marcou 'sending'; qualquer outro estado é reentrada.
    if (pm.status !== 'sending') return json({ ok: true, skipped: pm.status });

    const { data: step } = await admin
      .from('protocol_steps').select('instructions').eq('id', pm.step_id).maybeSingle();

    const body = (step?.instructions ?? '').trim();
    if (!body || body.startsWith('[TEXTO A DEFINIR')) {
      // Placeholder não vai para o paciente. Fica pendente até o médico escrever.
      await admin.from('protocol_messages')
        .update({ status: 'failed', last_error: 'passo sem texto definido pelo médico' })
        .eq('id', id);
      safeLog('protocol_skipped_placeholder', { protocol_message_id: id, step_id: pm.step_id });
      return json({ ok: true, skipped: 'placeholder' });
    }

    const conv = await ensureConversation(admin, pm.clinic_id, pm.patient_id);
    if (!conv) {
      await admin.from('protocol_messages')
        .update({ status: 'failed', last_error: 'paciente sem telefone' }).eq('id', id);
      return json({ ok: false, error: 'sem telefone' }, 422);
    }

    // Nota: o disparo sai mesmo com ai_enabled=false — é comunicação da clínica,
    // não da IA. Se a clínica quiser segurar disparos para paciente com alerta
    // aberto, essa política precisa vir do médico antes de ser implementada.
    try {
      const waId = await deliver(admin, conv, body, 'system');
      await admin.from('protocol_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString(), wa_message_id: waId })
        .eq('id', id);
      safeLog('protocol_sent', { protocol_message_id: id, conversation_id: conv.id });
      return json({ ok: true, sent: 1 });
    } catch (e) {
      // Volta para 'scheduled': o próprio cron tenta de novo (até 3 vezes).
      await admin.from('protocol_messages')
        .update({ status: 'scheduled', last_error: String(e).slice(0, 300) }).eq('id', id);
      safeLog('protocol_send_failed', { protocol_message_id: id, error: String(e).slice(0, 200) });
      return json({ ok: false, error: 'falha no envio' }, 502);
    }
  }

  // -------------------------------------------------------------------------
  // Modo avulso: painel (ou chamador servidor).
  // -------------------------------------------------------------------------
  const body = String(b.body ?? '').trim();
  const attachment = parseAttachment(b.attachment);
  if (b.attachment && !attachment) return json({ error: 'Anexo inválido.' }, 400);
  if (!body && !attachment) return json({ error: 'Mensagem vazia.' }, 400);

  let conv: Conversation | null = null;
  if (b.conversationId) {
    const { data } = await admin
      .from('conversations').select('id, clinic_id, patient_id, wa_phone')
      .eq('id', String(b.conversationId)).maybeSingle();
    conv = (data ?? null) as Conversation | null;
  } else if (b.patientId) {
    const { data: p } = await admin
      .from('patients').select('clinic_id').eq('id', String(b.patientId)).maybeSingle();
    if (p) conv = await ensureConversation(admin, p.clinic_id, String(b.patientId));
  }

  if (!conv) return json({ error: 'Conversa não encontrada. O paciente tem WhatsApp cadastrado?' }, 404);

  // Isolamento de tenant: staff só fala com paciente da própria clínica.
  if (staff && !staff.isSuperadmin && conv.clinic_id !== staff.clinicId) {
    return json({ error: 'forbidden' }, 403);
  }

  // A IA não pode ser forjada pelo painel — mensagem de humano é 'staff'.
  const sender: 'ai' | 'staff' | 'system' = isServerCaller
    ? (b.sender === 'ai' || b.sender === 'system' ? b.sender : 'staff')
    : 'staff';

  try {
    const waId = await deliver(admin, conv, body, sender, attachment);
    return json({ ok: true, wa_message_id: waId, conversation_id: conv.id });
  } catch (e) {
    safeLog('wa_send_failed', { conversation_id: conv.id, error: String(e).slice(0, 200) });
    return json({ ok: false, error: 'Não foi possível enviar pelo WhatsApp.' }, 502);
  }
});

/** Valida o JWT do painel e devolve a clínica do usuário, se for staff ativo. */
async function authenticateStaff(
  admin: SupabaseClient,
  authHeader: string | null,
): Promise<{ clinicId: string; isSuperadmin: boolean } | null> {
  const jwt = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;

  const { data: userData, error } = await admin.auth.getUser(jwt);
  if (error || !userData?.user) return null;

  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role, is_superadmin')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!profile || profile.role !== 'staff') return null;
  return { clinicId: profile.clinic_id, isSuperadmin: Boolean(profile.is_superadmin) };
}

// deno-lint-ignore no-explicit-any
function parseAttachment(a: any): OutgoingAttachment | undefined {
  if (!a) return undefined;
  if (typeof a.path !== 'string' || !MEDIA_KINDS.includes(a.type)) return undefined;
  return { path: a.path, type: a.type, name: String(a.name ?? 'arquivo') };
}

/** Conversa do paciente, criando a partir do telefone cadastrado se ainda não existir. */
async function ensureConversation(
  admin: SupabaseClient,
  clinicId: string,
  patientId: string,
): Promise<Conversation | null> {
  const cols = 'id, clinic_id, patient_id, wa_phone';

  const { data: existing } = await admin
    .from('conversations').select(cols).eq('patient_id', patientId).maybeSingle();
  if (existing) return existing as Conversation;

  const { data: patient } = await admin
    .from('patients').select('phone, phone_e164').eq('id', patientId).maybeSingle();

  // Cadastro antigo pode ter só `phone` livre; normaliza na hora de precisar.
  // Versão estrita: sem palpite, para não mandar dado de saúde a outro número.
  const e164 = patient?.phone_e164 ?? toE164BRStrict(patient?.phone);
  if (!e164) return null;
  if (!patient?.phone_e164) {
    await admin.from('patients').update({ phone_e164: e164 }).eq('id', patientId);
  }

  const { data: created } = await admin
    .from('conversations')
    .insert({ clinic_id: clinicId, patient_id: patientId, wa_phone: e164 })
    .select(cols)
    .single();
  return (created ?? null) as Conversation | null;
}
