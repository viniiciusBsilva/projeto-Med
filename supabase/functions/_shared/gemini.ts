// Chamada ao Gemini via REST (generateContent), sem SDK: um fetch, nenhuma
// dependência npm no bundle. Compartilhada pelo agente, pela leitura de mídia
// (media.ts) e pelo resumo do paciente (summary.ts).
// Secrets: GEMINI_API_KEY (obrigatório), GEMINI_MODEL e GEMINI_THINKING_LEVEL (opcionais).

import { safeLog } from './http.ts';

// O 2.5 foi fechado para chaves novas (404 "no longer available to new users").
const DEFAULT_MODEL = 'gemini-3.6-flash';
// Raciocínio: os Flash 3.x vêm em 'medium'. Medido em 11/09/2026 no 3.6-flash:
// padrão ~6,5 s, 'low' ~3 s. 'default' no secret volta ao padrão do modelo.
const DEFAULT_THINKING_LEVEL = 'low';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Por tentativa. Em pico o Gemini chega a travar 30 s+; melhor desistir e
// tentar de novo do que esperar uma resposta que talvez não venha.
const REQUEST_TIMEOUT_MS = 25000;

export type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  /** Arquivo embutido (áudio, imagem, PDF) em base64. */
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};

export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

export function geminiConfig() {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('gemini_not_configured');
  return {
    apiKey,
    model: Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL,
    thinkingLevel: (Deno.env.get('GEMINI_THINKING_LEVEL') || DEFAULT_THINKING_LEVEL).toLowerCase(),
  };
}

// Modelos que recusaram o thinkingConfig nesta instância: seguem sem ele.
const NO_THINKING_CONFIG = new Set<string>();

/** Campo de raciocínio do generationConfig, quando o modelo aceita. */
export function thinkingFields(model: string, level: string): Record<string, unknown> {
  return level !== 'default' && !NO_THINKING_CONFIG.has(model) ? { thinkingConfig: { thinkingLevel: level } } : {};
}

// deno-lint-ignore no-explicit-any
export async function generate(apiKey: string, model: string, body: any, conversationId: string): Promise<any> {
  let retried = false;
  while (true) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        // Chave no header, não na URL: URL costuma parar em log.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      // Timeout ou falha de rede: mesma política dos 429/5xx.
      if (!retried) {
        retried = true;
        safeLog('gemini_retry', { conversation_id: conversationId, model, reason: e instanceof Error ? e.name : 'fetch_error' });
        continue;
      }
      throw e;
    }
    if (res.ok) return await res.json();

    const err = await res.json().catch(() => null);
    const message = String(err?.error?.message ?? '');

    // Modelo sem suporte ao nível de raciocínio: responde sem ele em vez de
    // deixar o paciente sem resposta. Não conta como nova tentativa.
    if (res.status === 400 && body.generationConfig?.thinkingConfig && /thinking/i.test(message)) {
      NO_THINKING_CONFIG.add(model);
      delete body.generationConfig.thinkingConfig;
      safeLog('gemini_thinking_unsupported', { conversation_id: conversationId, model });
      continue;
    }

    // 429/5xx são comuns em pico ("high demand"); uma nova tentativa resolve a
    // maioria sem o paciente perceber.
    if (!retried && (res.status === 429 || res.status >= 500)) {
      retried = true;
      safeLog('gemini_retry', { conversation_id: conversationId, model, reason: `http_${res.status}` });
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    throw new Error(`gemini_http_${res.status}: ${err?.error?.status ?? ''} ${message.slice(0, 200)}`);
  }
}

/** Uma chamada sem tools que devolve só o texto — transcrição, leitura de arquivo, resumo. */
export async function generateText(
  conversationId: string,
  parts: GeminiPart[],
  opts: { systemText?: string; json?: boolean; maxOutputTokens?: number } = {},
): Promise<string> {
  const { apiKey, model, thinkingLevel } = geminiConfig();
  const res = await generate(apiKey, model, {
    ...(opts.systemText ? { systemInstruction: { parts: [{ text: opts.systemText }] } } : {}),
    contents: [{ role: 'user', parts }],
    generationConfig: {
      // Os tokens de raciocínio contam aqui: teto baixo devolve texto vazio.
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      ...thinkingFields(model, thinkingLevel),
    },
  }, conversationId);
  const out: GeminiPart[] = res.candidates?.[0]?.content?.parts ?? [];
  return out
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();
}
