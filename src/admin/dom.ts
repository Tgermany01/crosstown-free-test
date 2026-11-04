// Tiny DOM + network helpers for the admin app (no framework).
type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, any> | null;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && k !== 'style') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c: Child) => {
    if (Array.isArray(c)) c.forEach(add);
    else if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

export const clear = (el: Element) => { while (el.firstChild) el.firstChild.remove(); return el; };
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-admin': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) throw new ApiError(data?.error ?? `Something went wrong (${res.status}).`, res.status);
  return data as T;
}

let toastTimer: number | undefined;
export function toast(message: string, kind: 'ok' | 'error' = 'ok') {
  let box = document.getElementById('toast');
  if (!box) { box = h('div', { id: 'toast', role: 'status' }); document.body.append(box); }
  box.className = `show ${kind}`;
  box.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (box!.className = ''), kind === 'error' ? 7000 : 4500);
}

export function modal(title: string, body: HTMLElement, opts: { wide?: boolean } = {}): { close: () => void; el: HTMLElement } {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: 'overlay', onclick: (e: Event) => { if (e.target === overlay) close(); } },
    h('div', { class: `modal${opts.wide ? ' wide' : ''}`, role: 'dialog', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, '✕')),
      h('div', { class: 'modal-body' }, body)));
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  return { close, el: overlay };
}

export const debounce = <A extends unknown[]>(fn: (...a: A) => void, ms: number) => {
  let t: number | undefined;
  return (...a: A) => { clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); };
};
