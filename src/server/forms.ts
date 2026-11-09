// The public form endpoints. Both check a hidden honeypot field and Cloudflare Turnstile, then email the church via Resend.
import { type FormEnv, verifyTurnstile, sendEmail, field, isEmail, oneLine } from './forms-shared';

export type { FormEnv };

export async function handleContact(request: Request, env: FormEnv): Promise<Response> {
  const form = await request.formData();
  // Honeypot: real visitors never fill this hidden field.
  if (field(form, 'website')) return new Response('OK');
  if (!(await verifyTurnstile(form, request, env))) return new Response('Spam check failed', { status: 400 });

  const firstName = oneLine(field(form, 'firstName', 100));
  const lastName = oneLine(field(form, 'lastName', 100));
  const email = field(form, 'email', 200);
  const phone = field(form, 'phone', 50);
  const message = field(form, 'message');
  const subject = oneLine(field(form, 'subject', 100)) || 'Website contact form';
  if (!firstName || !isEmail(email) || !message) return new Response('Missing fields', { status: 400 });

  await sendEmail(env, {
    subject: `${subject}: ${firstName} ${lastName}`.trim(),
    replyTo: email,
    text: [`Name: ${firstName} ${lastName}`, `Email: ${email}`, `Phone: ${phone || '-'}`, '', message].join('\n'),
  });
  return new Response('OK');
}

// Newsletter and CSI team signups. For now a signup emails the church so they can add the address to their list.
// Once a newsletter tool is chosen (Mailchimp, MailerLite, Buttondown), call its API here instead.
export async function handleSubscribe(request: Request, env: FormEnv): Promise<Response> {
  const form = await request.formData();
  if (field(form, 'website')) return new Response('OK');
  if (!(await verifyTurnstile(form, request, env))) return new Response('Spam check failed', { status: 400 });

  const email = field(form, 'email', 200);
  if (!isEmail(email)) return new Response('Invalid email', { status: 400 });
  // "newsletter" from the footer, "csi" from the Join the CSI Team form.
  const list = field(form, 'list', 50) === 'csi' ? 'the CSI team' : 'the Crosstown newsletter';

  await sendEmail(env, {
    subject: `New signup: ${list}`,
    replyTo: email,
    text: `${email} signed up for ${list} on the website.`,
  });
  return new Response('OK');
}
