// Shared helpers for the form endpoints (contact + newsletter), run by the Worker in worker/index.ts.

export interface FormEnv {
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Where form submissions are emailed. */
  CONTACT_TO: string;
  /** Verified sender in Resend, e.g. "Crosstown Website <web@crosstowncommunitychurch.com>". */
  CONTACT_FROM: string;
}

export async function verifyTurnstile(form: FormData, request: Request, env: FormEnv): Promise<boolean> {
  // Skip when no secret is configured (local dev).
  if (!env.TURNSTILE_SECRET_KEY) return true;
  const token = form.get('cf-turnstile-response');
  if (typeof token !== 'string' || !token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

export async function sendEmail(env: FormEnv, msg: { subject: string; text: string; replyTo?: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: [env.CONTACT_TO],
      subject: msg.subject,
      text: msg.text,
      reply_to: msg.replyTo,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

export const field = (form: FormData, name: string, max = 5000) =>
  String(form.get(name) ?? '').trim().slice(0, max);

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
