// Where /admin reads and writes the site's files.
//   GitHubStore: production. Every save is a commit; Cloudflare rebuilds the site from it.
//   FsStore (dev-api.ts): local `npm run dev`, writes straight into the working copy.

export interface Entry { name: string; path: string; size: number }
export interface TextEntry extends Entry { text: string | null }
export interface Store {
  list(dir: string): Promise<Entry[]>;
  /** Every file in a folder with its text, ideally in ONE request (Cloudflare's free plan allows only 50 outgoing calls per request). `text` is null when it couldn't be included; read it with read(). */
  readDir(dir: string): Promise<TextEntry[]>;
  read(path: string): Promise<string | null>;
  /** `content` is text, bytes, or already-base64 data wrapped as { base64 } (lets the Worker skip decoding big photos, which would exceed the free plan's 10 ms CPU limit). */
  write(path: string, content: string | Uint8Array | { base64: string }, message: string): Promise<void>;
  remove(path: string, message: string): Promise<void>;
  /** Explains, in plain words, why the site files could not be found (wrong repo, wrong branch, no token access...). */
  diagnose?(): Promise<string>;
}

const b64 = (data: string | Uint8Array | { base64: string }): string => {
  if (typeof data === 'object' && 'base64' in data) return data.base64;
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Turns GitHub's raw error into something the person setting this up can act on. */
async function ghError(res: Response): Promise<Error> {
  const detail = (await res.text()).slice(0, 300);
  if (res.status === 401) return new Error('GitHub rejected the token. GITHUB_TOKEN is wrong or has expired: make a new one and update it in Cloudflare.');
  if (res.status === 403) return new Error(detail.includes('rate limit') ? 'GitHub is rate-limiting requests. Wait a minute and try again.' : 'GitHub says the token is not allowed to do that. It needs "Contents: Read and write" on this repository.');
  if (res.status === 404) return new Error('GitHub could not find the repository or branch. Check GITHUB_REPO and GITHUB_BRANCH, and that the token has access to the repository.');
  return new Error(`GitHub error ${res.status}: ${detail}`);
}

export class GitHubStore implements Store {
  constructor(private repo: string, private token: string, private branch = 'main', private apiBase = 'https://api.github.com') {}

  private async gh(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${this.apiBase}/repos/${this.repo}${path ? `/${path}` : ''}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'crosstown-admin',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.headers ?? {}),
      },
    });
  }
  private enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

  async list(dir: string): Promise<Entry[]> {
    const res = await this.gh(`contents/${this.enc(dir)}?ref=${encodeURIComponent(this.branch)}`);
    if (res.status === 404) return [];
    if (!res.ok) throw await ghError(res);
    const items = (await res.json()) as { name: string; path: string; size: number; type: string }[];
    return items.filter((i) => i.type === 'file').map((i) => ({ name: i.name, path: i.path, size: i.size }));
  }

  async readDir(dir: string): Promise<TextEntry[]> {
    try {
      return await this.readDirGraphQL(dir);
    } catch (e) {
      // Safety net: if the one-call route fails for any reason, read files one by one (fine for small sites).
      console.error('readDir via GraphQL failed, falling back:', e instanceof Error ? e.message : e);
      const files = await this.list(dir);
      return Promise.all(files.map(async (f) => ({ ...f, text: await this.read(f.path) })));
    }
  }

  private async readDirGraphQL(dir: string): Promise<TextEntry[]> {
    const [owner, name] = this.repo.split('/');
    const query = `query($owner:String!,$name:String!,$expr:String!){repository(owner:$owner,name:$name){object(expression:$expr){... on Tree{entries{name type object{... on Blob{byteSize isBinary isTruncated text}}}}}}}`;
    const res = await fetch(`${this.apiBase}/graphql`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'User-Agent': 'crosstown-admin', 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { owner, name, expr: `${this.branch}:${dir}` } }),
    });
    if (!res.ok) throw await ghError(res);
    const data = (await res.json()) as { errors?: { message: string }[]; data?: { repository?: { object?: { entries?: { name: string; type: string; object?: { byteSize: number; isBinary: boolean; isTruncated: boolean; text: string | null } }[] } | null } | null } };
    if (data.errors?.length && !data.data?.repository) throw new Error(`GitHub error: ${data.errors[0]!.message}`);
    const entries = data.data?.repository?.object?.entries ?? [];
    return entries
      .filter((e) => e.type === 'blob')
      .map((e) => ({ name: e.name, path: `${dir}/${e.name}`, size: e.object?.byteSize ?? 0, text: e.object && !e.object.isBinary && !e.object.isTruncated ? e.object.text : null }));
  }

  async read(path: string): Promise<string | null> {
    const res = await this.gh(`contents/${this.enc(path)}?ref=${encodeURIComponent(this.branch)}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw await ghError(res);
    return res.text();
  }

  private async sha(path: string): Promise<string | undefined> {
    const res = await this.gh(`contents/${this.enc(path)}?ref=${encodeURIComponent(this.branch)}`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw await ghError(res);
    return ((await res.json()) as { sha: string }).sha;
  }

  async write(path: string, content: string | Uint8Array | { base64: string }, message: string): Promise<void> {
    // A second editor saving at the same moment can make the sha stale; retry once with a fresh one.
    for (let attempt = 0; attempt < 3; attempt++) {
      const sha = await this.sha(path);
      const res = await this.gh(`contents/${this.enc(path)}`, {
        method: 'PUT',
        body: JSON.stringify({ message, content: b64(content), branch: this.branch, ...(sha ? { sha } : {}) }),
      });
      if (res.ok) return;
      if (res.status !== 409 && res.status !== 422) throw await ghError(res);
    }
    throw new Error('Could not save: someone else changed this at the same time. Please try again.');
  }

  async diagnose(): Promise<string> {
    const where = `"${this.repo}" on branch "${this.branch}"`;
    const repoRes = await this.gh('');
    if (repoRes.status === 401) return 'GitHub rejected the token. GITHUB_TOKEN is wrong or has expired: make a new one and update it in Cloudflare.';
    if (repoRes.status === 404) {
      return `GitHub can't see the repository "${this.repo}". Either GITHUB_REPO is not exactly owner/name, or the token was not given access to this repository (when creating the token, "Repository access" must include it).`;
    }
    if (!repoRes.ok) return `GitHub error ${repoRes.status} while looking for ${where}.`;
    const info = (await repoRes.json()) as { permissions?: { push?: boolean }; default_branch?: string };
    if (info.permissions && info.permissions.push === false) {
      return `The token can read "${this.repo}" but not change it. Give it "Contents: Read and write" permission.`;
    }
    const branchRes = await this.gh(`branches/${this.enc(this.branch)}`);
    if (branchRes.status === 404) {
      const list = await this.gh('branches?per_page=8');
      const names = list.ok ? ((await list.json()) as { name: string }[]).map((b) => b.name).join(', ') : '';
      return `The repository exists but has no branch called "${this.branch}". Set GITHUB_BRANCH to the production branch${info.default_branch ? ` (the default is "${info.default_branch}")` : ''}${names ? `. Branches found: ${names}` : ''}.`;
    }
    return `Found ${where}, but it has no src/data/site.json. The branch must contain this site's files.`;
  }

  async remove(path: string, message: string): Promise<void> {
    const sha = await this.sha(path);
    if (!sha) return;
    const res = await this.gh(`contents/${this.enc(path)}`, { method: 'DELETE', body: JSON.stringify({ message, sha, branch: this.branch }) });
    if (!res.ok) throw await ghError(res);
  }
}
