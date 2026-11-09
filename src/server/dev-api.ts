// Dev-only: serves /api/admin/* from `npm run dev` by writing straight to the working copy.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { handleAdmin, type AdminEnv } from './api';
import type { Entry, Store, TextEntry } from './storage';

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
  async write(path: string, content: string | Uint8Array) {
    await mkdir(dirname(join(this.root, path)), { recursive: true });
    await writeFile(join(this.root, path), content);
  }
  async remove(path: string) { await rm(join(this.root, path), { force: true }); }
}

export function devHandler(root: string, env: AdminEnv) {
  const store = new FsStore(root);
  return async (req: any, res: any, next: () => void) => {
    if (!req.url?.startsWith('/api/admin')) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    const response = await handleAdmin(request, env, store, { dev: true });
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
