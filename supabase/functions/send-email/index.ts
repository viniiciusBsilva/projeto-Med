// Edge Function: envio de e-mail transacional via Brevo (Sendinblue).
// Secret necessário: BREVO_API_KEY. Opcionais: BREVO_SENDER_EMAIL, BREVO_SENDER_NAME.
// Deploy: supabase functions deploy send-email
// Chamada (client): supabase.functions.invoke('send-email', { body: { to, subject, html } })
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SendEmailBody {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromEmail?: string;
  fromName?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) {
    return json({ error: 'BREVO_API_KEY não configurado nos secrets do projeto.' }, 500);
  }

  let body: SendEmailBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido: envie JSON.' }, 400);
  }

  if (!body.to || !body.subject || !body.html) {
    return json({ error: 'Campos obrigatórios: to, subject, html.' }, 400);
  }

  const senderEmail = body.fromEmail ?? Deno.env.get('BREVO_SENDER_EMAIL');
  const senderName = body.fromName ?? Deno.env.get('BREVO_SENDER_NAME') ?? 'PostCare Pro';
  if (!senderEmail) {
    return json({ error: 'Remetente ausente: defina BREVO_SENDER_EMAIL (remetente verificado na Brevo).' }, 500);
  }

  const recipients = (Array.isArray(body.to) ? body.to : [body.to]).map((email) => ({ email }));

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: recipients,
      subject: body.subject,
      htmlContent: body.html,
      ...(body.text ? { textContent: body.text } : {}),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: 'Falha ao enviar via Brevo', status: res.status, details: data }, 502);
  }
  return json({ ok: true, messageId: data.messageId ?? null }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
