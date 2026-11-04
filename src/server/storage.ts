// Where /admin reads and writes the site's files.
//   GitHubStore: production. Every save is a commit; Cloudflare Pages rebuilds from it.
//   FsStore (dev-api.ts): local `npm run dev`, writes straight into the working copy.

export interface Entry { name: string; path: string; size: number }
export interface Store {
  list(dir: string): Promise<Entry[]>;
  read(path: string): Promise<string | null>;
  write(path: string, content: string | Uint8Array, message: string): Promise<void>;
  remove(path: string, message: string): Promise<void>;
}

const b64 = (data: string | Uint8Array): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export class GitHubStore implements Store {
  constructor(private repo: string, private token: string, private branch = 'main', private apiBase = 'https://api.github.com') {}

  private async gh(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${this.apiBase}/repos/${this.repo}/${path}`, {
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
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    const items = (await res.json()) as { name: string; path: string; size: number; type: string }[];
    return items.filter((i) => i.type === 'file').map((i) => ({ name: i.name, path: i.path, size: i.size }));
  }

  async read(path: string): Promise<string | null> {
    const res = await this.gh(`contents/${this.enc(path)}?ref=${encodeURIComponent(this.branch)}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    return res.text();
  }

  private async sha(path: string): Promise<string | undefined> {
    const res = await this.gh(`contents/${this.enc(path)}?ref=${encodeURIComponent(this.branch)}`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { sha: string }).sha;
  }

  async write(path: string, content: string | Uint8Array, message: string): Promise<void> {
    // A second editor saving at the same moment can make the sha stale; retry once with a fresh one.
    for (let attempt = 0; attempt < 3; attempt++) {
      const sha = await this.sha(path);
      const res = await this.gh(`contents/${this.enc(path)}`, {
        method: 'PUT',
        body: JSON.stringify({ message, content: b64(content), branch: this.branch, ...(sha ? { sha } : {}) }),
      });
      if (res.ok) return;
      if (res.status !== 409 && res.status !== 422) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    }
    throw new Error('Could not save: someone else changed this at the same time. Please try again.');
  }

  async remove(path: string, message: string): Promise<void> {
    const sha = await this.sha(path);
    if (!sha) return;
    const res = await this.gh(`contents/${this.enc(path)}`, { method: 'DELETE', body: JSON.stringify({ message, sha, branch: this.branch }) });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  }
}
