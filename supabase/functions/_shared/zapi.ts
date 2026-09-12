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

/**
 * Envia texto. Devolve o id da mensagem na Z-API para gravar em messages.wa_message_id.
 * `delayTyping` (1–15 s): o paciente vê "digitando…" por esse tempo antes da mensagem.
 */
export async function sendText(
  phoneE164: string,
  message: string,
  opts: { delayTyping?: number } = {},
): Promise<string | null> {
  const { instance, token, clientToken } = creds();
  const res = await fetch(`${BASE}/instances/${instance}/token/${token}/send-text`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(clientToken ? { 'Client-Token': clientToken } : {}),
    },
    // A Z-API espera só dígitos, sem '+'.
    body: JSON.stringify({
      phone: phoneE164.replace(/\D/g, ''),
      message,
      ...(opts.delayTyping ? { delayTyping: Math.min(15, Math.max(1, Math.round(opts.delayTyping))) } : {}),
    }),
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

/** Arquivo recebido. A URL fica 30 dias no storage da Z-API — media.ts copia para o nosso. */
export type InboundMedia = {
  kind: 'audio' | 'image' | 'video' | 'document';
  url: string;
  mimeType: string | null;
  fileName: string | null;
  caption: string | null;
};

export type InboundMessage = {
  instanceId: string | null;
  waMessageId: string | null;
  phoneE164: string | null;
  senderName: string | null;
  text: string | null;
  /** Áudio, foto, vídeo ou documento. Figurinha não conta: kind 'media' com media null. */
  media: InboundMedia | null;
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
    media: parseMedia(body),
    kind: text ? 'text' : hasMedia ? 'media' : 'other',
    fromMe: Boolean(body?.fromMe),
    isGroup: Boolean(body?.isGroup),
    // Callbacks de status de entrega usam o mesmo webhook — não são mensagens.
    isStatusCallback: Boolean(body?.status) && !text && !hasMedia,
  };
}

// Formato dos exemplos da Z-API (on-message-received-examples).
// deno-lint-ignore no-explicit-any
function parseMedia(body: any): InboundMedia | null {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  if (str(body?.audio?.audioUrl)) {
    return { kind: 'audio', url: body.audio.audioUrl, mimeType: str(body.audio.mimeType), fileName: null, caption: null };
  }
  if (str(body?.image?.imageUrl)) {
    return {
      kind: 'image', url: body.image.imageUrl, mimeType: str(body.image.mimeType),
      fileName: null, caption: str(body.image.caption),
    };
  }
  if (str(body?.video?.videoUrl)) {
    return {
      kind: 'video', url: body.video.videoUrl, mimeType: str(body.video.mimeType),
      fileName: null, caption: str(body.video.caption),
    };
  }
  if (str(body?.document?.documentUrl)) {
    return {
      kind: 'document', url: body.document.documentUrl, mimeType: str(body.document.mimeType),
      fileName: str(body.document.fileName) ?? str(body.document.title), caption: str(body.document.caption),
    };
  }
  return null;
}
