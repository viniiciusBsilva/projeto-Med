// Configuração do assistente do WhatsApp por clínica: guardada em
// clinics.ai_settings e lida pelo agente (wa-webhook, _shared/agent.ts) a cada
// mensagem. O formato E OS PADRÕES são o contrato entre os dois — mudou aqui,
// muda lá (DEFAULTS em agent.ts).
// As regras de segurança clínica NÃO estão aqui: ficam fixas no código do agente.

export type AiTone = 'acolhedor' | 'profissional' | 'descontraido';

export interface AiSettings {
  version: 1;
  /** false: o assistente não responde nesta clínica; a equipe atende pelo painel. */
  enabled: boolean;
  assistant_name: string;
  tone: AiTone;
  greeting: string;
  clinic_info: string;
  custom_instructions: string;
  pricing_policy: string;
  handoff_rules: string;
  forbidden: string;
}

// Tudo isso entra no prompt de toda mensagem: texto demais encarece e dilui.
export const AI_TEXT_LIMIT = 2000;
export const AI_NAME_LIMIT = 40;

/** A descrição é o texto exato que o agente recebe como tom de voz. */
export const TONE_OPTIONS: { value: AiTone; label: string; description: string }[] = [
  {
    value: 'acolhedor',
    label: 'Acolhedor',
    description:
      'Acolhedor, direto e humano. Frases curtas — é WhatsApp, não e-mail. Trate o paciente pelo primeiro nome. No máximo um emoji.',
  },
  {
    value: 'profissional',
    label: 'Profissional',
    description:
      'Cordial, objetivo e respeitoso. Linguagem cuidada, sem gírias e sem emoji. Frases curtas — é WhatsApp. Trate o paciente pelo primeiro nome.',
  },
  {
    value: 'descontraido',
    label: 'Descontraído',
    description:
      'Leve, simpático e próximo, com linguagem do dia a dia, sem perder o respeito. Até dois emojis. Frases curtas — é WhatsApp. Trate o paciente pelo primeiro nome.',
  },
];

/**
 * Como o assistente se comporta hoje, sem nenhuma configuração salva. A tela
 * abre com estes textos preenchidos; campo apagado e salvo fica vazio de
 * propósito (o agente omite aquela orientação).
 */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  version: 1,
  enabled: true,
  assistant_name: '',
  tone: 'acolhedor',
  greeting:
    'Olá! Sou a assistente virtual da clínica. Posso te ajudar com dúvidas, agendamento de avaliação e o acompanhamento do seu pós-operatório.',
  clinic_info: '',
  custom_instructions: [
    '- Responda primeiro ao que o paciente pediu. Uma pergunta por vez.',
    '- Nunca repita a mesma mensagem. Se o paciente mudar de assunto, siga o assunto dele e retome depois, com outras palavras.',
    '- Para agendar, ofereça 2 ou 3 horários, nunca a lista inteira.',
    '- Depois de marcar, confirme o dia e a hora por extenso e o endereço da clínica.',
    '- Antes de cancelar um agendamento, confirme com o paciente.',
    '- Se o paciente mandar áudio, responda ao que ele disse como se fosse texto. Se mandar foto, vídeo ou exame, diga que já encaminhou ao médico.',
  ].join('\n'),
  pricing_policy:
    'Não passamos orçamento pelo WhatsApp. Se o FAQ tiver a resposta sobre valores, use-a; se não, diga que o valor é apresentado na avaliação e ofereça marcar uma.',
  handoff_rules:
    'Quando o paciente pedir para falar com uma pessoa, reclamar do atendimento ou quando você não conseguir resolver o que ele precisa.',
  forbidden: [
    'Prometer resultado do transplante (densidade, número de fios, prazo).',
    'Usar jargão médico.',
    'Agendar cirurgia, passar orçamento de cirurgia ou alterar tratamento — isso é da equipe.',
  ].join('\n'),
};

const TEXT_KEYS = [
  'greeting',
  'clinic_info',
  'custom_instructions',
  'pricing_policy',
  'handoff_rules',
  'forbidden',
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeAiSettings(raw: any): AiSettings {
  const r = raw && typeof raw === 'object' ? raw : {};
  // Campo nunca salvo = padrão; campo salvo (mesmo vazio) = o que a clínica escreveu.
  const text = (key: (typeof TEXT_KEYS)[number]) =>
    typeof r[key] === 'string' ? r[key].slice(0, AI_TEXT_LIMIT) : DEFAULT_AI_SETTINGS[key];
  return {
    version: 1,
    enabled: r.enabled !== false,
    assistant_name: typeof r.assistant_name === 'string' ? r.assistant_name.slice(0, AI_NAME_LIMIT) : '',
    tone: TONE_OPTIONS.some((t) => t.value === r.tone) ? r.tone : DEFAULT_AI_SETTINGS.tone,
    greeting: text('greeting'),
    clinic_info: text('clinic_info'),
    custom_instructions: text('custom_instructions'),
    pricing_policy: text('pricing_policy'),
    handoff_rules: text('handoff_rules'),
    forbidden: text('forbidden'),
  };
}

/** As regras fixas do agente, mostradas na tela para o admin saber o que não muda. */
export const FIXED_RULES = [
  'Não diagnostica nem avalia sintomas; conteúdo clínico só vem do FAQ aprovado.',
  'Diante de sinal de alerta (febre, sangramento, pus, dor forte), aciona a equipe e se pausa na conversa.',
  'Áudios são transcritos e respondidos. Fotos, vídeos e exames vão para o médico com alerta na fila — a assistente não avalia imagem nem exame.',
  'Dúvida sem resposta no FAQ vira alerta para a equipe; ela não responde por conta própria.',
  'Mantém um resumo do quadro relatado pelo paciente na ficha dele, para o médico.',
  'Nunca inventa horário: só oferece o que está livre na agenda.',
  'Nunca pede CPF, cartão, senha ou dados bancários.',
  'Nunca promete contato da equipe sem acioná-la de verdade.',
];
