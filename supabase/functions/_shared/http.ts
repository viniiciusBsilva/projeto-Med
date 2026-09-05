// Helpers de HTTP compartilhados pelas funções do canal WhatsApp.
// Extraído do padrão repetido em send-push/patient-signup/etc.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wa-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

/** Comparação em tempo constante — evita vazar o segredo por timing. */
export function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected) return false;          // segredo não configurado => nega
  if (!provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  // Comprimentos diferentes ainda percorrem o laço inteiro.
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Log seguro para contexto de saúde (LGPD, CLAUDE.md §1.3): identificadores sim,
 * conteúdo de mensagem do paciente nunca.
 */
export function safeLog(event: string, fields: Record<string, string | number | boolean | null>) {
  console.log(JSON.stringify({ event, ...fields }));
}
