// Edge Function: recebe as mensagens do paciente pela Z-API (CLAUDE.md §3).
//
// A Z-API não assina o payload, então a origem é validada por segredo
// compartilhado na query string: configure o webhook como
//   https://<projeto>.supabase.co/functions/v1/wa-webhook?s=<ZAPI_WEBHOOK_SECRET>
// verify_jwt=false (a Z-API não manda JWT).
//
// Secrets: ZAPI_WEBHOOK_SECRET, ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN,
//          GEMINI_API_KEY (GEMINI_MODEL e GEMINI_THINKING_LEVEL opcionais).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json, secretMatches, safeLog } from '../_shared/http.ts';
import { parseInbound, type InboundMessage } from '../_shared/zapi.ts';
import { e164Variants } from '../_shared/phone.ts';
import { deliver, type Conversation } from '../_shared/deliver.ts';
import { readAiSettings, runAgent } from '../_shared/agent.ts';
import { openServiceAlert, type ToolContext } from '../_shared/tools.ts';
import { MEDIA_FAILED_BODY, MEDIA_PENDING_BODY, processInboundMedia } from '../_shared/media.ts';
import { refreshPatientSummary } from '../_shared/summary.ts';

// Janela de agrupamento (§7.2): o paciente manda "oi" / "queria marcar" /
// "amanhã à tarde" em sequência. Processar uma a uma confunde o agente.
// Era 6 s; somada à latência do modelo, a resposta passava de 40 s.
const DEBOUNCE_MS = 4000;
// Texto que chega logo depois de um áudio não pode responder antes de o áudio
// ser transcrito — senão o agente vê "[Recebendo arquivo…]" e não o que foi dito.
const MEDIA_WAIT_STEPS = 20;

// Quando o agente falha, o paciente não pode ficar sem resposta nenhuma.
const FALLBACK_REPLY =
  'Recebi sua mensagem! Nossa equipe já foi avisada e te responde em instantes.';

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
    .from('clinics').select('id, name, ai_settings').eq('wa_instance_id', instanceId).maybeSingle();
  if (!clinic) {
    safeLog('inbound_unknown_instance', { instance_id: instanceId });
    return json({ ok: true, ignored: 'instância não vinculada a nenhuma clínica' });
  }

  // 4/5. Paciente e conversa
  const patientId = await ensurePatient(admin, clinic.id, msg.phoneE164, msg.senderName);
  const conv = await ensureConversation(admin, clinic.id, patientId, msg.phoneE164);

  // 6. Grava a mensagem recebida. O índice único em wa_message_id é a rede de
  // segurança para dois webhooks idênticos chegando em paralelo. Arquivo entra
  // com corpo provisório; media.ts troca pelo anexo e pela transcrição.
  const bodyText = msg.text ??
    (msg.media ? MEDIA_PENDING_BODY : msg.kind === 'media' ? '[Figurinha ou mídia não suportada]' : null);
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
    kind: msg.media?.kind ?? msg.kind,
  });

  // 7. Quem responde: a IA só se a conversa não foi assumida por um humano
  // (§7.3) e a clínica não desligou o assistente (Configurações → Assistente de IA).
  const { data: state } = await admin
    .from('conversations').select('ai_enabled').eq('id', conv.id).maybeSingle();
  const aiOn = Boolean(state?.ai_enabled) && readAiSettings(clinic.ai_settings).enabled;

  // 8. Responde 200 já (a Z-API espera resposta rápida) e segue em background.
  // O arquivo é processado mesmo com a IA desligada: o médico precisa vê-lo.
  const work = handleInbound(admin, clinic.id, clinic.name, patientId, conv, inserted.id, msg, aiOn);
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else await work;

  return json({ ok: true, ai: aiOn ? 'on' : 'off' });
});

async function handleInbound(
  admin: SupabaseClient,
  clinicId: string,
  clinicName: string,
  patientId: string,
  conv: Conversation,
  messageId: string,
  msg: InboundMessage,
  aiOn: boolean,
) {
  let alerted = false;
  if (msg.media) {
    const ctx: ToolContext = { admin, clinicId, patientId, conversationId: conv.id, flags: { alerted: false } };
    try {
      ({ alerted } = await processInboundMedia(ctx, messageId, msg.waMessageId!, msg.media));
    } catch (e) {
      safeLog('media_failed', { conversation_id: conv.id, kind: msg.media.kind, error: String(e).slice(0, 200) });
      await admin.from('messages').update({ body: MEDIA_FAILED_BODY }).eq('id', messageId);
      await openServiceAlert(ctx, 'review', 'O paciente enviou um arquivo que não foi possível processar. Veja no WhatsApp da clínica.');
      alerted = true;
    }
  }
  // Figurinha e mídia não suportada ficam registradas, sem resposta.
  if (!aiOn || (!msg.text && !msg.media)) return;
  await respondLater(admin, clinicId, clinicName, patientId, conv, messageId, alerted);
}

/**
 * Debounce + agente + envio.
 *
 * O agrupamento é last-writer-wins: depois de esperar a janela, só segue quem
 * gravou a ÚLTIMA mensagem do paciente. As invocações anteriores desistem, e a
 * que segue leva todas as mensagens da janela num turno só. Sem estado extra e
 * sem cron — pg_cron tem granularidade de 1 minuto, grosso demais para poucos segundos.
 */
async function respondLater(
  admin: SupabaseClient,
  clinicId: string,
  clinicName: string,
  patientId: string,
  conv: Conversation,
  myMessageId: string,
  alreadyAlerted: boolean,
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

    await waitForPendingMedia(admin, conv.id);

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
      alreadyAlerted,
      // Espera com 1 s de "digitando…"; a resposta completa, com 2 s. Mais que
      // isso vira atraso de verdade, não sensação de conversa.
      sendInterim: async (text) => {
        await deliver(admin, conv, text, 'ai', undefined, { typingSeconds: 1 });
      },
    });

    if (reply) await deliver(admin, conv, reply, 'ai', undefined, { typingSeconds: 2 });
    if (aiPaused) safeLog('ai_paused', { conversation_id: conv.id });

    // Depois da resposta, fora do caminho do paciente: o quadro para o médico.
    await refreshPatientSummary(admin, patientId, conv.id);
  } catch (e) {
    // Falha do agente não pode virar retry da Z-API — já respondemos 200.
    safeLog('agent_failed', { conversation_id: conv.id, error: String(e).slice(0, 200) });
    await notifyAgentFailure(admin, clinicId, patientId, conv);
  }
}

/** Espera arquivos recém-chegados desta conversa terminarem de ser lidos (até ~20 s). */
async function waitForPendingMedia(admin: SupabaseClient, conversationId: string) {
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  for (let i = 0; i < MEDIA_WAIT_STEPS; i++) {
    const { count } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('body', MEDIA_PENDING_BODY)
      .gte('created_at', since);
    if (!count) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  safeLog('media_wait_timeout', { conversation_id: conversationId });
}

/**
 * Põe a falha na fila de Alertas (com aviso no sino) e diz ao paciente que a
 * mensagem chegou. Se a própria Z-API for o problema, o aviso ao paciente
 * também falha — o alerta no painel continua valendo.
 */
async function notifyAgentFailure(
  admin: SupabaseClient,
  clinicId: string,
  patientId: string,
  conv: Conversation,
) {
  await openServiceAlert(
    { admin, clinicId, patientId, conversationId: conv.id, flags: { alerted: false } },
    'technical',
    'O assistente não conseguiu responder a última mensagem do paciente (falha técnica). Responda pelo chat.',
    'high',
  );
  try {
    await deliver(admin, conv, FALLBACK_REPLY, 'ai');
  } catch (e) {
    safeLog('fallback_failed', { conversation_id: conv.id, error: String(e).slice(0, 200) });
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
