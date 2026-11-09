// Admin user accounts: email + password, invitations, lockout. Stored in the database (never in GitHub).
import { newId, type Db } from './db';

/** PBKDF2 rounds. Cloudflare's free plan allows 10 ms of CPU per request and 25,000 rounds costs about 3 ms. */
export const ITERATIONS = 25000;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
const INVITE_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD = 8;

/** First-run account, created only when there are no users yet. Replace by setting ADMIN_EMAIL + ADMIN_PASSWORD, or change it after signing in. */
export const FIRST_RUN = { email: 'tanner@nectarine.ink', password: 'test', name: 'Tanner' };

export interface User {
  id: string; email: string; name: string; status: 'active' | 'invited' | 'disabled';
  notify: number; must_change: number; sv: number; last_login: number | null; created_at: number;
}
const PUBLIC = 'id, email, name, status, notify, must_change, sv, last_login, created_at';

const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256));
}
const sameString = (a: string, b: string) => {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
};
const sha = async (s: string) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));
export const normEmail = (s: unknown) => String(s ?? '').trim().toLowerCase();
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 200;

async function setPassword(db: Db, id: string, password: string, mustChange: boolean) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  await db.prepare(`UPDATE users SET pass_hash=?, pass_salt=?, iterations=?, status='active', must_change=?, invite_hash=NULL, invite_expires=NULL, failed=0, locked_until=0, sv=sv+1 WHERE id=?`)
    .bind(hash, b64u(salt), ITERATIONS, mustChange ? 1 : 0, id).run();
}

export async function seedIfEmpty(db: Db, env: { ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string }) {
  const n = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if ((n?.n ?? 0) > 0) return;
  const fromEnv = Boolean(env.ADMIN_EMAIL && env.ADMIN_PASSWORD);
  const email = normEmail(fromEnv ? env.ADMIN_EMAIL : FIRST_RUN.email);
  const id = newId();
  await db.prepare(`INSERT OR IGNORE INTO users (id, email, name, status, notify, must_change, created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(id, email, fromEnv ? 'Admin' : FIRST_RUN.name, 'active', 1, 0, Date.now()).run();
  const row = await db.prepare('SELECT id FROM users WHERE email=?').bind(email).first<{ id: string }>();
  await setPassword(db, row!.id, fromEnv ? env.ADMIN_PASSWORD! : FIRST_RUN.password, !fromEnv);
}

export async function getUser(db: Db, id: string): Promise<User | null> {
  return db.prepare(`SELECT ${PUBLIC} FROM users WHERE id=?`).bind(id).first<User>();
}

export type LoginResult = { ok: true; user: User } | { ok: false; error: string; status: number };
export async function login(db: Db, email: string, password: string): Promise<LoginResult> {
  const row = await db.prepare('SELECT * FROM users WHERE email=?').bind(normEmail(email)).first<any>();
  const now = Date.now();
  if (row && row.locked_until > now) {
    return { ok: false, status: 429, error: `Too many wrong passwords. Try again in ${Math.ceil((row.locked_until - now) / 60000)} minutes.` };
  }
  // Do the same amount of work whether or not the account exists.
  const salt = row?.pass_salt ? unb64u(row.pass_salt) : new Uint8Array(16);
  const hash = await derive(String(password ?? ''), salt, row?.iterations || ITERATIONS);
  if (!row || row.status !== 'active' || !row.pass_hash || !sameString(hash, row.pass_hash)) {
    if (row) {
      const failed = row.failed + 1;
      await db.prepare('UPDATE users SET failed=?, locked_until=? WHERE id=?').bind(failed >= LOCK_AFTER ? 0 : failed, failed >= LOCK_AFTER ? now + LOCK_MS : 0, row.id).run();
    }
    return { ok: false, status: 401, error: 'That email or password is not right.' };
  }
  await db.prepare('UPDATE users SET failed=0, locked_until=0, last_login=? WHERE id=?').bind(now, row.id).run();
  return { ok: true, user: (await getUser(db, row.id))! };
}

export async function listUsers(db: Db): Promise<User[]> {
  return (await db.prepare(`SELECT ${PUBLIC} FROM users ORDER BY created_at`).all<User>()).results;
}

/** Creates (or re-issues) an invitation. Returns the one-time token to put in the invite link. */
export async function invite(db: Db, emailIn: string, name: string): Promise<{ id: string; token: string }> {
  const email = normEmail(emailIn);
  if (!validEmail(email)) throw new Error('That does not look like an email address.');
  const existing = await db.prepare('SELECT id, status FROM users WHERE email=?').bind(email).first<{ id: string; status: string }>();
  if (existing && existing.status === 'active') throw new Error('That person already has an account. Use "Reset password" in the team list instead.');
  const id = existing?.id ?? newId();
  if (!existing) {
    await db.prepare(`INSERT INTO users (id, email, name, status, notify, must_change, created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(id, email, String(name ?? '').trim().slice(0, 80), 'invited', 1, 0, Date.now()).run();
  }
  return { id, token: await issueToken(db, id) };
}
export async function issueToken(db: Db, id: string): Promise<string> {
  const token = b64u(crypto.getRandomValues(new Uint8Array(24)));
  await db.prepare('UPDATE users SET invite_hash=?, invite_expires=? WHERE id=?').bind(await sha(token), Date.now() + INVITE_MS, id).run();
  return token;
}

export async function acceptInvite(db: Db, emailIn: string, token: string, name: string, password: string): Promise<User> {
  if (String(password ?? '').length < MIN_PASSWORD) throw new Error(`Choose a password with at least ${MIN_PASSWORD} characters.`);
  const row = await db.prepare('SELECT * FROM users WHERE email=?').bind(normEmail(emailIn)).first<any>();
  if (!row || !row.invite_hash || row.invite_expires < Date.now() || !sameString(await sha(String(token ?? '')), row.invite_hash)) {
    throw new Error('This invitation link is not valid any more. Ask for a new one.');
  }
  if (name && String(name).trim()) await db.prepare('UPDATE users SET name=? WHERE id=?').bind(String(name).trim().slice(0, 80), row.id).run();
  await setPassword(db, row.id, password, false);
  return (await getUser(db, row.id))!;
}

export async function changePassword(db: Db, id: string, current: string, next: string): Promise<User> {
  if (String(next ?? '').length < MIN_PASSWORD) throw new Error(`Choose a password with at least ${MIN_PASSWORD} characters.`);
  const row = await db.prepare('SELECT * FROM users WHERE id=?').bind(id).first<any>();
  const hash = await derive(String(current ?? ''), unb64u(row.pass_salt), row.iterations);
  if (!sameString(hash, row.pass_hash)) throw new Error('Your current password is not right.');
  await setPassword(db, id, next, false);
  return (await getUser(db, id))!;
}

export async function updateUser(db: Db, id: string, patch: { name?: string; notify?: boolean; status?: string }, actingId: string) {
  const sets: string[] = []; const vals: unknown[] = [];
  if (patch.name !== undefined) { sets.push('name=?'); vals.push(String(patch.name).trim().slice(0, 80)); }
  if (patch.notify !== undefined) { sets.push('notify=?'); vals.push(patch.notify ? 1 : 0); }
  if (patch.status === 'disabled' || patch.status === 'active') {
    if (patch.status === 'disabled' && id === actingId) throw new Error('You cannot disable your own account.');
    sets.push('status=?', 'sv=sv+1'); vals.push(patch.status);
  }
  if (!sets.length) return;
  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id=?`).bind(...vals, id).run();
  const active = await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE status='active'`).first<{ n: number }>();
  if ((active?.n ?? 0) === 0) { await db.prepare(`UPDATE users SET status='active' WHERE id=?`).bind(actingId).run(); throw new Error('There must be at least one active admin.'); }
}

export async function removeUser(db: Db, id: string, actingId: string) {
  if (id === actingId) throw new Error('You cannot remove your own account.');
  await db.prepare('DELETE FROM users WHERE id=?').bind(id).run();
}

/** Signing key for login cookies: the SESSION_SECRET setting if set, otherwise a random one kept in the database. */
export async function sessionSecret(db: Db, env: { SESSION_SECRET?: string }): Promise<string> {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const row = await db.prepare(`SELECT value FROM settings WHERE key='session_secret'`).first<{ value: string }>();
  if (row) return row.value;
  const v = b64u(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)`).bind(v).run();
  return (await db.prepare(`SELECT value FROM settings WHERE key='session_secret'`).first<{ value: string }>())!.value;
}
