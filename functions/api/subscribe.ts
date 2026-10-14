import { type Env, verifyTurnstile, sendEmail, field, isEmail } from './_shared';

// Newsletter and CSI team signups. For now a signup emails the church so they can add the address to their list.
// Once a newsletter tool is chosen (Mailchimp, MailerLite, Buttondown), call its
// API here instead.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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
};
