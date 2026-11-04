// Turns the block field definitions (src/lib/blocks.ts) into edit forms.
import { icon } from '../lib/icons';
import { parseYouTube, type Field } from '../lib/blocks';
import { clone, h, modal, api, toast } from './dom';

export interface Media { name: string; path: string; size: number }
export interface Ctx { media: Media[]; pages: { slug: string; title: string }[]; icons: string[]; onMediaChange: () => void }
let ctx: Ctx;
export const setFormContext = (c: Ctx) => { ctx = c; };
export const getFormContext = () => ctx;

type Change = () => void;

// ------------------------------------------------------------------ images
async function toUploadable(file: File): Promise<{ name: string; data: string }> {
  const asBase64 = (buf: ArrayBuffer) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
  const resizable = /^image\/(jpeg|png|webp)$/.test(file.type);
  if (!resizable) return { name: file.name, data: asBase64(await file.arrayBuffer()) };
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return { name: file.name, data: asBase64(await file.arrayBuffer()) };
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const png = file.type === 'image/png';
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), png ? 'image/png' : 'image/jpeg', 0.86));
  const name = file.name.replace(/\.\w+$/, png ? '.png' : '.jpg');
  return { name, data: asBase64(await blob.arrayBuffer()) };
}

export async function uploadPhoto(file: File): Promise<Media> {
  const up = await toUploadable(file);
  const { media } = await api<{ media: Media }>('media', 'POST', up);
  ctx.media.unshift(media);
  ctx.onMediaChange();
  return media;
}

/** Opens the photo library; resolves with the chosen path (or null if closed). */
export function pickImage(current = ''): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => { if (!done) { done = true; m.close(); resolve(v); } };
    const grid = h('div', { class: 'media-grid' });
    const draw = () => {
      grid.replaceChildren(...ctx.media.filter((x) => !/^(logo-|og-)/.test(x.name)).map((x) =>
        h('button', { type: 'button', class: `media-tile${x.path === current ? ' sel' : ''}`, onclick: () => finish(x.path), title: x.name },
          h('img', { src: x.path, alt: '', loading: 'lazy' }), h('span', null, x.name))));
      if (!grid.children.length) grid.append(h('p', { class: 'muted' }, 'No photos yet. Upload one above.'));
    };
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const f = file.files?.[0]; if (!f) return;
      status.textContent = 'Uploading…';
      try { const media = await uploadPhoto(f); finish(media.path); } catch (e) { status.textContent = ''; toast((e as Error).message, 'error'); }
    } });
    const status = h('span', { class: 'muted' });
    const body = h('div', null,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => file.click() }, '⬆ Upload a new photo'), file, status),
      grid);
    const m = modal('Choose a photo', body, { wide: true });
    m.el.addEventListener('click', (e) => { if (e.target === m.el) finish(null); });
    draw();
  });
}

// ------------------------------------------------------------------ icon picker
function iconField(value: string, set: (v: string) => void, change: Change): HTMLElement {
  const btn = h('button', { type: 'button', class: 'icon-pick', title: 'Choose icon' });
  const paint = () => { btn.innerHTML = `${icon(value, 28)}<span>${value.replace(/-/g, ' ')}</span>`; };
  paint();
  btn.addEventListener('click', () => {
    const grid = h('div', { class: 'icon-grid' }, ctx.icons.filter((n) => !['facebook', 'youtube', 'instagram', 'menu', 'close', 'plus', 'arrow-left', 'arrow-right', 'chevron-down', 'play', 'clock', 'phone', 'mail', 'mailbox'].includes(n)).map((n) =>
      h('button', { type: 'button', class: n === value ? 'sel' : '', title: n, html: icon(n, 30), onclick: () => { value = n; set(n); paint(); change(); m.close(); } })));
    const m = modal('Choose an icon', grid);
  });
  return btn;
}

// ------------------------------------------------------------------ markdown box
function markdownField(value: string, set: (v: string) => void, change: Change, rows = 6): HTMLElement {
  const ta = h('textarea', { rows, value, oninput: () => { set(ta.value); change(); } });
  const wrap = (before: string, after = before) => {
    const { selectionStart: a, selectionEnd: b } = ta;
    const sel = ta.value.slice(a, b) || 'text';
    ta.setRangeText(`${before}${sel}${after}`, a, b, 'select');
    ta.focus(); set(ta.value); change();
  };
  const prefix = (p: string) => {
    const a = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    ta.setRangeText(p, a, a, 'end'); ta.focus(); set(ta.value); change();
  };
  const tool = (label: string, title: string, fn: () => void) => h('button', { type: 'button', title, onclick: fn }, label);
  return h('div', { class: 'md' },
    h('div', { class: 'md-bar' },
      tool('B', 'Bold', () => wrap('**')), tool('I', 'Italic', () => wrap('*')),
      tool('🔗', 'Link', () => { const url = prompt('Link address (https://… or /about)'); if (url) wrap('[', `](${url})`); }),
      tool('• List', 'Bullet list', () => prefix('- ')), tool('H', 'Smaller heading', () => prefix('### '))),
    ta);
}

// ------------------------------------------------------------------ one field
export function fieldEl(f: Field, obj: Record<string, any>, change: Change): HTMLElement {
  const set = (v: any) => { obj[f.key] = v; };
  const value = obj[f.key];
  const label = (control: HTMLElement) => h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, f.label), control, f.help ? h('span', { class: 'help' }, f.help) : null);
  const group = (control: HTMLElement) => h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, f.label), control, f.help ? h('span', { class: 'help' }, f.help) : null);

  switch (f.type) {
    case 'text': {
      const i = h('input', { type: 'text', value: value ?? '', oninput: () => { set(i.value); change(); } });
      return label(i);
    }
    case 'textarea': {
      const t = h('textarea', { rows: 3, value: value ?? '', oninput: () => { set(t.value); change(); } });
      return label(t);
    }
    case 'markdown': return group(markdownField(value ?? '', set, change, 6));
    case 'boolean': {
      const c = h('input', { type: 'checkbox', checked: Boolean(value), onchange: () => { set(c.checked); change(); } });
      return h('label', { class: 'fld check' }, c, h('span', null, f.label), f.help ? h('span', { class: 'help' }, f.help) : null);
    }
    case 'select': {
      const s = h('select', { onchange: () => { set(s.value); change(); } }, f.options!.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
      return label(s);
    }
    case 'icon': return group(iconField(value ?? 'star', set, change));
    case 'link': {
      const id = `links-${Math.random().toString(36).slice(2, 7)}`;
      const i = h('input', { type: 'text', value: value ?? '', placeholder: 'Pick a page or paste https://…', list: id, oninput: () => { set(i.value.trim()); change(); } });
      const dl = h('datalist', { id }, [{ slug: '', title: 'Home' }, ...ctx.pages.filter((p) => p.slug !== 'index')].map((p) => h('option', { value: `/${p.slug}`, label: p.title })));
      return h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, f.label), i, dl, f.help ? h('span', { class: 'help' }, f.help) : null);
    }
    case 'youtube': {
      const thumb = h('img', { class: 'yt-thumb', alt: '' });
      const paint = () => { thumb.style.display = value ? 'block' : 'none'; if (value) thumb.src = `https://i.ytimg.com/vi/${value}/mqdefault.jpg`; };
      const i = h('input', { type: 'text', value: value ?? '', placeholder: 'https://www.youtube.com/watch?v=…', onchange: () => { const id = parseYouTube(i.value); set(id); i.value = id; (obj as any)[f.key] = id; change(); paint(); } });
      paint();
      return h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, f.label), i, thumb, f.help ? h('span', { class: 'help' }, f.help) : null);
    }
    case 'image': {
      const preview = h('div', { class: 'img-prev' });
      const paint = () => {
        const v = obj[f.key] as string;
        preview.replaceChildren(
          v ? h('img', { src: v, alt: '' }) : h('span', { class: 'img-empty' }, 'No photo'),
          h('div', { class: 'img-actions' },
            h('button', { type: 'button', class: 'btn small', onclick: async () => { const p = await pickImage(obj[f.key]); if (p) { set(p); paint(); change(); } } }, v ? 'Change photo' : 'Choose photo'),
            v ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { set(''); paint(); change(); } }, 'Remove') : null));
      };
      paint();
      return group(preview);
    }
    case 'list': return listField(f, obj, change);
  }
}

export function fieldsForm(fields: Field[], obj: Record<string, any>, change: Change): HTMLElement {
  return h('div', { class: 'fields' }, fields.map((f) => fieldEl(f, obj, change)));
}

function blankItem(fields: Field[]): Record<string, any> {
  const o: Record<string, any> = {};
  for (const f of fields) o[f.key] = f.type === 'boolean' ? Boolean(f.default) : f.type === 'list' ? [] : f.default ?? (f.type === 'select' ? f.options![0]!.value : f.type === 'icon' ? 'star' : '');
  return o;
}

function listField(f: Field, obj: Record<string, any>, change: Change): HTMLElement {
  if (!Array.isArray(obj[f.key])) obj[f.key] = [];
  const items: Record<string, any>[] = obj[f.key];
  const box = h('div', { class: 'list' });
  const openSet = new WeakSet<object>();
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j]!, items[i]!]; draw(); change(); };
  const draw = () => {
    box.replaceChildren(...items.map((item, i) => {
      const title = String(item[f.itemLabel ?? ''] ?? '').trim() || `${f.label.replace(/s$/, '')} ${i + 1}`;
      const body = h('div', { class: 'list-body' }, fieldsForm(f.fields!, item, () => { head.querySelector('.list-title')!.textContent = String(item[f.itemLabel ?? ''] ?? '').trim() || `${f.label.replace(/s$/, '')} ${i + 1}`; change(); }));
      const details = h('details', { class: 'list-item', open: openSet.has(item) || items.length === 1 });
      const head = h('summary', null,
        h('span', { class: 'list-title' }, title),
        h('span', { class: 'list-tools' },
          h('button', { type: 'button', title: 'Move up', onclick: (e: Event) => { e.preventDefault(); move(i, -1); } }, '↑'),
          h('button', { type: 'button', title: 'Move down', onclick: (e: Event) => { e.preventDefault(); move(i, 1); } }, '↓'),
          h('button', { type: 'button', title: 'Duplicate', onclick: (e: Event) => { e.preventDefault(); items.splice(i + 1, 0, clone(item)); draw(); change(); } }, '⧉'),
          h('button', { type: 'button', title: 'Remove', onclick: (e: Event) => { e.preventDefault(); if (confirm('Remove this item?')) { items.splice(i, 1); draw(); change(); } } }, '✕')));
      details.append(head, body);
      details.addEventListener('toggle', () => (details.open ? openSet.add(item) : openSet.delete(item)));
      return details;
    }));
    if (!f.max || items.length < f.max) {
      box.append(h('button', { type: 'button', class: 'btn small', onclick: () => { const item = blankItem(f.fields!); items.push(item); openSet.add(item); draw(); change(); } }, `＋ Add ${f.label.toLowerCase().replace(/s$/, '')}`));
    }
  };
  draw();
  return h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, f.label), box);
}
