// Contacts: people who filled in a form or were imported, tagged by what they asked about.
import { newId, type Db, type Stmt } from './db';

export type EmailStatus = 'subscribed' | 'never' | 'unsubscribed';
export interface ContactInput {
  email: string; email2?: string; first_name?: string; last_name?: string; phone?: string; phone2?: string;
  street?: string; city?: string; zip?: string; email_status?: EmailStatus; sms_status?: string; source?: string; language?: string;
  created_at?: number; last_activity_at?: number; last_activity?: string; tags?: string[]; notes?: string;
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);
export const normTag = (v: unknown) => clip(v, 40);
export const tagList = (v: unknown): string[] => {
  const seen = new Map<string, string>();
  for (const t of Array.isArray(v) ? v : []) { const c = normTag(t); if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c); }
  return [...seen.values()].slice(0, 20);
};
export const cleanEmail = (v: unknown) => clip(v, 200).toLowerCase();
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
/** Phone numbers come in many shapes ("'+255 629...", "209.499-9393"): keep digits, +, spaces and dashes. */
export const cleanPhone = (v: unknown) => clip(v, 40).replace(/^'+/, '').replace(/[^\d+()\-.\s]/g, '').trim();

/** Insert or merge one person. Existing values are kept; empty ones are filled; the most protective subscription status wins. */
function upsertStatements(db: Db, c: ContactInput, form: boolean): Stmt[] {
  const now = Date.now();
  const email = cleanEmail(c.email);
  const created = c.created_at && c.created_at > 0 ? c.created_at : now;
  const active = c.last_activity_at && c.last_activity_at > 0 ? c.last_activity_at : created;
  const text = (v: unknown, n: number) => { const s = clip(v, n); return s === '' ? null : s; };
  const stmts: Stmt[] = [
    db.prepare(`INSERT INTO contacts (id, email, email2, first_name, last_name, phone, phone2, street, city, zip, status, email_status, sms_status, source, language, notes, created_at, last_activity_at, last_activity)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET
        email2 = COALESCE(NULLIF(contacts.email2,''), excluded.email2),
        first_name = CASE WHEN contacts.first_name = '' THEN excluded.first_name ELSE contacts.first_name END,
        last_name = CASE WHEN contacts.last_name = '' THEN excluded.last_name ELSE contacts.last_name END,
        phone = COALESCE(NULLIF(contacts.phone,''), excluded.phone), phone2 = COALESCE(NULLIF(contacts.phone2,''), excluded.phone2),
        street = COALESCE(NULLIF(contacts.street,''), excluded.street), city = COALESCE(NULLIF(contacts.city,''), excluded.city), zip = COALESCE(NULLIF(contacts.zip,''), excluded.zip),
        email_status = CASE WHEN contacts.email_status='unsubscribed' OR excluded.email_status='unsubscribed' THEN 'unsubscribed'
                            WHEN contacts.email_status='subscribed' OR excluded.email_status='subscribed' THEN 'subscribed' ELSE 'never' END,
        sms_status = COALESCE(NULLIF(contacts.sms_status,''), excluded.sms_status), source = COALESCE(NULLIF(contacts.source,''), excluded.source),
        language = COALESCE(NULLIF(contacts.language,''), excluded.language),
        notes = CASE WHEN contacts.notes = '' THEN excluded.notes ELSE contacts.notes END,
        status = CASE WHEN ${form ? '1' : '0'} AND contacts.status <> 'new' THEN 'new' ELSE contacts.status END,
        created_at = MIN(contacts.created_at, excluded.created_at),
        last_activity_at = MAX(contacts.last_activity_at, excluded.last_activity_at),
        last_activity = CASE WHEN excluded.last_activity_at >= contacts.last_activity_at THEN excluded.last_activity ELSE contacts.last_activity END`)
      .bind(newId(), email, text(c.email2 && cleanEmail(c.email2), 200), clip(c.first_name, 100), clip(c.last_name, 100),
        text(cleanPhone(c.phone), 40), text(cleanPhone(c.phone2), 40), text(c.street, 200), text(c.city, 100), text(c.zip, 20),
        'new', c.email_status ?? 'never', text(c.sms_status, 40), text(c.source, 60), text(c.language, 20), clip(c.notes, 5000),
        created, active, text(c.last_activity, 120)),
  ];
  for (const tag of tagList(c.tags)) {
    stmts.push(db.prepare(`INSERT OR IGNORE INTO contact_tags (contact_id, tag) SELECT id, ? FROM contacts WHERE email = ?`).bind(tag, email));
  }
  return stmts;
}

export interface ImportResult { created: number; updated: number; skipped: number }
/** Save up to ~25 people in one go (used by the CSV import). */
export async function importContacts(db: Db, rows: ContactInput[]): Promise<ImportResult> {
  const good = rows.filter((r) => isEmail(cleanEmail(r.email))).slice(0, 25);
  const res: ImportResult = { created: 0, updated: 0, skipped: rows.length - good.length };
  if (!good.length) return res;
  const emails = [...new Set(good.map((r) => cleanEmail(r.email)))];
  const found = await db.prepare(`SELECT email FROM contacts WHERE email IN (${emails.map(() => '?').join(',')})`).bind(...emails).all<{ email: string }>();
  const had = new Set(found.results.map((r) => r.email.toLowerCase()));
  const seen = new Set<string>();
  for (const r of good) { const e = cleanEmail(r.email); if (had.has(e) || seen.has(e)) res.updated++; else res.created++; seen.add(e); }
  await db.batch(good.flatMap((r) => upsertStatements(db, r, false)));
  return res;
}

export interface Submission { tag: string; page?: string; message?: string; first_name?: string; last_name?: string; email: string; phone?: string; subscribe?: boolean }
export async function recordSubmission(db: Db, s: Submission): Promise<{ contactId: string; submissionId: string; created: boolean }> {
  const email = cleanEmail(s.email);
  const tag = normTag(s.tag) || 'Website form';
  const before = await db.prepare('SELECT id FROM contacts WHERE email=?').bind(email).first<{ id: string }>();
  const now = Date.now();
  await db.batch(upsertStatements(db, {
    email, first_name: s.first_name, last_name: s.last_name, phone: s.phone, tags: [tag], source: 'Website form',
    email_status: s.subscribe ? 'subscribed' : 'never', created_at: now, last_activity_at: now, last_activity: `Submitted "${tag}"`,
  }, true));
  const row = await db.prepare('SELECT id FROM contacts WHERE email=?').bind(email).first<{ id: string }>();
  const submissionId = newId();
  await db.prepare(`INSERT INTO submissions (id, contact_id, tag, page, message, created_at) VALUES (?,?,?,?,?,?)`)
    .bind(submissionId, row!.id, tag, clip(s.page, 200) || null, String(s.message ?? '').slice(0, 5000), now).run();
  return { contactId: row!.id, submissionId, created: !before };
}

export interface ListQuery { q?: string; tag?: string; status?: string; emailStatus?: string; limit?: number; offset?: number }
const FIELDS = 'id, email, email2, first_name, last_name, phone, phone2, street, city, zip, status, email_status, sms_status, source, language, notes, created_at, last_activity_at, last_activity';

export async function listContacts(db: Db, q: ListQuery) {
  const where: string[] = []; const args: unknown[] = [];
  if (q.q?.trim()) {
    const like = `%${q.q.trim().replace(/[%_]/g, '')}%`;
    where.push(`(email LIKE ? OR email2 LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR (first_name || ' ' || last_name) LIKE ? OR phone LIKE ?)`);
    args.push(like, like, like, like, like, like);
  }
  if (q.tag === '__none') where.push('NOT EXISTS (SELECT 1 FROM contact_tags t WHERE t.contact_id = contacts.id)');
  else if (q.tag) { where.push('EXISTS (SELECT 1 FROM contact_tags t WHERE t.contact_id = contacts.id AND t.tag = ?)'); args.push(q.tag); }
  if (q.status) { where.push('status = ?'); args.push(q.status); }
  if (q.emailStatus) { where.push('email_status = ?'); args.push(q.emailStatus); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const offset = Math.max(Number(q.offset) || 0, 0);
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM contacts ${w}`).bind(...args).first<{ n: number }>())?.n ?? 0;
  const rows = (await db.prepare(`SELECT ${FIELDS} FROM contacts ${w} ORDER BY last_activity_at DESC, id LIMIT ? OFFSET ?`).bind(...args, limit, offset).all<any>()).results;
  const tags = new Map<string, string[]>();
  if (rows.length) {
    const t = await db.prepare(`SELECT contact_id, tag FROM contact_tags WHERE contact_id IN (${rows.map(() => '?').join(',')}) ORDER BY tag`).bind(...rows.map((r: any) => r.id)).all<{ contact_id: string; tag: string }>();
    for (const x of t.results) tags.set(x.contact_id, [...(tags.get(x.contact_id) ?? []), x.tag]);
  }
  return { total, contacts: rows.map((r: any) => ({ ...r, tags: tags.get(r.id) ?? [] })) };
}

export async function getContact(db: Db, id: string) {
  const c = await db.prepare(`SELECT ${FIELDS} FROM contacts WHERE id=?`).bind(id).first<any>();
  if (!c) return null;
  const tags = (await db.prepare('SELECT tag FROM contact_tags WHERE contact_id=? ORDER BY tag').bind(id).all<{ tag: string }>()).results.map((t) => t.tag);
  const submissions = (await db.prepare('SELECT id, tag, page, message, created_at, notified, notify_error FROM submissions WHERE contact_id=? ORDER BY created_at DESC LIMIT 50').bind(id).all<any>()).results;
  return { ...c, tags, submissions };
}

export async function updateContact(db: Db, id: string, p: Partial<ContactInput> & { status?: string; tags?: string[] }) {
  const sets: string[] = []; const vals: unknown[] = [];
  const text: [keyof ContactInput, number][] = [['first_name', 100], ['last_name', 100], ['phone', 40], ['phone2', 40], ['street', 200], ['city', 100], ['zip', 20], ['notes', 5000], ['language', 20]];
  for (const [k, n] of text) if (p[k] !== undefined) { sets.push(`${k}=?`); vals.push(k === 'phone' || k === 'phone2' ? cleanPhone(p[k]) : clip(p[k], n)); }
  if (p.email2 !== undefined) { sets.push('email2=?'); vals.push(cleanEmail(p.email2) || null); }
  if (p.status && ['new', 'contacted', 'closed'].includes(p.status)) { sets.push('status=?'); vals.push(p.status); }
  if (p.email_status && ['subscribed', 'never', 'unsubscribed'].includes(p.email_status)) { sets.push('email_status=?'); vals.push(p.email_status); }
  const stmts: Stmt[] = [];
  if (sets.length) stmts.push(db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id=?`).bind(...vals, id));
  if (p.tags) {
    stmts.push(db.prepare('DELETE FROM contact_tags WHERE contact_id=?').bind(id));
    for (const t of tagList(p.tags)) stmts.push(db.prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag) VALUES (?,?)').bind(id, t));
  }
  if (stmts.length) await db.batch(stmts);
}

export async function deleteContact(db: Db, id: string) {
  await db.batch([
    db.prepare('DELETE FROM contact_tags WHERE contact_id=?').bind(id),
    db.prepare('DELETE FROM submissions WHERE contact_id=?').bind(id),
    db.prepare('DELETE FROM contacts WHERE id=?').bind(id),
  ]);
}

export async function tagCounts(db: Db) {
  const tags = (await db.prepare('SELECT tag, COUNT(*) AS n FROM contact_tags GROUP BY tag COLLATE NOCASE ORDER BY n DESC, tag').all<{ tag: string; n: number }>()).results;
  const total = (await db.prepare('SELECT COUNT(*) AS n FROM contacts').first<{ n: number }>())?.n ?? 0;
  const fresh = (await db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE status='new'`).first<{ n: number }>())?.n ?? 0;
  return { tags, total, new: fresh };
}

/** Everyone who should hear about a new submission: active team members who have notifications on. */
export async function notifyRecipients(db: Db, extra?: string): Promise<string[]> {
  const rows = (await db.prepare(`SELECT email FROM users WHERE status='active' AND notify=1 ORDER BY created_at LIMIT 10`).all<{ email: string }>()).results;
  const out = new Map<string, string>();
  for (const r of rows) out.set(r.email.toLowerCase(), r.email);
  if (extra && isEmail(extra.trim())) out.set(extra.trim().toLowerCase(), extra.trim());
  return [...out.values()].slice(0, 10);
}
