// Edge Function: envia push (FCM HTTP v1) para os dispositivos de um paciente.
// Protegida por header x-push-secret == PUSH_HOOK_SECRET (chamada por trigger/painel).
// Secrets: PUSH_HOOK_SECRET, FCM_SERVICE_ACCOUNT (JSON da service account do Firebase).
// Sem FCM_SERVICE_ACCOUNT -> no-op controlado. verify_jwt=false.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = await res.json();
  return j.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const secret = Deno.env.get('PUSH_HOOK_SECRET');
  if (secret && req.headers.get('x-push-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  let patientId = '', title = '', body = '';
  try {
    const b = await req.json();
    patientId = String(b.patientId ?? '');
    title = String(b.title ?? 'PostCare Pro');
    body = String(b.body ?? '');
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }
  if (!patientId) return json({ error: 'patientId ausente.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: tokens } = await admin.from('device_tokens').select('token').eq('patient_id', patientId);

  const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!saRaw) return json({ ok: true, sent: 0, reason: 'push_not_configured' });
  if (!tokens || tokens.length === 0) return json({ ok: true, sent: 0, reason: 'no_tokens' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sa = JSON.parse(saRaw);
  const accessToken = await getAccessToken(sa);
  let sent = 0;
  for (const t of tokens as { token: string }[]) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token: t.token, notification: { title, body } } }),
    }).catch(() => null);
    if (r && r.ok) sent++;
  }
  return json({ ok: true, sent });
});
