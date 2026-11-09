// The public form endpoints. Each submission is saved as a contact (tagged by the form it came from) and the team
// is emailed. Both forms check a hidden honeypot field and Cloudflare Turnstile first.
import { type FormEnv, verifyTurnstile, sendEmail, field, isEmail, oneLine } from './forms-shared';
import { ensureSchema } from './db';
import { normTag, notifyRecipients, recordSubmission } from './contacts';

export type { FormEnv };

async function save(
  request: Request, env: FormEnv,
  s: { tag: string; page: string; message: string; first: string; last: string; email: string; phone: string; subscribe: boolean; subject: string; heading: string },
): Promise<void> {
  const lines = [`${s.heading}`, '', `Name: ${[s.first, s.last].filter(Boolean).join(' ') || '-'}`, `Email: ${s.email}`, `Phone: ${s.phone || '-'}`, `Form: ${s.tag}`, `Page: ${s.page || '-'}`];
  if (s.message) lines.push('', s.message);

  let contactId = '', submissionId = '', recipients: string[] = env.CONTACT_TO ? [env.CONTACT_TO] : [];
  if (env.DB) {
    await ensureSchema(env.DB);
    const r = await recordSubmission(env.DB, { tag: s.tag, page: s.page, message: s.message, first_name: s.first, last_name: s.last, email: s.email, phone: s.phone, subscribe: s.subscribe });
    contactId = r.contactId; submissionId = r.submissionId;
    recipients = await notifyRecipients(env.DB, env.CONTACT_TO);
    lines.push('', `Open in the admin board: ${new URL(request.url).origin}/admin#/contacts/${contactId}`);
  }
  // One email per team member. A failure for one person (for example an address not yet verified with Cloudflare) never blocks the others.
  const failures: string[] = []; let sent = 0;
  for (const to of recipients) {
    try { await sendEmail(env, { to, subject: s.subject, replyTo: s.email, text: lines.join('\n') }); sent++; }
    catch (e) { failures.push(`${to}: ${e instanceof Error ? e.message : e}`.slice(0, 200)); console.error('notify failed', to, e); }
  }
  if (env.DB && submissionId) {
    await env.DB.prepare('UPDATE submissions SET notified=?, notify_error=? WHERE id=?').bind(sent, failures.join(' | ').slice(0, 500) || null, submissionId).run();
  }
  // Without a database the email is the only record, so a failed send must be reported.
  if (!env.DB && failures.length) throw new Error(failures[0]);
}

export async function handleContact(request: Request, env: FormEnv): Promise<Response> {
  const form = await request.formData();
  // Honeypot: real visitors never fill this hidden field.
  if (field(form, 'website')) return new Response('OK');
  if (!(await verifyTurnstile(form, request, env))) return new Response('Spam check failed', { status: 400 });

  const first = oneLine(field(form, 'firstName', 100));
  const last = oneLine(field(form, 'lastName', 100));
  const email = field(form, 'email', 200).toLowerCase();
  const phone = oneLine(field(form, 'phone', 50));
  const message = field(form, 'message');
  const subject = oneLine(field(form, 'subject', 100)) || 'Website contact form';
  if (!first || !isEmail(email) || !message) return new Response('Missing fields', { status: 400 });

  await save(request, env, {
    tag: normTag(field(form, 'tag', 60)) || 'Get in touch', page: oneLine(field(form, 'page', 200)), message,
    first, last, email, phone, subscribe: false,
    subject: `${subject}: ${first} ${last}`.trim(), heading: 'New message from the website contact form',
  });
  return new Response('OK');
}

// Newsletter and group signups ("Join the CSI Team", the footer newsletter box).
export async function handleSubscribe(request: Request, env: FormEnv): Promise<Response> {
  const form = await request.formData();
  if (field(form, 'website')) return new Response('OK');
  if (!(await verifyTurnstile(form, request, env))) return new Response('Spam check failed', { status: 400 });

  const email = field(form, 'email', 200).toLowerCase();
  if (!isEmail(email)) return new Response('Invalid email', { status: 400 });
  // Older pages post a short `list` name instead of a tag.
  const legacy = field(form, 'list', 50);
  const tag = normTag(field(form, 'tag', 60)) || (legacy === 'csi' ? 'CSI Prayer Team' : 'Crosstown Newsletter');

  await save(request, env, {
    tag, page: oneLine(field(form, 'page', 200)), message: '', first: '', last: '', email, phone: '', subscribe: true,
    subject: `New signup: ${tag}`, heading: `New signup for "${tag}"`,
  });
  return new Response('OK');
}
