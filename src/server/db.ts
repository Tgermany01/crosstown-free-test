// Database layer: Cloudflare D1 in production, Node's built-in SQLite in `npm run dev` (same SQL, same API).
// Holds the admin users, the contacts and the form submissions. Nothing here is committed to GitHub.

export interface Stmt {
  bind(...values: unknown[]): Stmt;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
export interface Db {
  prepare(sql: string): Stmt;
  batch(statements: Stmt[]): Promise<unknown[]>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL DEFAULT '',
    pass_hash TEXT, pass_salt TEXT, iterations INTEGER, status TEXT NOT NULL DEFAULT 'active',
    notify INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0,
    invite_hash TEXT, invite_expires INTEGER, sv INTEGER NOT NULL DEFAULT 1,
    failed INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
    last_login INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, email2 TEXT,
    first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '',
    phone TEXT, phone2 TEXT, street TEXT, city TEXT, zip TEXT,
    status TEXT NOT NULL DEFAULT 'new', email_status TEXT NOT NULL DEFAULT 'never', sms_status TEXT,
    source TEXT, language TEXT, notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL, last_activity TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_activity ON contacts(last_activity_at DESC)`,
  `CREATE TABLE IF NOT EXISTS contact_tags (
    contact_id TEXT NOT NULL, tag TEXT NOT NULL COLLATE NOCASE, PRIMARY KEY (contact_id, tag))`,
  `CREATE INDEX IF NOT EXISTS idx_tags_tag ON contact_tags(tag)`,
  `CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY, contact_id TEXT NOT NULL, tag TEXT NOT NULL, page TEXT, message TEXT,
    created_at INTEGER NOT NULL, notified INTEGER NOT NULL DEFAULT 0, notify_error TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_sub_contact ON submissions(contact_id, created_at DESC)`,
];

const ready = new WeakSet<object>();
/** Creates the tables the first time (per running instance). Safe to call on every request. */
export async function ensureSchema(db: Db): Promise<void> {
  if (ready.has(db as object)) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  ready.add(db as object);
}

export const newId = (): string => {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};
