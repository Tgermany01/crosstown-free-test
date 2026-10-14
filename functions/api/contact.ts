import { type Env, verifyTurnstile, sendEmail, field, isEmail } from './_shared';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData();
  // Honeypot: real visitors never fill this hidden field.
  if (field(form, 'website')) return new Response('OK');
  if (!(await verifyTurnstile(form, request, env))) return new Response('Spam check failed', { status: 400 });

  const firstName = field(form, 'firstName', 100);
  const lastName = field(form, 'lastName', 100);
  const email = field(form, 'email', 200);
  const phone = field(form, 'phone', 50);
  const message = field(form, 'message');
  const subject = field(form, 'subject', 100) || 'Website contact form';
  if (!firstName || !isEmail(email) || !message) return new Response('Missing fields', { status: 400 });

  await sendEmail(env, {
    subject: `${subject}: ${firstName} ${lastName}`.trim(),
    replyTo: email,
    text: [`Name: ${firstName} ${lastName}`, `Email: ${email}`, `Phone: ${phone || '-'}`, '', message].join('\n'),
  });
  return new Response('OK');
};
