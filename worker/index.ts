// The site's Cloudflare Worker. Static pages are served straight from the built `dist/` folder by Workers
// Static Assets; only /api/* requests reach this code (see `run_worker_first` in wrangler.jsonc).
import { handleAdmin, type AdminEnv } from '../src/server/api';
import { GitHubStore, type Store } from '../src/server/storage';
import { HttpError } from '../src/server/http';
import { handleContact, handleSubscribe, type FormEnv } from '../src/server/forms';

interface Env extends AdminEnv {
  ASSETS: Fetcher;
}

const text = (body: string, status: number) => new Response(body, { status, headers: { 'cache-control': 'no-store' } });

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');

    if (path === '/api/admin' || path.startsWith('/api/admin/')) {
      // Be forgiving about how the settings were typed: stray spaces, a pasted URL, a trailing ".git".
      let store: Store;
      if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
        const repo = env.GITHUB_REPO.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
        store = new GitHubStore(repo, env.GITHUB_TOKEN.trim(), (env.GITHUB_BRANCH || 'main').trim());
      } else {
        // Team and contacts screens work without GitHub; only page/post/photo editing needs it.
        const missing = async (): Promise<never> => { throw new HttpError('Page editing is not set up yet: add GITHUB_TOKEN and GITHUB_REPO in Cloudflare.', 503); };
        store = { list: missing, readDir: missing, read: missing, write: missing, remove: missing };
      }
      return handleAdmin(request, env, store);
    }

    if (path === '/api/contact' || path === '/api/subscribe') {
      if (request.method !== 'POST') return text('Method not allowed', 405);
      try {
        return await (path === '/api/contact' ? handleContact(request, env) : handleSubscribe(request, env));
      } catch (e) {
        console.error(e);
        return text('Something went wrong. Please email or call us instead.', 500);
      }
    }

    if (path.startsWith('/api/')) return text('Not found', 404);
    // Anything else normally never gets here (assets are served first); fall through to the site just in case.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
