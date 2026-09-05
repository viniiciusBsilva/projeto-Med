// Edge Function: recebe as mensagens do paciente pela Z-API (CLAUDE.md §3).
//
// A Z-API não assina o payload, então a origem é validada por segredo
// compartilhado na query string: configure o webhook como
//   https://<projeto>.supabase.co/functions/v1/wa-webhook?s=<ZAPI_WEBHOOK_SECRET>
// verify_jwt=false (a Z-API não manda JWT).
//
// Secrets: ZAPI_WEBHOOK_SECRET, ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN,
//          ANTHROPIC_API_KEY.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json, secretMatches, safeLog } from '../_shared/http.ts';
import { parseInbound } from '../_shared/zapi.ts';
import { e164Variants } from '../_shared/phone.ts';
import { deliver, type Conversation } from '../_shared/deliver.ts';
import { runAgent } from '../_shared/agent.ts';

// Janela de agrupamento (§7.2): o paciente manda "oi" / "queria marcar" /
// "amanhã à tarde" em sequência. Processar uma a uma confunde o agente.
const DEBOUNCE_MS = 6000;

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // 1. Origem (§1.4)
  const provided = new URL(req.url).searchParams.get('s');
  if (!secretMatches(provided, Deno.env.get('ZAPI_WEBHOOK_SECRET'))) {
    return json({ error: 'unauthorized' }, 401);
  }

  // deno-lint-ignore no-explicit-any
  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const msg = parseInbound(raw);

  // Callbacks de status, ecos das nossas próprias mensagens e grupos não são
  // conversa de paciente. Sempre 200 — erro faz a Z-API reenviar em loop.
  if (msg.isStatusCallback || msg.fromMe || msg.isGroup) return json({ ok: true, ignored: true });
  if (!msg.phoneE164 || !msg.waMessageId) return json({ ok: true, ignored: 'sem telefone ou id' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 2. Deduplicação (§7.1) — a Z-API reenvia webhooks.
  const { data: seen } = await admin
    .from('messages').select('id').eq('wa_message_id', msg.waMessageId).maybeSingle();
  if (seen) {
    safeLog('inbound_duplicate', { wa_message_id: msg.waMessageId });
    return json({ ok: true, duplicate: true });
  }

  // 3. Tenant: quem identifica a clínica é o número DELA, não o do paciente.
  const instanceId = msg.instanceId ?? Deno.env.get('ZAPI_INSTANCE_ID') ?? null;
  const { data: clinic } = await admin
    .from('clinics').select('id, name').eq('wa_instance_id', instanceId).maybeSingle();
  if (!clinic) {
    safeLog('inbound_unknown_instance', { instance_id: instanceId });
    return json({ ok: true, ignored: 'instância não vinculada a nenhuma clínica' });
  }

  // 4/5. Paciente e conversa
  const patientId = await ensurePatient(admin, clinic.id, msg.phoneE164, msg.senderName);
  const conv = await ensureConversation(admin, clinic.id, patientId, msg.phoneE164);

  // 6. Grava a mensagem recebida. O índice único em wa_message_id é a rede de
  // segurança para dois webhooks idênticos chegando em paralelo.
  const bodyText = msg.text ?? (msg.kind === 'media' ? '[anexo recebido pelo WhatsApp]' : null);
  const { data: inserted, error: insertErr } = await admin
    .from('messages')
    .insert({
      clinic_id: clinic.id,
      patient_id: patientId,
      conversation_id: conv.id,
      sender: 'patient',
      body: bodyText,
      wa_message_id: msg.waMessageId,
    })
    .select('id')
    .single();

  if (insertErr) {
    safeLog('inbound_insert_conflict', { wa_message_id: msg.waMessageId });
    return json({ ok: true, duplicate: true });
  }

  await admin.from('conversations')
    .update({ last_inbound_at: new Date().toISOString() }).eq('id', conv.id);

  safeLog('inbound_stored', {
    conversation_id: conv.id,
    wa_message_id: msg.waMessageId,
    kind: msg.kind,
  });

  // 7. Handoff (§7.3): humano assumiu, a IA não responde.
  const { data: state } = await admin
    .from('conversations').select('ai_enabled').eq('id', conv.id).maybeSingle();
  if (!state?.ai_enabled) return json({ ok: true, ai: 'paused' });

  // Sem texto não há o que responder — o anexo fica registrado para a equipe.
  if (!msg.text) return json({ ok: true, ai: 'skipped_no_text' });

  // 8. Responde 200 já (a Z-API espera resposta rápida) e segue em background.
  const work = respondLater(admin, clinic.id, clinic.name, patientId, conv, inserted.id);
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else await work;

  return json({ ok: true });
});

/**
 * Debounce + agente + envio.
 *
 * O agrupamento é last-writer-wins: depois de esperar a janela, só segue quem
 * gravou a ÚLTIMA mensagem do paciente. As invocações anteriores desistem, e a
 * que segue leva todas as mensagens da janela num turno só. Sem estado extra e
 * sem cron — pg_cron tem granularidade de 1 minuto, grosso demais para 6s.
 */
async function respondLater(
  admin: SupabaseClient,
  clinicId: string,
  clinicName: string,
  patientId: string,
  conv: Conversation,
  myMessageId: string,
) {
  try {
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS));

    const { data: lastPatient } = await admin
      .from('messages')
      .select('id')
      .eq('conversation_id', conv.id)
      .eq('sender', 'patient')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastPatient || lastPatient.id !== myMessageId) {
      safeLog('debounce_superseded', { conversation_id: conv.id });
      return;
    }

    // A IA pode ter sido pausada por um alerta durante a janela de espera.
    const { data: state } = await admin
      .from('conversations').select('ai_enabled').eq('id', conv.id).maybeSingle();
    if (!state?.ai_enabled) return;

    // O agente lê o histórico do banco — as mensagens da janela já estão lá e
    // ele funde os turnos seguidos do paciente num só.
    const { reply, aiPaused } = await runAgent({
      admin,
      clinicId,
      clinicName,
      patientId,
      conversationId: conv.id,
    });

    if (reply) await deliver(admin, conv, reply, 'ai');
    if (aiPaused) safeLog('ai_paused', { conversation_id: conv.id });
  } catch (e) {
    // Falha do agente não pode virar retry da Z-API — já respondemos 200.
    safeLog('agent_failed', { conversation_id: conv.id, error: String(e).slice(0, 200) });
  }
}

/** Identifica o paciente pelo telefone; cria como lead no primeiro contato (§3). */
async function ensurePatient(
  admin: SupabaseClient,
  clinicId: string,
  phoneE164: string,
  senderName: string | null,
): Promise<string> {
  const variants = e164Variants(phoneE164);

  const { data: byE164 } = await admin
    .from('patients').select('id').eq('clinic_id', clinicId).in('phone_e164', variants).limit(1);
  if (byE164?.length) return byE164[0].id;

  // Cadastro antigo do painel: telefone em formato livre, sem phone_e164.
  const digits = phoneE164.replace(/\D/g, '').slice(-11);
  const { data: legacy } = await admin
    .from('patients')
    .select('id, phone')
    .eq('clinic_id', clinicId)
    .is('phone_e164', null)
    .not('phone', 'is', null)
    .limit(200);

  const match = (legacy ?? []).find((p) => String(p.phone).replace(/\D/g, '').endsWith(digits));
  if (match) {
    await admin.from('patients').update({ phone_e164: phoneE164 }).eq('id', match.id);
    return match.id;
  }

  const { data: created } = await admin
    .from('patients')
    .insert({
      clinic_id: clinicId,
      full_name: senderName?.trim() || `WhatsApp ${phoneE164}`,
      phone: phoneE164,
      phone_e164: phoneE164,
      funnel_status: 'lead',
    })
    .select('id')
    .single();

  safeLog('patient_created_from_whatsapp', { clinic_id: clinicId, patient_id: created!.id });
  return created!.id;
}

async function ensureConversation(
  admin: SupabaseClient,
  clinicId: string,
  patientId: string,
  phoneE164: string,
): Promise<Conversation> {
  const cols = 'id, clinic_id, patient_id, wa_phone';

  const { data: existing } = await admin
    .from('conversations').select(cols)
    .eq('clinic_id', clinicId).eq('wa_phone', phoneE164).maybeSingle();
  if (existing) return existing as Conversation;

  const { data: created } = await admin
    .from('conversations')
    .insert({ clinic_id: clinicId, patient_id: patientId, wa_phone: phoneE164 })
    .select(cols)
    .single();
  return created as Conversation;
}
