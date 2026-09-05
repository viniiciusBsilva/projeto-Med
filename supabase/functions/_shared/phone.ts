// Normalização de telefone BR para E.164.
// A Z-API entrega o número só com dígitos ("5511999998888"); o painel grava em
// formato livre ("(11) 99999-8888"). `phone_e164` é a chave de identificação.

/** "(11) 99999-8888" | "5511999998888" -> "+5511999998888" */
export function toE164BR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (!d) return null;

  // Já com código do país.
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return `+${d}`;
  // DDD + número (fixo 10, celular 11).
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  // Formato inesperado: devolve com '+' para não perder o dado, mas não inventa DDI.
  return `+${d}`;
}

/**
 * Igual a toE164BR, mas devolve null em vez de arriscar um palpite.
 * Use antes de ENVIAR: um número mal inferido manda dado de saúde para
 * a pessoa errada. Na entrada, `toE164BR` é preferível — o número já veio
 * do WhatsApp e é melhor registrar do que descartar.
 */
export function toE164BRStrict(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}

/**
 * Formas alternativas do mesmo número, para casar com cadastros antigos.
 * Celular BR ganhou um 9 na frente; registros legados podem estar sem ele.
 */
export function e164Variants(e164: string): string[] {
  const out = new Set<string>([e164]);
  const m = /^\+55(\d{2})(\d+)$/.exec(e164);
  if (m) {
    const [, ddd, rest] = m;
    if (rest.length === 9 && rest.startsWith('9')) out.add(`+55${ddd}${rest.slice(1)}`); // sem o 9
    if (rest.length === 8) out.add(`+55${ddd}9${rest}`);                                 // com o 9
  }
  return [...out];
}
