// Shared helpers for the form endpoints (contact + newsletter), run by the Worker in worker/index.ts.

/** The part of Cloudflare's `send_email` binding we use (Cloudflare Email Service). */
export interface EmailBinding {
  send(message: {
    to: string;
    from: string | { email: string; name?: string };
    subject: string;
    text: string;
    replyTo?: string | { email: string; name?: string };
  }): Promise<{ messageId: string }>;
}

export interface FormEnv {
  /** Cloudflare's own email sending (free to a verified address). Used when present; otherwise Resend. */
  EMAIL?: EmailBinding;
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Where form submissions are emailed. With the EMAIL binding this must be a verified destination address. */
  CONTACT_TO: string;
  /** Sender, e.g. "Crosstown Website <web@crosstowncommunitychurch.com>". The domain must be set up with Cloudflare Email Routing (EMAIL) or verified in Resend. */
  CONTACT_FROM: string;
}

/** "Name <a@b.com>" or "a@b.com" -> { email, name }. */
export function parseAddress(s: string): { email: string; name?: string } {
  const m = s.trim().match(/^(.*?)\s*<([^<>\s]+)>$/);
  return m ? { email: m[2]!, ...(m[1]!.replace(/^"|"$/g, '').trim() ? { name: m[1]!.replace(/^"|"$/g, '').trim() } : {}) } : { email: s.trim() };
}

/** Headers can't contain line breaks: collapse anything a visitor typed into one line. */
export const oneLine = (s: string) => s.replace(/[\r\n  ]+/g, ' ').trim();

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
  const subject = oneLine(msg.subject).slice(0, 200);
  if (env.EMAIL) {
    // Cloudflare Email Service binding: free to verified destination addresses, no API key.
    await env.EMAIL.send({
      from: parseAddress(env.CONTACT_FROM),
      to: parseAddress(env.CONTACT_TO).email,
      subject,
      text: msg.text,
      ...(msg.replyTo && isEmail(msg.replyTo) ? { replyTo: msg.replyTo } : {}),
    });
    return;
  }
  if (!env.RESEND_API_KEY) throw new Error('No email sending is set up: add the EMAIL binding (Cloudflare) or RESEND_API_KEY.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: [env.CONTACT_TO],
      subject,
      text: msg.text,
      reply_to: msg.replyTo,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

export const field = (form: FormData, name: string, max = 5000) =>
  String(form.get(name) ?? '').trim().slice(0, max);

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
