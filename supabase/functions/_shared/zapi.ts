// Cliente Z-API: envio de texto e parse do payload de webhook.
// Segredos (instance/token/client-token) só via env — nunca no banco (§1.3).

import { toE164BR } from './phone.ts';

const BASE = 'https://api.z-api.io';

function creds() {
  const instance = Deno.env.get('ZAPI_INSTANCE_ID');
  const token = Deno.env.get('ZAPI_TOKEN');
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
  if (!instance || !token) throw new Error('zapi_not_configured');
  return { instance, token, clientToken };
}

/** Envia texto. Devolve o id da mensagem na Z-API para gravar em messages.wa_message_id. */
export async function sendText(phoneE164: string, message: string): Promise<string | null> {
  const { instance, token, clientToken } = creds();
  const res = await fetch(`${BASE}/instances/${instance}/token/${token}/send-text`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(clientToken ? { 'Client-Token': clientToken } : {}),
    },
    // A Z-API espera só dígitos, sem '+'.
    body: JSON.stringify({ phone: phoneE164.replace(/\D/g, ''), message }),
  });

  if (!res.ok) {
    // Corpo de erro da Z-API não contém mensagem do paciente — seguro logar.
    throw new Error(`zapi_send_failed_${res.status}: ${await res.text()}`);
  }
  const body = await res.json().catch(() => ({}));
  return body.messageId ?? body.zaapId ?? body.id ?? null;
}

export type MediaKind = 'image' | 'pdf' | 'video' | 'audio';

/**
 * Envia mídia por URL. A Z-API baixa o arquivo, então a URL precisa ser pública
 * ou assinada — quem assina é o wa-send, com service role, para nunca depender
 * de uma URL vinda do client.
 */
export async function sendMedia(
  phoneE164: string,
  kind: MediaKind,
  url: string,
  opts: { caption?: string; fileName?: string } = {},
): Promise<string | null> {
  const { instance, token, clientToken } = creds();
  const phone = phoneE164.replace(/\D/g, '');

  const routes: Record<MediaKind, { path: string; body: Record<string, unknown> }> = {
    image: { path: 'send-image', body: { phone, image: url, caption: opts.caption } },
    video: { path: 'send-video', body: { phone, video: url, caption: opts.caption } },
    audio: { path: 'send-audio', body: { phone, audio: url } },
    pdf: {
      path: 'send-document/pdf',
      body: { phone, document: url, fileName: opts.fileName ?? 'documento.pdf', caption: opts.caption },
    },
  };
  const route = routes[kind];

  const res = await fetch(`${BASE}/instances/${instance}/token/${token}/${route.path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(clientToken ? { 'Client-Token': clientToken } : {}),
    },
    body: JSON.stringify(route.body),
  });

  if (!res.ok) throw new Error(`zapi_media_failed_${res.status}: ${await res.text()}`);
  const body = await res.json().catch(() => ({}));
  return body.messageId ?? body.zaapId ?? body.id ?? null;
}

export type InboundMessage = {
  instanceId: string | null;
  waMessageId: string | null;
  phoneE164: string | null;
  senderName: string | null;
  text: string | null;
  /** Áudio/imagem/documento chegam sem texto — registramos e pedimos texto. */
  kind: 'text' | 'media' | 'other';
  fromMe: boolean;
  isGroup: boolean;
  isStatusCallback: boolean;
};

/**
 * A Z-API varia o formato entre tipos de mensagem e versões. Parse defensivo:
 * o que não reconhecemos vira kind 'other' e é ignorado sem quebrar o webhook.
 */
// deno-lint-ignore no-explicit-any
export function parseInbound(body: any): InboundMessage {
  const text: string | null =
    body?.text?.message ??
    body?.message?.text ??
    (typeof body?.text === 'string' ? body.text : null) ??
    body?.buttonsResponseMessage?.message ??
    body?.listResponseMessage?.message ??
    null;

  const hasMedia = Boolean(
    body?.image || body?.audio || body?.video || body?.document || body?.sticker,
  );

  return {
    instanceId: body?.instanceId ?? body?.instance_id ?? null,
    waMessageId: body?.messageId ?? body?.id ?? null,
    phoneE164: toE164BR(body?.phone ?? body?.participantPhone ?? null),
    senderName: body?.senderName ?? body?.chatName ?? body?.pushName ?? null,
    text: text ? String(text).trim() : null,
    kind: text ? 'text' : hasMedia ? 'media' : 'other',
    fromMe: Boolean(body?.fromMe),
    isGroup: Boolean(body?.isGroup),
    // Callbacks de status de entrega usam o mesmo webhook — não são mensagens.
    isStatusCallback: Boolean(body?.status) && !text && !hasMedia,
  };
}
