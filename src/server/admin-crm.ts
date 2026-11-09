// /api/admin routes for the team (users + invitations) and the contacts board.
import type { Db } from './db';
import { HttpError, json } from './http';
import { acceptInvite, changePassword, invite, issueToken, listUsers, removeUser, updateUser, type User } from './users';
import { cleanEmail, deleteContact, getContact, importContacts, isEmail, listContacts, recordSubmission, tagCounts, updateContact, type ContactInput } from './contacts';
import { sendEmail, type FormEnv } from './forms-shared';

export interface CrmCtx {
  head: string; rest: string[]; method: string; request: Request; db: Db; user: User; env: FormEnv; origin: string;
  /** Builds a fresh login cookie for the signed-in user (used after a password change). */
  cookieFor(user: User): Promise<string>;
}

export const inviteLink = (origin: string, email: string, token: string) => `${origin}/admin#/accept?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

export async function handleCrm(c: CrmCtx): Promise<Response | null> {
  const { head, rest, method, db, user } = c;
  const body = async <T,>() => ((await c.request.json().catch(() => ({}))) as T);

  // ---------------------------------------------------------------- my account
  if (head === 'me' && rest[0] === 'password' && method === 'POST') {
    const b = await body<{ current?: string; next?: string }>();
    try {
      const updated = await changePassword(db, user.id, b.current ?? '', b.next ?? '');
      return json({ ok: true }, 200, { 'set-cookie': await c.cookieFor(updated) });
    } catch (e) { throw new HttpError((e as Error).message, 400); }
  }

  // ---------------------------------------------------------------- team
  if (head === 'users') {
    if (method === 'GET' && !rest[0]) return json({ users: await listUsers(db) });
    if (method === 'POST' && rest[0] === 'invite') {
      const b = await body<{ email?: string; name?: string }>();
      let made;
      try { made = await invite(db, b.email ?? '', b.name ?? ''); } catch (e) { throw new HttpError((e as Error).message, 400); }
      const email = cleanEmail(b.email);
      const link = inviteLink(c.origin, email, made.token);
      return json({ ok: true, link, ...(await tryEmailInvite(c, email, user, link)) });
    }
    if (rest[0] && method === 'PATCH') {
      try { await updateUser(db, rest[0], await body(), user.id); } catch (e) { throw new HttpError((e as Error).message, 400); }
      return json({ ok: true });
    }
    if (rest[0] && rest[1] === 'reset' && method === 'POST') {
      const row = (await listUsers(db)).find((u) => u.id === rest[0]);
      if (!row) throw new HttpError('User not found', 404);
      const link = inviteLink(c.origin, row.email, await issueToken(db, row.id));
      return json({ ok: true, link, ...(await tryEmailInvite(c, row.email, user, link)) });
    }
    if (rest[0] && method === 'DELETE') {
      try { await removeUser(db, rest[0], user.id); } catch (e) { throw new HttpError((e as Error).message, 400); }
      return json({ ok: true });
    }
  }

  // ---------------------------------------------------------------- contacts
  if (head === 'contacts') {
    const url = new URL(c.request.url);
    if (method === 'GET' && rest[0] === 'tags') return json(await tagCounts(db));
    if (method === 'GET' && !rest[0]) {
      return json(await listContacts(db, {
        q: url.searchParams.get('q') ?? '', tag: url.searchParams.get('tag') ?? '', status: url.searchParams.get('status') ?? '',
        emailStatus: url.searchParams.get('emailStatus') ?? '', limit: Number(url.searchParams.get('limit')) || 50, offset: Number(url.searchParams.get('offset')) || 0,
      }));
    }
    if (method === 'POST' && rest[0] === 'import') {
      const { rows } = await body<{ rows?: ContactInput[] }>();
      if (!Array.isArray(rows) || rows.length > 25) throw new HttpError('Send up to 25 rows at a time.');
      return json({ ok: true, ...(await importContacts(db, rows)) });
    }
    if (method === 'POST' && !rest[0]) {
      const b = await body<ContactInput & { tags?: string[] }>();
      if (!isEmail(cleanEmail(b.email))) throw new HttpError('Please enter a valid email address.');
      await importContacts(db, [{ ...b, source: 'Added by hand', email_status: b.email_status ?? 'never' }]);
      const made = await listContacts(db, { q: cleanEmail(b.email), limit: 1 });
      return json({ ok: true, contact: made.contacts[0] });
    }
    if (rest[0] && method === 'GET') {
      const found = await getContact(db, rest[0]);
      if (!found) throw new HttpError('Contact not found', 404);
      return json({ contact: found });
    }
    if (rest[0] && method === 'PATCH') { await updateContact(db, rest[0], await body()); return json({ ok: true }); }
    if (rest[0] && method === 'DELETE') { await deleteContact(db, rest[0]); return json({ ok: true }); }
  }
  return null;
}

/** Best effort: Cloudflare's free email only reaches verified addresses, so this often can't reach a brand-new person. */
async function tryEmailInvite(c: CrmCtx, to: string, by: User, link: string): Promise<{ emailed: boolean; emailError?: string }> {
  if (!(c.env.EMAIL || c.env.RESEND_API_KEY) || !c.env.CONTACT_FROM) return { emailed: false, emailError: 'Email sending is not set up, so share the link yourself.' };
  try {
    await sendEmail(c.env, { to, subject: 'You have been invited to the Crosstown site editor', text: `${by.name || by.email} invited you to help manage the Crosstown Community Church website.\n\nSet your password here (link works for 7 days):\n${link}\n` });
    return { emailed: true };
  } catch (e) {
    return { emailed: false, emailError: 'The email could not be delivered (with Cloudflare\'s free email the address must be verified first), so share the link yourself.' };
  }
}

export { acceptInvite, recordSubmission };
