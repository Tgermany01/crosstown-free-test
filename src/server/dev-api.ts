// Dev-only: serves /api/admin/* from `npm run dev` by writing straight to the working copy.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { appendFileSync, mkdirSync } from 'node:fs';
import { handleAdmin, type AdminEnv } from './api';
import { handleContact, handleSubscribe } from './forms';
import type { Entry, Store, TextEntry } from './storage';
import { nodeD1 } from './dev-db';

export class FsStore implements Store {
  constructor(private root: string) {}
  async list(dir: string): Promise<Entry[]> {
    try {
      const names = await readdir(join(this.root, dir));
      const out: Entry[] = [];
      for (const name of names) {
        const s = await stat(join(this.root, dir, name));
        if (s.isFile() && name !== '.gitkeep') out.push({ name, path: `${dir}/${name}`, size: s.size });
      }
      return out;
    } catch { return []; }
  }
  async readDir(dir: string): Promise<TextEntry[]> {
    const files = await this.list(dir);
    return Promise.all(files.map(async (f) => ({ ...f, text: await this.read(f.path) })));
  }
  async read(path: string) { try { return await readFile(join(this.root, path), 'utf8'); } catch { return null; } }
  async write(path: string, content: string | Uint8Array | { base64: string }) {
    await mkdir(dirname(join(this.root, path)), { recursive: true });
    await writeFile(join(this.root, path), typeof content === 'object' && 'base64' in content ? Buffer.from(content.base64, 'base64') : content);
  }
  async remove(path: string) { await rm(join(this.root, path), { force: true }); }
}

export function devHandler(root: string, env: AdminEnv) {
  const store = new FsStore(root);
  // Local contacts database (kept out of git in .local/).
  const devEnv: AdminEnv = {
    ...env, DB: nodeD1(join(root, '.local', 'dev.sqlite')), CONTACT_FROM: env.CONTACT_FROM ?? 'Crosstown Dev <dev@localhost>',
    // Stand-in for Cloudflare's email sender: writes what would have been sent to .local/outbox.txt.
    EMAIL: {
      async send(m) {
        const line = `--- ${new Date().toISOString()}\nTo: ${m.to}\nSubject: ${m.subject}\nReply-To: ${typeof m.replyTo === 'string' ? m.replyTo : m.replyTo?.email ?? ''}\n\n${m.text}\n\n`;
        mkdirSync(join(root, '.local'), { recursive: true });
        appendFileSync(join(root, '.local', 'outbox.txt'), line);
        console.log(`[dev email] to ${m.to}: ${m.subject}`);
        return { messageId: 'dev' };
      },
    },
  };
  return async (req: any, res: any, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    const path = new URL(request.url).pathname;
    const response = path === '/api/contact' && req.method === 'POST' ? await handleContact(request, devEnv)
      : path === '/api/subscribe' && req.method === 'POST' ? await handleSubscribe(request, devEnv)
      : path.startsWith('/api/admin') ? await handleAdmin(request, devEnv, store, { dev: true })
      : new Response('Not found', { status: 404 });
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
