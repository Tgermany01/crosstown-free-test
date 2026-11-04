// Production entry for /api/admin/*. Saves become commits in the GitHub repo; Cloudflare Pages then rebuilds the site.
import { handleAdmin, type AdminEnv } from '../../../src/server/api';
import { GitHubStore } from '../../../src/server/storage';

export const onRequest: PagesFunction<AdminEnv> = async ({ request, env }) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return new Response(JSON.stringify({ error: 'Admin is not set up yet: add GITHUB_TOKEN and GITHUB_REPO in Cloudflare.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  return handleAdmin(request, env, new GitHubStore(env.GITHUB_REPO, env.GITHUB_TOKEN, env.GITHUB_BRANCH || 'main'));
};
