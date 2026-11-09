// Dev/test only: a D1-shaped wrapper over Node's built-in SQLite, so `npm run dev` runs the same SQL as production.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Db, Stmt } from './db';

export function nodeD1(path = ':memory:'): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sql = new DatabaseSync(path);
  const clean = (a: unknown[]) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  const mk = (text: string, args: unknown[] = []): Stmt & { _run(): any } => ({
    bind: (...a) => mk(text, clean(a)),
    first: async () => ((sql.prepare(text).get(...(args as any[])) as any) ?? null),
    all: async () => ({ results: sql.prepare(text).all(...(args as any[])) as any[] }),
    run: async () => { const r = sql.prepare(text).run(...(args as any[])); return { meta: { changes: Number(r.changes) } }; },
    _run: () => sql.prepare(text).run(...(args as any[])),
  });
  return {
    prepare: (text) => mk(text),
    async batch(stmts) {
      sql.exec('BEGIN');
      try { const out = stmts.map((s: any) => s._run()); sql.exec('COMMIT'); return out; }
      catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
  };
}
