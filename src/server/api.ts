// The /api/admin/* endpoints. Pure fetch-style handler so it runs in the Cloudflare Worker
// (GitHub storage) and in `npm run dev` (local files).
import { blockDefs, normalizePage, PALETTE, type PageData } from '../lib/blocks';
import { iconNames } from '../lib/icons';
import { slugify } from '../lib/html';
import { clearCookie, makeSession, passwordMatches, readSession, sessionCookie } from './auth';
import { AgentError, runAgent, type AgentEnv } from './agent';
import type { Store } from './storage';

export interface AdminEnv extends AgentEnv {
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
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
const MAX_UPLOAD = 6 * 1024 * 1024;

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
class HttpError extends Error { constructor(message: string, public status = 400) { super(message); } }

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

// ---------------------------------------------------------------- handler
export async function handleAdmin(request: Request, env: AdminEnv, store: Store, opts: { dev?: boolean } = {}): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '');
  const [head, ...rest] = route.split('/');
  const method = request.method;
  const secure = url.protocol === 'https:';

  const password = env.ADMIN_PASSWORD ?? (opts.dev ? 'crosstown' : undefined);
  if (!password) return json({ error: 'Admin is not set up yet: add the ADMIN_PASSWORD setting in Cloudflare.' }, 503);
  const secret = env.SESSION_SECRET ?? `${password}|crosstown-admin`;

  try {
    if (head === 'login' && method === 'POST') {
      const { name, password: given } = (await request.json()) as { name?: string; password?: string };
      if (!(await passwordMatches(String(given ?? ''), password))) {
        await new Promise((r) => setTimeout(r, 600));
        return json({ error: 'That password is not right.' }, 401);
      }
      const cookie = sessionCookie(await makeSession(String(name || 'Editor').trim() || 'Editor', secret), secure);
      return json({ ok: true }, 200, { 'set-cookie': cookie });
    }
    if (head === 'logout') return json({ ok: true }, 200, { 'set-cookie': clearCookie(secure) });

    const session = await readSession(request, secret);
    if (!session) return json({ error: 'Please sign in.' }, 401);
    // Cross-site form posts cannot set custom headers, so this blocks CSRF on top of SameSite=Strict.
    if (method !== 'GET' && request.headers.get('x-admin') !== '1') throw new HttpError('Bad request', 400);
    const by = `(by ${session.name})`;

    // -------- session / bootstrap
    if (head === 'session') return json({ name: session.name });

    if (head === 'bootstrap') {
      const [siteText, pageFiles, postFiles, mediaFiles] = await Promise.all([
        store.read(SITE_FILE), store.list(PAGES_DIR), store.list(POSTS_DIR), store.list(IMAGES_DIR),
      ]);
      if (siteText === null) throw new HttpError('Connected to GitHub, but the site files were not found there. Check GITHUB_REPO and GITHUB_BRANCH (the branch must contain this site).', 502);
      const pages = await Promise.all(
        pageFiles.filter((f) => f.name.endsWith('.json')).map(async (f) => {
          const slug = f.name.replace(/\.json$/, '');
          const p = normalizePage(JSON.parse((await store.read(f.path)) ?? '{}'));
          return { slug, title: p.title, draft: p.draft, sections: p.sections.length };
        }),
      );
      const posts = await Promise.all(
        postFiles.filter((f) => f.name.endsWith('.md')).map(async (f) => {
          const { body, ...meta } = parsePost(f.name.replace(/\.md$/, ''), (await store.read(f.path)) ?? '');
          return { ...meta, minutes: Math.max(1, Math.round(body.split(/\s+/).length / 200)), id: meta.slug };
        }),
      );
      return json({
        user: session.name,
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
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        if (bytes.length > MAX_UPLOAD) throw new HttpError('That photo is too large (6 MB max).');
        const existing = new Set((await store.list(IMAGES_DIR)).map((f) => f.name));
        let file = `${base}${ext}`, n = 2;
        while (existing.has(file)) file = `${base}-${n++}${ext}`;
        await store.write(`${IMAGES_DIR}/${file}`, bytes, `Add photo ${file} ${by}`);
        return json({ ok: true, media: { name: file, path: `/images/${file}`, size: bytes.length } });
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
      const [siteText, pageFiles, mediaFiles] = await Promise.all([store.read(SITE_FILE), store.list(PAGES_DIR), store.list(IMAGES_DIR)]);
      const site = JSON.parse(siteText ?? '{}');
      const pages = await Promise.all(pageFiles.filter((f) => f.name.endsWith('.json')).map(async (f) => ({
        slug: f.name.replace(/\.json$/, ''), title: normalizePage(JSON.parse((await store.read(f.path)) ?? '{}')).title,
      })));
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
