// Entrega de mensagem: envia pela Z-API e grava no histórico, sempre juntos.
// É o caminho único de saída — wa-send (HTTP, para o cron e o painel) e
// wa-webhook (em processo, para o agente) chamam esta mesma função.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { sendText, sendMedia, type MediaKind } from './zapi.ts';
import { safeLog } from './http.ts';

const CHAT_BUCKET = 'chat-attachments';
const SIGNED_URL_TTL_SECONDS = 3600;

export type Conversation = {
  id: string;
  clinic_id: string;
  patient_id: string;
  wa_phone: string;
};

export type OutgoingAttachment = {
  /** Caminho no bucket chat-attachments (pasta raiz = patient_id). */
  path: string;
  type: MediaKind;
  name: string;
};

export async function deliver(
  admin: SupabaseClient,
  conv: Conversation,
  body: string,
  sender: 'ai' | 'staff' | 'system',
  attachment?: OutgoingAttachment,
): Promise<string | null> {
  let waId: string | null;

  if (attachment) {
    // A URL é assinada aqui, com service role — nunca aceitamos URL do client.
    const { data: signed, error } = await admin.storage
      .from(CHAT_BUCKET)
      .createSignedUrl(attachment.path, SIGNED_URL_TTL_SECONDS);
    if (error || !signed?.signedUrl) throw new Error('attachment_sign_failed');

    waId = await sendMedia(conv.wa_phone, attachment.type, signed.signedUrl, {
      caption: body || undefined,
      fileName: attachment.name,
    });
  } else {
    waId = await sendText(conv.wa_phone, body);
  }

  await admin.from('messages').insert({
    clinic_id: conv.clinic_id,
    patient_id: conv.patient_id,
    conversation_id: conv.id,
    sender,
    body: body || null,
    wa_message_id: waId,
    attachment_path: attachment?.path ?? null,
    attachment_type: attachment?.type ?? null,
    attachment_name: attachment?.name ?? null,
  });
  await admin
    .from('conversations')
    .update({ last_outbound_at: new Date().toISOString() })
    .eq('id', conv.id);

  safeLog('wa_sent', {
    conversation_id: conv.id,
    sender,
    wa_message_id: waId,
    has_attachment: Boolean(attachment),
  });
  return waId;
}
