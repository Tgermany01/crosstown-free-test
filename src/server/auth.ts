// Shared-password sign-in with a signed, HTTP-only cookie. Works in Workers and Node (WebCrypto).
const enc = new TextEncoder();
const COOKIE = 'crosstown_admin';
const DAYS = 14;

const toB64Url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toB64Url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

async function sha(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Constant-time password check (compares fixed-length hashes). */
export async function passwordMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha(given), sha(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function makeSession(name: string, secret: string): Promise<string> {
  const body = toB64Url(enc.encode(JSON.stringify({ n: name.slice(0, 60), e: Date.now() + DAYS * 864e5 })));
  return `${body}.${await hmac(secret, body)}`;
}

export async function readSession(request: Request, secret: string): Promise<{ name: string } | null> {
  const raw = request.headers.get('Cookie')?.split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig || (await hmac(secret, body)) !== sig) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64Url(body))) as { n: string; e: number };
    return data.e > Date.now() ? { name: data.n } : null;
  } catch { return null; }
}

export const sessionCookie = (value: string, secure: boolean) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DAYS * 86400}${secure ? '; Secure' : ''}`;
export const clearCookie = (secure: boolean) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
