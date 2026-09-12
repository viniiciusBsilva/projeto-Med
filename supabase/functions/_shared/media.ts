// Áudio, foto, vídeo e documento que o paciente manda pelo WhatsApp.
//
// Antes o webhook gravava só "[anexo recebido pelo WhatsApp]": o arquivo se
// perdia, a IA não respondia e o médico não via nada. Agora:
// - o arquivo vai para o Storage (chat-attachments) e aparece na conversa do painel;
// - áudio é transcrito, e o agente responde como se fosse texto;
// - foto, vídeo e documento viram alerta 'review' para o médico. A IA não avalia
//   imagem nem exame (§1.1): o Gemini só diz O QUE é o arquivo, e o texto de
//   documento de saúde fica fora do histórico, para o agente não comentar.

import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { generateText } from './gemini.ts';
import { openServiceAlert, type ToolContext } from './tools.ts';
import { safeLog } from './http.ts';
import type { InboundMedia } from './zapi.ts';

const CHAT_BUCKET = 'chat-attachments';
const DOWNLOAD_TIMEOUT_MS = 20000;
// Vídeo longo de celular passa fácil disso; fica só no WhatsApp da clínica.
const MAX_STORE_BYTES = 45 * 1024 * 1024;
// Pedido ao Gemini com arquivo embutido tem teto de 20 MB, e o base64 incha ~33%.
const MAX_INLINE_BYTES = 14 * 1024 * 1024;

/** Corpo da mensagem enquanto o arquivo é baixado e lido. O agente espera sair dele. */
export const MEDIA_PENDING_BODY = '[Recebendo arquivo…]';
export const MEDIA_FAILED_BODY = '[Arquivo recebido — não foi possível processar. Veja no WhatsApp da clínica.]';

const EXT: Record<string, string> = {
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
  'application/pdf': 'pdf',
};

const LABEL: Record<InboundMedia['kind'], string> = {
  audio: 'Áudio', image: 'Foto', video: 'Vídeo', document: 'Documento',
};

const AUDIO_PROMPT =
  'Transcreva este áudio de WhatsApp, em português do Brasil, exatamente como foi falado. Não resuma, não corrija, não comente e não acrescente nada. Se não houver fala compreensível, responda apenas: [inaudível]';

const FILE_PROMPT = `Um paciente de uma clínica de transplante capilar enviou este arquivo pelo WhatsApp. Responda só com JSON no formato {"tipo": string, "saude": boolean, "texto": string}:
- "tipo": o que é o arquivo, em até 8 palavras, sem avaliar nada (ex.: "foto do couro cabeludo", "exame de sangue", "receita médica", "comprovante de pagamento", "print de conversa").
- "saude": true se mostra o corpo do paciente ou é exame, laudo, receita ou outro documento de saúde.
- "texto": o texto escrito no arquivo, transcrito literalmente, até 1500 caracteres; "" se não houver.
Não interprete, não avalie e não dê opinião sobre saúde.`;

type StoredType = 'image' | 'pdf' | 'video' | 'audio';

export type MediaOutcome = { body: string; alerted: boolean };

const baseMime = (m: string | null) => (m ?? '').split(';')[0].trim().toLowerCase();

/** O painel exibe imagem, vídeo, áudio e PDF (messages_attachment_type_check). */
function storedType(media: InboundMedia, mime: string): StoredType | null {
  if (media.kind === 'document') return mime === 'application/pdf' ? 'pdf' : null;
  return media.kind;
}

async function download(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) return null;
    if (Number(res.headers.get('content-length') ?? 0) > MAX_STORE_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength > MAX_STORE_BYTES ? null : bytes;
  } catch {
    return null;
  }
}

/**
 * Baixa, guarda e lê o arquivo; reescreve a mensagem (que entrou com
 * MEDIA_PENDING_BODY) com o anexo e o texto que o agente e a equipe vão ler.
 */
export async function processInboundMedia(
  ctx: ToolContext,
  messageId: string,
  waMessageId: string,
  media: InboundMedia,
): Promise<MediaOutcome> {
  const mime = baseMime(media.mimeType);
  const caption = (media.caption ?? '').trim();
  const bytes = await download(media.url);
  const type = storedType(media, mime);

  let attachment: { attachment_path: string; attachment_type: StoredType; attachment_name: string } | null = null;
  if (bytes && type) {
    const ext = EXT[mime] ?? (type === 'pdf' ? 'pdf' : 'bin');
    // Pasta raiz = patient_id: é o que a RLS do bucket usa para a equipe ler.
    const path = `${ctx.patientId}/wa-${waMessageId.replace(/[^A-Za-z0-9_-]/g, '')}.${ext}`;
    const { error } = await ctx.admin.storage
      .from(CHAT_BUCKET)
      .upload(path, bytes, { contentType: mime || 'application/octet-stream', upsert: true });
    if (error) safeLog('media_store_failed', { conversation_id: ctx.conversationId, kind: media.kind });
    else {
      attachment = {
        attachment_path: path,
        attachment_type: type,
        attachment_name: media.fileName ?? `${LABEL[media.kind].toLowerCase()}.${ext}`,
      };
    }
  }

  const outcome = media.kind === 'audio'
    ? await audioOutcome(ctx, bytes, mime, attachment !== null)
    : await fileOutcome(ctx, media, bytes, mime, caption, attachment !== null);

  await ctx.admin.from('messages').update({ body: outcome.body, ...(attachment ?? {}) }).eq('id', messageId);
  safeLog('media_processed', {
    conversation_id: ctx.conversationId,
    kind: media.kind,
    stored: attachment !== null,
    alerted: outcome.alerted,
  });
  return outcome;
}

async function audioOutcome(
  ctx: ToolContext,
  bytes: Uint8Array | null,
  mime: string,
  stored: boolean,
): Promise<MediaOutcome> {
  if (bytes && bytes.byteLength <= MAX_INLINE_BYTES) {
    try {
      const text = await generateText(ctx.conversationId, [
        { inlineData: { mimeType: mime || 'audio/ogg', data: encodeBase64(bytes) } },
        { text: AUDIO_PROMPT },
      ]);
      if (text && !/^\[inaud[ií]vel\]$/i.test(text)) {
        return { body: `[Áudio transcrito] ${text}`.slice(0, 4000), alerted: false };
      }
      // Ruído, áudio vazio: o agente pede para repetir, sem incomodar a equipe.
      if (text) return { body: '[Áudio não transcrito: sem fala compreensível]', alerted: false };
    } catch (e) {
      safeLog('audio_transcription_failed', { conversation_id: ctx.conversationId, error: String(e).slice(0, 160) });
    }
  }
  await openServiceAlert(
    ctx,
    'review',
    `Áudio do paciente que a assistente não conseguiu transcrever. ${stored ? 'Ouça na conversa do painel.' : 'Ouça no WhatsApp da clínica.'}`,
  );
  return { body: '[Áudio não transcrito: encaminhado à equipe]', alerted: true };
}

async function fileOutcome(
  ctx: ToolContext,
  media: InboundMedia,
  bytes: Uint8Array | null,
  mime: string,
  caption: string,
  stored: boolean,
): Promise<MediaOutcome> {
  let tipo = '';
  let texto = '';
  // Na dúvida, trata como documento de saúde: o texto não entra no histórico.
  let saude = true;
  const readable = bytes && bytes.byteLength <= MAX_INLINE_BYTES &&
    (media.kind === 'image' || mime === 'application/pdf');
  if (readable) {
    try {
      const raw = await generateText(
        ctx.conversationId,
        [{ inlineData: { mimeType: mime || 'image/jpeg', data: encodeBase64(bytes!) } }, { text: FILE_PROMPT }],
        { json: true, maxOutputTokens: 2048 },
      );
      const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      tipo = String(parsed?.tipo ?? '').trim().slice(0, 80);
      texto = String(parsed?.texto ?? '').trim().slice(0, 1500);
      saude = parsed?.saude !== false;
    } catch (e) {
      safeLog('file_reading_failed', { conversation_id: ctx.conversationId, error: String(e).slice(0, 160) });
    }
  }

  const label = LABEL[media.kind];
  const what = tipo ? `${label.toLowerCase()} (${tipo})` : label.toLowerCase();
  // No pós-operatório, foto costuma ser a área operada: o médico precisa ver logo.
  const { data: surgery } = await ctx.admin
    .from('surgeries').select('id').eq('patient_id', ctx.patientId).eq('status', 'active').limit(1).maybeSingle();
  await openServiceAlert(
    ctx,
    'review',
    `Paciente enviou ${what}${caption ? ` com a mensagem: "${caption.slice(0, 160)}"` : ''}. ${
      stored ? 'Veja na conversa do painel.' : 'O arquivo não pôde ser salvo: veja no WhatsApp da clínica.'
    }`,
    surgery ? 'high' : 'medium',
  );

  const lines = [`[Arquivo enviado: ${label}${tipo ? ` — ${tipo}` : ''} — encaminhado ao médico]`];
  if (caption) lines.push(caption);
  // Texto de exame ou laudo fica de fora: é para o médico ler no arquivo, não para a IA comentar.
  if (texto && !saude) lines.push(`Texto no arquivo: ${texto}`);
  return { body: lines.join('\n'), alerted: true };
}
