// Edge Function: envio de e-mail transacional via Resend.
// Secrets: RESEND_API_KEY. Opcionais: RESEND_SENDER_EMAIL (default onboarding@resend.dev), RESEND_SENDER_NAME.
// Chamada (client): supabase.functions.invoke('send-email', { body: { to, subject, html } })
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const RESEND_URL = 'https://api.resend.com/emails';

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

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return json({ error: 'RESEND_API_KEY não configurado nos secrets do projeto.' }, 500);
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

  const senderEmail = body.fromEmail ?? Deno.env.get('RESEND_SENDER_EMAIL') ?? 'onboarding@resend.dev';
  const senderName = body.fromName ?? Deno.env.get('RESEND_SENDER_NAME') ?? 'PostCare Pro';
  const from = `${senderName} <${senderEmail}>`;
  const recipients = Array.isArray(body.to) ? body.to : [body.to];

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: body.subject,
      html: body.html,
      ...(body.text ? { text: body.text } : {}),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: 'Falha ao enviar via Resend', sender: senderEmail, status: res.status, details: data }, 502);
  }
  return json({ ok: true, sender: senderEmail, id: data.id ?? null }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
