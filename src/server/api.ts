// The /api/admin/* endpoints. Pure fetch-style handler so it runs in the Cloudflare Worker
// (GitHub storage) and in `npm run dev` (local files).
import { blockDefs, normalizePage, PALETTE, type PageData } from '../lib/blocks';
import { iconNames } from '../lib/icons';
import { slugify } from '../lib/html';
import { clearCookie, makeSession, readSession, sessionCookie } from './auth';
import { ensureSchema, type Db } from './db';
import { HttpError, json } from './http';
import { acceptInvite, getUser, login, seedIfEmpty, sessionSecret, type User } from './users';
import { handleCrm } from './admin-crm';
import type { FormEnv } from './forms-shared';
import { AgentError, runAgent, type AgentEnv } from './agent';
import type { Store } from './storage';

export interface AdminEnv extends AgentEnv, FormEnv {
  /** Optional: sign in details for the very first account (otherwise see FIRST_RUN in users.ts). */
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  DB?: Db;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
}

const PAGES_DIR = 'src/content/pages';
const POSTS_DIR = 'src/content/posts';
const IMAGES_DIR = 'public/images';
const SITE_FILE = 'src/data/site.json';
const RESERVED = new Set(['admin', 'api', 'post', '404', 'index']);
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|svg|avif)$/i;
const MAX_UPLOAD = 4 * 1024 * 1024;

const validSlug = (s: string) => /^[a-z0-9][a-z0-9-]{0,59}$/.test(s);

// ---------------------------------------------------------------- posts <-> markdown files
export interface PostFile { slug: string; title: string; date: string; author: string; category: string; image: string; description: string; body: string }

function parsePost(slug: string, text: string): PostFile {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  for (const line of (m?.[1] ?? '').split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2]!.trim();
    if (v.startsWith('"')) { try { v = JSON.parse(v); } catch { v = v.replace(/^"|"$/g, ''); } }
    meta[kv[1]!] = v;
  }
  return { slug, title: meta.title ?? slug, date: String(meta.date ?? '').slice(0, 10), author: meta.author ?? '', category: meta.category ?? '', image: meta.image ?? '', description: meta.description ?? '', body: (m?.[2] ?? '').trim() };
}
function serializePost(p: PostFile): string {
  const q = (s: string) => JSON.stringify(String(s).replace(/\s+/g, ' ').trim());
  return `---\ntitle: ${q(p.title)}\ndate: ${p.date}\nauthor: ${q(p.author)}\ncategory: ${p.category}\nimage: ${p.image}\ndescription: ${q(p.description)}\n---\n\n${p.body.trim()}\n`;
}

/** All files in a folder with their text. One request on GitHub; falls back to reading a file alone only if it was too big to include. */
async function readAll(store: Store, dir: string): Promise<{ name: string; path: string; text: string }[]> {
  const files = await store.readDir(dir);
  const out: { name: string; path: string; text: string }[] = [];
  for (const f of files) out.push({ name: f.name, path: f.path, text: f.text ?? (await store.read(f.path)) ?? '' });
  return out;
}

// ---------------------------------------------------------------- handler
export async function handleAdmin(request: Request, env: AdminEnv, store: Store, opts: { dev?: boolean } = {}): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '');
  const [head, ...rest] = route.split('/');
  const method = request.method;
  const secure = url.protocol === 'https:';

  const db = env.DB;
  if (!db) return json({ error: 'The contacts database is not set up yet. It is created automatically when the Worker is deployed with the DB binding (see README).' }, 503);

  try {
    await ensureSchema(db);
    await seedIfEmpty(db, env);
    const secret = await sessionSecret(db, env);
    const cookieFor = async (u: User) => sessionCookie(await makeSession({ uid: u.id, sv: u.sv }, secret), secure);

    if (head === 'login' && method === 'POST') {
      const { email, password } = (await request.json()) as { email?: string; password?: string };
      const r = await login(db, String(email ?? ''), String(password ?? ''));
      if (!r.ok) { await new Promise((res) => setTimeout(res, 400)); return json({ error: r.error }, r.status); }
      return json({ ok: true, mustChange: Boolean(r.user.must_change) }, 200, { 'set-cookie': await cookieFor(r.user) });
    }
    if (head === 'accept-invite' && method === 'POST') {
      const b = (await request.json()) as { email?: string; token?: string; name?: string; password?: string };
      try {
        const u = await acceptInvite(db, String(b.email ?? ''), String(b.token ?? ''), String(b.name ?? ''), String(b.password ?? ''));
        return json({ ok: true }, 200, { 'set-cookie': await cookieFor(u) });
      } catch (e) { return json({ error: (e as Error).message }, 400); }
    }
    if (head === 'logout') return json({ ok: true }, 200, { 'set-cookie': clearCookie(secure) });

    const session = await readSession(request, secret);
    const user = session ? await getUser(db, session.uid) : null;
    if (!session || !user || user.status !== 'active' || user.sv !== session.sv) return json({ error: 'Please sign in.' }, 401);
    // Cross-site form posts cannot set custom headers, so this blocks CSRF on top of SameSite=Strict.
    if (method !== 'GET' && request.headers.get('x-admin') !== '1') throw new HttpError('Bad request', 400);
    const by = `(by ${user.name || user.email})`;

    if (head === 'session') return json({ user: { id: user.id, name: user.name, email: user.email, mustChange: Boolean(user.must_change) } });
    if (user.must_change && !(head === 'me' || head === 'logout')) {
      return json({ error: 'Please choose a new password first.', mustChange: true }, 403);
    }
    const crm = await handleCrm({ head: head ?? '', rest, method, request, db, user, env: env as FormEnv, origin: url.origin, cookieFor });
    if (crm) return crm;

    // -------- site content
    if (head === 'bootstrap') {
      const [siteText, pageFiles, postFiles, mediaFiles] = await Promise.all([
        store.read(SITE_FILE), readAll(store, PAGES_DIR), readAll(store, POSTS_DIR), store.list(IMAGES_DIR),
      ]);
      if (siteText === null) throw new HttpError((await store.diagnose?.()) ?? 'The site files were not found. Check GITHUB_REPO and GITHUB_BRANCH.', 502);
      const pages = pageFiles.filter((f) => f.name.endsWith('.json')).map((f) => {
        const p = JSON.parse(f.text || '{}');
        return { slug: f.name.replace(/\.json$/, ''), title: String(p.title ?? f.name), draft: Boolean(p.draft), sections: Array.isArray(p.sections) ? p.sections.length : 0 };
      });
      const posts = postFiles.filter((f) => f.name.endsWith('.md')).map((f) => {
        const { body, ...meta } = parsePost(f.name.replace(/\.md$/, ''), f.text);
        return { ...meta, minutes: Math.max(1, Math.round(body.split(/\s+/).length / 200)), id: meta.slug };
      });
      return json({
        user: { id: user.id, name: user.name, email: user.email },
        site: JSON.parse(siteText ?? '{}'),
        pages: pages.sort((a, b) => (a.slug === 'index' ? -1 : b.slug === 'index' ? 1 : a.title.localeCompare(b.title))),
        posts: posts.sort((a, b) => b.date.localeCompare(a.date)),
        media: mediaFiles.filter((f) => IMAGE_EXT.test(f.name)).map((f) => ({ name: f.name, path: `/images/${f.name}`, size: f.size })),
        blocks: blockDefs.map(({ type, label, description, icon, fields, defaults }) => ({ type, label, description, icon, fields, defaults })),
        palette: PALETTE,
        icons: iconNames,
        agent: Boolean(env.ANTHROPIC_API_KEY),
        dev: Boolean(opts.dev),
      });
    }

    // -------- pages
    if (head === 'pages') {
      const slug = rest[0] ?? '';
      if (!validSlug(slug) && slug !== 'index') throw new HttpError('Page address can only use lowercase letters, numbers and dashes.');
      const path = `${PAGES_DIR}/${slug}.json`;
      if (method === 'GET') {
        const text = await store.read(path);
        if (text === null) throw new HttpError('Page not found', 404);
        return json({ slug, page: normalizePage(JSON.parse(text)) });
      }
      if (method === 'PUT') {
        if (RESERVED.has(slug) && slug !== 'index') throw new HttpError(`"${slug}" is reserved. Pick another address.`);
        const { page } = (await request.json()) as { page: unknown };
        const clean: PageData = normalizePage(page);
        if (slug === 'index') clean.draft = false;
        await store.write(path, JSON.stringify(clean, null, 2) + '\n', `Edit page "${clean.title}" ${by}`);
        return json({ ok: true, page: clean });
      }
      if (method === 'DELETE') {
        if (slug === 'index') throw new HttpError('The home page cannot be deleted.');
        await store.remove(path, `Delete page "${slug}" ${by}`);
        return json({ ok: true });
      }
    }

    // -------- posts
    if (head === 'posts') {
      const slug = rest[0] ?? '';
      if (method === 'GET' && slug) {
        const text = await store.read(`${POSTS_DIR}/${slug}.md`);
        if (text === null) throw new HttpError('Post not found', 404);
        return json({ post: parsePost(slug, text) });
      }
      if (method === 'PUT' && slug) {
        if (!validSlug(slug)) throw new HttpError('Bad post address.');
        const { post } = (await request.json()) as { post: PostFile };
        const date = /^\d{4}-\d{2}-\d{2}$/.test(post.date) ? post.date : new Date().toISOString().slice(0, 10);
        const clean: PostFile = {
          slug, date, title: String(post.title || 'Untitled').slice(0, 200), author: String(post.author ?? '').slice(0, 100),
          category: String(post.category ?? '').replace(/[^a-z0-9-]/gi, ''), image: String(post.image ?? '').startsWith('/images/') ? post.image : '',
          description: String(post.description ?? '').slice(0, 400), body: String(post.body ?? '').slice(0, 200000),
        };
        if (!clean.image) throw new HttpError('Please choose a photo for the post.');
        await store.write(`${POSTS_DIR}/${slug}.md`, serializePost(clean), `Edit post "${clean.title}" ${by}`);
        return json({ ok: true, post: clean });
      }
      if (method === 'DELETE' && slug) {
        await store.remove(`${POSTS_DIR}/${slug}.md`, `Delete post "${slug}" ${by}`);
        return json({ ok: true });
      }
    }

    // -------- site settings
    if (head === 'site' && method === 'PUT') {
      const { site } = (await request.json()) as { site: Record<string, any> };
      const current = JSON.parse((await store.read(SITE_FILE)) ?? '{}');
      const next = { ...current, ...site };
      if (!Array.isArray(next.nav)) throw new HttpError('Menu is invalid.');
      await store.write(SITE_FILE, JSON.stringify(next, null, 2) + '\n', `Edit site settings ${by}`);
      return json({ ok: true, site: next });
    }

    // -------- media
    if (head === 'media') {
      if (method === 'POST') {
        const { name, data } = (await request.json()) as { name: string; data: string };
        const dot = String(name).lastIndexOf('.');
        const base = slugify(dot > 0 ? name.slice(0, dot) : name) || 'photo';
        const ext = dot > 0 ? name.slice(dot).toLowerCase() : '.jpg';
        if (!IMAGE_EXT.test(ext)) throw new HttpError('Only photos (JPG, PNG, WebP, GIF) can be uploaded.');
        // Don't decode the photo here: GitHub wants base64 anyway, and decoding millions of characters would
        // exceed the free plan's 10 ms CPU limit. Check the size from the length instead.
        const clean = String(data ?? '');
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean.slice(0, 200)) || clean.length < 8) throw new HttpError('That file could not be read.');
        const size = Math.floor((clean.length * 3) / 4);
        if (size > MAX_UPLOAD) throw new HttpError('That photo is too large (4 MB max).');
        const existing = new Set((await store.list(IMAGES_DIR)).map((f) => f.name));
        let file = `${base}${ext}`, n = 2;
        while (existing.has(file)) file = `${base}-${n++}${ext}`;
        await store.write(`${IMAGES_DIR}/${file}`, { base64: clean }, `Add photo ${file} ${by}`);
        return json({ ok: true, media: { name: file, path: `/images/${file}`, size } });
      }
      if (method === 'DELETE') {
        const file = rest[0] ?? '';
        if (!IMAGE_EXT.test(file) || file.includes('..')) throw new HttpError('Bad file name.');
        await store.remove(`${IMAGES_DIR}/${file}`, `Delete photo ${file} ${by}`);
        return json({ ok: true });
      }
    }

    // -------- site agent
    if (head === 'agent' && method === 'POST') {
      const body = (await request.json()) as { prompt?: string; current?: { title: string; description: string; sections: unknown[] } };
      const prompt = String(body.prompt ?? '').trim();
      if (prompt.length < 4) throw new HttpError('Tell the agent what you would like.');
      const [siteText, pageFiles, mediaFiles] = await Promise.all([store.read(SITE_FILE), readAll(store, PAGES_DIR), store.list(IMAGES_DIR)]);
      const site = JSON.parse(siteText ?? '{}');
      const pages = pageFiles.filter((f) => f.name.endsWith('.json')).map((f) => ({
        slug: f.name.replace(/\.json$/, ''), title: String(JSON.parse(f.text || '{}').title ?? f.name),
      }));
      const result = await runAgent(env, {
        prompt: prompt.slice(0, 4000),
        current: body.current,
        images: mediaFiles.filter((f) => IMAGE_EXT.test(f.name) && !/^(logo-|og-)/.test(f.name)).map((f) => `/images/${f.name}`),
        pages,
        site,
      });
      return json(result);
    }

    return json({ error: 'Not found' }, 404);
  } catch (e) {
    if (e instanceof HttpError || e instanceof AgentError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 500);
  }
}
