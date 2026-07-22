// Diagnóstico Brevo: consulta a conta e os remetentes verificados usando o BREVO_API_KEY.
// Temporário — para descobrir por que os e-mails não chegam. verify_jwt=true.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) return json({ error: 'BREVO_API_KEY ausente' }, 500);
  const headers = { 'api-key': apiKey, accept: 'application/json' };

  const target = new URL(req.url).searchParams.get('email') ?? 'viniciustiuteste@gmail.com';

  const [sendersRes, accountRes, eventsRes] = await Promise.all([
    fetch('https://api.brevo.com/v3/senders', { headers }),
    fetch('https://api.brevo.com/v3/account', { headers }),
    fetch(`https://api.brevo.com/v3/smtp/statistics/events?limit=20&email=${encodeURIComponent(target)}`, { headers }),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendersBody: any = await sendersRes.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountBody: any = await accountRes.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventsBody: any = await eventsRes.json().catch(() => ({}));

  return json({
    sendersStatus: sendersRes.status,
    senders: (sendersBody.senders ?? []).map((s: any) => ({ email: s.email, active: s.active })),
    accountStatus: accountRes.status,
    account: {
      email: accountBody.email ?? null,
      company: accountBody.companyName ?? null,
      plan: accountBody.plan ?? null,
    },
    // Status real de entrega dos e-mails para o destinatário (delivered/blocked/bounce/spam + reason)
    eventsStatus: eventsRes.status,
    eventsMessage: eventsBody.message ?? null,
    events: (eventsBody.events ?? []).map((e: any) => ({ event: e.event, email: e.email, reason: e.reason ?? null, date: e.date })),
  });
});
