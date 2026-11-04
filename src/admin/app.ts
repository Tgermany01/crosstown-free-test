// The /admin app: sign in, edit pages (sections + live preview), posts, photos and settings.
import { icon } from '../lib/icons';
import { slugify, uid } from '../lib/html';
import type { Field } from '../lib/blocks';
import { api, ApiError, clear, clone, debounce, h, modal, toast } from './dom';
import { fieldsForm, pickImage, setFormContext, uploadPhoto, fieldEl, type Media } from './forms';

// ------------------------------------------------------------------ types + state
interface BlockInfo { type: string; label: string; description: string; icon: string; fields: Field[]; defaults: Record<string, any> }
interface PageSummary { slug: string; title: string; draft: boolean; sections: number }
interface PostSummary { slug: string; title: string; date: string; author: string; category: string; image: string; description: string; minutes: number }
interface Section { id: string; type: string; [k: string]: any }
interface PageDoc { title: string; description: string; draft: boolean; sections: Section[] }
interface Boot {
  user: string; site: Record<string, any>; pages: PageSummary[]; posts: PostSummary[]; media: Media[];
  blocks: BlockInfo[]; palette: Record<string, string>; icons: string[]; agent: boolean; dev: boolean;
}
let boot: Boot;
const app = document.getElementById('app')!;
const blockInfo = (t: string) => boot.blocks.find((b) => b.type === t);

// ------------------------------------------------------------------ boot + routing
async function start() {
  try { await load(); route(); } catch (e) { if (e instanceof ApiError && e.status === 401) showLogin(); else showFatal(e as Error); }
}
async function load() {
  boot = await api<Boot>('bootstrap');
  setFormContext({
    media: boot.media, icons: boot.icons, pages: boot.pages,
    onMediaChange: () => {},
  });
}
const refresh = async () => { await load(); };

function showFatal(e: Error) {
  clear(app).append(h('div', { class: 'login' }, h('div', { class: 'login-card' }, h('h1', null, 'Crosstown Admin'), h('p', { class: 'error' }, e.message))));
}

function showLogin() {
  const name = h('input', { type: 'text', autocomplete: 'name', placeholder: 'e.g. Rose', value: localStorage.getItem('adminName') ?? '' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const err = h('p', { class: 'error', role: 'alert' });
  const form = h('form', { class: 'login-card', onsubmit: async (e: Event) => {
    e.preventDefault(); err.textContent = '';
    try {
      localStorage.setItem('adminName', name.value);
      await api('login', 'POST', { name: name.value, password: pass.value });
      await start();
    } catch (x) { err.textContent = (x as Error).message; }
  } },
    h('img', { src: '/images/logo-navy.png', alt: 'Crosstown', width: 140 }),
    h('h1', null, 'Site editor'),
    h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Your name'), name, h('span', { class: 'help' }, 'So the team can see who changed what.')),
    h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Password'), pass),
    err, h('button', { class: 'btn primary wide', type: 'submit' }, 'Sign in'));
  clear(app).append(h('div', { class: 'login' }, form));
  pass.focus();
}

function shell(active: string, content: HTMLElement, wide = false) {
  const link = (href: string, label: string, key: string) => h('a', { href, class: active === key ? 'active' : '' }, label);
  clear(app).append(
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, h('img', { src: '/images/logo-white.png', alt: '' }), h('span', null, 'Site editor')),
      h('nav', null, link('#/', 'Pages', 'pages'), link('#/posts', 'Blog posts', 'posts'), link('#/media', 'Photos', 'media'), link('#/settings', 'Settings', 'settings')),
      h('div', { class: 'top-right' },
        h('a', { href: '/', target: '_blank', rel: 'noopener' }, 'View site ↗'),
        h('button', { class: 'link', type: 'button', onclick: async () => { await api('logout', 'POST', {}); showLogin(); } }, `Sign out (${boot.user})`))),
    ...(boot.dev ? [h('div', { class: 'devbar' }, 'Local test mode: changes are saved to files on this computer, not published.')] : []),
    h('main', { class: wide ? 'wide' : '' }, content));
}

let leaveGuard: (() => boolean) | null = null;
window.addEventListener('hashchange', () => { if (leaveGuard && !leaveGuard()) { history.back(); return; } route(); });
window.addEventListener('beforeunload', (e) => { if (leaveGuard && !leaveGuardQuiet()) { e.preventDefault(); } });
let dirtyFlag = false;
const leaveGuardQuiet = () => !dirtyFlag;

function route() {
  leaveGuard = null; dirtyFlag = false;
  const [, section = '', id = ''] = location.hash.split('/');
  if (section === 'pages' && id) return pageEditor(decodeURIComponent(id));
  if (section === 'posts') return id ? postEditor(decodeURIComponent(id)) : postsList();
  if (section === 'media') return mediaView();
  if (section === 'settings') return settingsView();
  return pagesList();
}

// ------------------------------------------------------------------ pages list
function badge(draft: boolean) { return h('span', { class: `pill ${draft ? 'draft' : 'live'}` }, draft ? 'Draft' : 'Published'); }

function pagesList() {
  const rows = boot.pages.map((p) => h('div', { class: 'card row-card' },
    h('div', { class: 'grow' }, h('h3', null, p.title), h('p', { class: 'muted' }, `${p.slug === 'index' ? '/' : '/' + p.slug} · ${p.sections} section${p.sections === 1 ? '' : 's'}`)),
    badge(p.draft),
    h('a', { class: 'btn small', href: p.slug === 'index' ? '/' : `/${p.slug}`, target: '_blank', rel: 'noopener' }, 'View'),
    h('a', { class: 'btn small primary', href: `#/pages/${p.slug}` }, 'Edit')));
  shell('pages', h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Pages'), h('p', { class: 'muted' }, 'Click Edit to change a page, add sections or rearrange it.')),
      h('button', { class: 'btn primary', type: 'button', onclick: newPageDialog }, '＋ New page')),
    h('div', { class: 'stack-list' }, rows)));
}

const STARTERS: Record<string, { label: string; text: string; types: { type: string; over?: Record<string, any> }[] }> = {
  simple: { label: 'Simple page', text: 'A banner and a text section.', types: [{ type: 'hero', over: { height: 'medium', logo: false, heading: 'Page title', text: 'A short welcome line.' } }, { type: 'text', over: { edge: 'wave' } }] },
  landing: { label: 'Landing page', text: 'Banner, text, cards and a call to action.', types: [{ type: 'hero', over: { height: 'medium', logo: false, heading: 'Page title', text: 'A short welcome line.' } }, { type: 'text' }, { type: 'cards', over: { bg: 'ice', edge: 'wave' } }, { type: 'cta', over: { edge: 'wave-flip' } }] },
  blank: { label: 'Blank', text: 'Start empty and add sections yourself.', types: [] },
};
const makeSection = (type: string, over: Record<string, any> = {}): Section => ({ ...clone(blockInfo(type)!.defaults), ...over, id: uid(), type });

function newPageDialog() {
  const title = h('input', { type: 'text', placeholder: 'e.g. Youth Ministry' });
  const prompt = h('textarea', { rows: 5, placeholder: 'e.g. A page for our youth group. They meet Fridays at 7pm in the fellowship hall for games, a short message and pizza. Ages 12–18. Parents can email us with questions.' });
  const status = h('p', { class: 'muted' });
  const startWith = (key: string) => {
    if (!title.value.trim()) { title.focus(); status.textContent = 'Give the page a name first.'; return; }
    openNew(title.value.trim(), STARTERS[key]!.types.map((t) => makeSection(t.type, t.over)));
    m.close();
  };
  const ask = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (!title.value.trim()) { title.focus(); status.textContent = 'Give the page a name first.'; return; }
    if (prompt.value.trim().length < 8) { prompt.focus(); status.textContent = 'Tell the agent a little about the page.'; return; }
    ask.disabled = true; status.textContent = 'The site agent is building your page. This takes about 20 seconds…';
    try {
      const r = await api<{ page: PageDoc & { slug: string }; notes: string }>('agent', 'POST', { prompt: `Page name: ${title.value.trim()}. ${prompt.value.trim()}` });
      m.close();
      openNew(title.value.trim(), r.page.sections, { description: r.page.description, notes: r.notes });
    } catch (e) { status.textContent = (e as Error).message; ask.disabled = false; }
  } }, '✨ Build it for me');
  const body = h('div', { class: 'newpage' },
    h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Page name'), title),
    h('h3', null, 'Build it with sections'),
    h('div', { class: 'starters' }, Object.entries(STARTERS).map(([k, s]) => h('button', { type: 'button', class: 'starter', onclick: () => startWith(k) }, h('strong', null, s.label), h('span', null, s.text)))),
    h('h3', null, 'Or describe it to the site agent'),
    boot.agent
      ? h('div', null, prompt, h('p', { class: 'help' }, 'The agent drafts the page for you to review. Nothing goes live until you press Save and publish it.'), h('div', { class: 'row' }, ask))
      : h('p', { class: 'muted' }, 'The site agent is not switched on yet. To enable it, add an ANTHROPIC_API_KEY in Cloudflare (see the README).'),
    status);
  const m = modal('New page', body, { wide: true });
  title.focus();
}
function openNew(title: string, sections: Section[], extra: { description?: string; notes?: string } = {}) {
  sessionStorage.setItem('newPage', JSON.stringify({ title, sections, description: extra.description ?? '', notes: extra.notes ?? '' }));
  location.hash = '#/pages/new';
}

// ------------------------------------------------------------------ preview iframe
class Preview {
  frame = h('iframe', { src: '/admin/preview', title: 'Page preview', class: 'preview-frame' });
  ready = false;
  last: any = null;
  constructor(private onSelect: (id: string) => void) {
    window.addEventListener('message', this.onMsg);
  }
  onMsg = (e: MessageEvent) => {
    if (e.source !== this.frame.contentWindow) return;
    if (e.data?.t === 'ready') { this.ready = true; if (this.last) this.send(this.last); }
    if (e.data?.t === 'select') this.onSelect(e.data.id);
  };
  send(msg: any) { this.last = msg.t === 'render' ? msg : this.last; if (this.ready) this.frame.contentWindow?.postMessage(msg, location.origin); }
  render = debounce((sections: Section[]) => this.send({ t: 'render', sections, site: boot.site, posts: boot.posts, path: '/' }), 120);
  highlight(id: string) { this.send({ t: 'highlight', id }); }
  destroy() { window.removeEventListener('message', this.onMsg); }
}

// ------------------------------------------------------------------ page editor
function pageEditor(slug: string) {
  const isNew = slug === 'new';
  shell('pages', h('div', { class: 'loading' }, 'Loading…'), true);
  (async () => {
    let page: PageDoc; let notes = '';
    if (isNew) {
      const raw = sessionStorage.getItem('newPage');
      if (!raw) { location.hash = '#/'; return; }
      const d = JSON.parse(raw);
      page = { title: d.title, description: d.description, draft: true, sections: d.sections }; notes = d.notes;
    } else {
      try { page = (await api<{ page: PageDoc }>(`pages/${slug}`)).page; } catch (e) { toast((e as Error).message, 'error'); location.hash = '#/'; return; }
    }
    editor(slug, isNew, page, notes);
  })();
}

function editor(slugIn: string, isNew: boolean, page: PageDoc, notes: string) {
  let slug = isNew ? slugify(page.title) : slugIn;
  const isHome = slug === 'index';
  let saved = JSON.stringify(page);
  let expanded: string | null = null;
  let undoSections: Section[] | null = null;
  const inMenu = () => boot.site.nav.some((n: any) => n.href === (isHome ? '/' : `/${slug}`));
  let showInMenu = inMenu();
  const menuWas = showInMenu;

  const preview = new Preview((id) => { expand(id, true); });
  const status = h('span', { class: 'pill live' }, 'Saved');
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => save() }, 'Save');
  const list = h('div', { class: 'sections' });
  const layout = h('div', { class: 'editor' });

  const isDirty = () => JSON.stringify(page) !== saved || (showInMenu !== menuWas);
  const touch = () => {
    dirtyFlag = isDirty();
    status.className = `pill ${dirtyFlag ? 'draft' : 'live'}`;
    status.textContent = dirtyFlag ? 'Unsaved changes' : 'Saved';
    preview.render(page.sections);
  };
  leaveGuard = () => !dirtyFlag || confirm('You have unsaved changes. Leave without saving?');

  // ---- sections list
  const summary = (s: Section) => {
    const text = s.heading || s.title || s.eyebrow || s.text || s.body || s.kicker || (s.cards?.[0]?.title) || '';
    return String(text).replace(/\s+/g, ' ').slice(0, 60);
  };
  const move = (i: number, d: number) => {
    const j = i + d; if (j < 0 || j >= page.sections.length) return;
    [page.sections[i], page.sections[j]] = [page.sections[j]!, page.sections[i]!]; draw(); touch();
  };
  let dragId: string | null = null;
  function draw() {
    list.replaceChildren(...page.sections.map((s, i) => {
      const info = blockInfo(s.type)!;
      const open = expanded === s.id;
      const body = open ? h('div', { class: 'sec-body' }, fieldsForm(info.fields, s, () => { touch(); head.querySelector('.sec-sum')!.textContent = summary(s); })) : null;
      const head = h('div', { class: 'sec-head', onclick: (e: Event) => { if ((e.target as HTMLElement).closest('.sec-tools, .grip')) return; expand(open ? null : s.id, !open); } },
        h('span', { class: 'grip', title: 'Drag to reorder', draggable: true, ondragstart: (e: DragEvent) => { dragId = s.id; e.dataTransfer?.setData('text/plain', s.id); }, html: '⋮⋮' }),
        h('span', { class: 'sec-icon', html: icon(info.icon, 20) }),
        h('span', { class: 'sec-name' }, h('strong', null, info.label), h('span', { class: 'sec-sum' }, summary(s))),
        h('span', { class: 'sec-tools' },
          h('button', { type: 'button', title: 'Move up', onclick: () => move(i, -1) }, '↑'),
          h('button', { type: 'button', title: 'Move down', onclick: () => move(i, 1) }, '↓'),
          h('button', { type: 'button', title: 'Duplicate', onclick: () => { const c = clone(s); c.id = uid(); page.sections.splice(i + 1, 0, c); expanded = c.id; draw(); touch(); } }, '⧉'),
          h('button', { type: 'button', title: 'Delete section', onclick: () => { if (confirm(`Delete this "${info.label}" section?`)) { page.sections.splice(i, 1); if (expanded === s.id) expanded = null; draw(); touch(); } } }, '🗑')),
        h('span', { class: 'chev' }, open ? '▾' : '▸'));
      const card = h('div', { class: `sec${open ? ' open' : ''}`, 'data-id': s.id,
        ondragover: (e: DragEvent) => { if (dragId) { e.preventDefault(); card.classList.add('over'); } },
        ondragleave: () => card.classList.remove('over'),
        ondrop: (e: DragEvent) => { e.preventDefault(); card.classList.remove('over'); if (!dragId || dragId === s.id) return; const from = page.sections.findIndex((x) => x.id === dragId); const [m] = page.sections.splice(from, 1); page.sections.splice(page.sections.findIndex((x) => x.id === s.id), 0, m!); dragId = null; draw(); touch(); } },
        head, body);
      return card;
    }));
    if (!page.sections.length) list.append(h('p', { class: 'muted empty' }, 'No sections yet. Add one below, or ask the site agent.'));
  }
  function expand(id: string | null, scrollPreview: boolean) {
    expanded = id; draw();
    if (id) {
      if (scrollPreview) preview.highlight(id);
      list.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // ---- add section picker
  function addSection(at: number) {
    const grid = h('div', { class: 'picker' }, boot.blocks.map((b) => h('button', { type: 'button', class: 'pick', onclick: () => {
      const s = makeSection(b.type); if (page.sections.length === 0 || at === 0) s.edge = 'flat';
      page.sections.splice(at, 0, s); expanded = s.id; draw(); touch(); m.close();
      setTimeout(() => preview.highlight(s.id), 200);
    } }, h('span', { class: 'pick-icon', html: icon(b.icon, 26) }), h('strong', null, b.label), h('span', null, b.description))));
    const m = modal('Add a section', grid, { wide: true });
  }

  // ---- site agent
  const agentBox = (() => {
    const ta = h('textarea', { rows: 3, placeholder: 'Ask for a change, e.g. “Add a section with our Wednesday Bible study times” or “Make the intro warmer and shorter”.' });
    const out = h('div', { class: 'agent-out' });
    const go = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      if (ta.value.trim().length < 4) return;
      go.disabled = true; out.textContent = 'Thinking… this takes about 20 seconds.';
      try {
        const r = await api<{ page: PageDoc; notes: string }>('agent', 'POST', { prompt: ta.value.trim(), current: { title: page.title, description: page.description, sections: page.sections } });
        undoSections = clone(page.sections);
        page.sections = r.page.sections; if (!page.description) page.description = r.page.description;
        expanded = null; draw(); touch(); ta.value = '';
        out.replaceChildren(h('p', null, '✨ ', r.notes || 'Done. Have a look at the preview.'), h('button', { class: 'btn small', type: 'button', onclick: () => { page.sections = undoSections!; undoSections = null; draw(); touch(); out.textContent = 'Undone.'; } }, '↶ Undo the agent’s changes'));
      } catch (e) { out.textContent = (e as Error).message; } finally { go.disabled = false; }
    } }, '✨ Ask the agent');
    const box = h('details', { class: 'card agent' }, h('summary', null, '✨ Site agent: describe a change in plain English'),
      boot.agent ? h('div', null, ta, h('div', { class: 'row' }, go), out) : h('p', { class: 'muted' }, 'The site agent is not switched on yet. Add ANTHROPIC_API_KEY in Cloudflare to enable it.'));
    if (notes) { box.open = true; out.textContent = `✨ ${notes}`; box.querySelector('.row')?.after(out); }
    return box;
  })();

  // ---- page settings
  const titleIn = h('input', { type: 'text', value: page.title, oninput: () => { page.title = titleIn.value; if (isNew) { slug = slugify(titleIn.value); slugIn2.value = slug; } touch(); } });
  const slugIn2 = h('input', { type: 'text', value: slug, disabled: !isNew, oninput: () => { slug = slugify(slugIn2.value); slugIn2.value = slug; } });
  const desc = h('textarea', { rows: 2, value: page.description, placeholder: 'One sentence shown in Google results.', oninput: () => { page.description = desc.value; touch(); } });
  const draftBox = h('input', { type: 'checkbox', checked: !page.draft, disabled: isHome, onchange: () => { page.draft = !draftBox.checked; touch(); } });
  const menuBox = h('input', { type: 'checkbox', checked: showInMenu, onchange: () => { showInMenu = menuBox.checked; touch(); } });
  const settings = h('details', { class: 'card', open: isNew }, h('summary', null, 'Page settings'),
    h('div', { class: 'fields' },
      h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Page title'), titleIn),
      h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Web address'), h('div', { class: 'addr-row' }, h('span', null, '/'), slugIn2), isNew ? h('span', { class: 'help' }, 'Letters, numbers and dashes. Can’t be changed later.') : null),
      h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Search description'), desc),
      isHome ? null : h('label', { class: 'fld check' }, draftBox, h('span', null, 'Published (visible to visitors)')),
      h('label', { class: 'fld check' }, menuBox, h('span', null, 'Show in the top menu'))));

  async function save() {
    if (isNew && (!slug || ['admin', 'api', 'post', '404', 'index'].includes(slug))) { toast('Please choose a different web address for this page.', 'error'); settings.open = true; return; }
    if (isNew && boot.pages.some((p) => p.slug === slug)) { toast(`A page at /${slug} already exists. Change the web address.`, 'error'); settings.open = true; return; }
    if (!page.title.trim()) { toast('Please give the page a title.', 'error'); return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const r = await api<{ page: PageDoc }>(`pages/${slug}`, 'PUT', { page });
      if (showInMenu !== menuWas || (showInMenu && isNew)) {
        const href = isHome ? '/' : `/${slug}`;
        const nav = boot.site.nav.filter((n: any) => n.href !== href);
        if (showInMenu) nav.push({ label: page.title, href });
        const res = await api<{ site: any }>('site', 'PUT', { site: { nav } });
        boot.site = res.site;
      }
      saved = JSON.stringify(page); dirtyFlag = false;
      sessionStorage.removeItem('newPage');
      await refresh();
      toast(boot.dev ? 'Saved to your local files.' : 'Saved! The live site updates in about a minute.');
      if (isNew) { leaveGuard = null; location.hash = `#/pages/${slug}`; } else { status.className = 'pill live'; status.textContent = 'Saved'; }
      void r;
    } catch (e) { toast((e as Error).message, 'error'); } finally { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }

  async function del() {
    if (!confirm(`Delete the page "${page.title}"? This can't be undone from here.`)) return;
    try {
      await api(`pages/${slug}`, 'DELETE');
      if (inMenu()) { const nav = boot.site.nav.filter((n: any) => n.href !== `/${slug}`); boot.site = (await api<{ site: any }>('site', 'PUT', { site: { nav } })).site; }
      dirtyFlag = false; await refresh(); toast('Page deleted.'); location.hash = '#/';
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  // ---- layout
  const device = h('div', { class: 'seg' },
    ...(['Desktop', 'Tablet', 'Phone'] as const).map((d, i) => h('button', { type: 'button', class: i === 0 ? 'on' : '', onclick: (e: Event) => {
      device.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.target as HTMLElement).classList.add('on');
      stage.dataset.device = d.toLowerCase();
    } }, d)));
  const stage = h('div', { class: 'stage', 'data-device': 'desktop' }, preview.frame);
  const tabs = h('div', { class: 'seg only-narrow' },
    h('button', { type: 'button', class: 'on', onclick: (e: Event) => { layout.classList.remove('show-preview'); tabs.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.target as HTMLElement).classList.add('on'); } }, 'Edit'),
    h('button', { type: 'button', onclick: (e: Event) => { layout.classList.add('show-preview'); tabs.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.target as HTMLElement).classList.add('on'); } }, 'Preview'));

  layout.append(
    h('div', { class: 'pane-edit' },
      h('div', { class: 'edit-bar' },
        h('a', { class: 'back', href: '#/' }, '← Pages'),
        h('h1', null, isNew ? 'New page' : page.title), status, h('span', { class: 'grow' }), tabs, saveBtn),
      agentBox, settings,
      h('h2', { class: 'sec-title' }, 'Sections'),
      list,
      h('div', { class: 'add-row' }, h('button', { class: 'btn primary wide', type: 'button', onclick: () => addSection(page.sections.length) }, '＋ Add a section')),
      isNew || isHome ? null : h('div', { class: 'danger' }, h('button', { class: 'btn small danger-btn', type: 'button', onclick: del }, 'Delete this page'))),
    h('div', { class: 'pane-preview' }, h('div', { class: 'preview-bar' }, h('strong', null, 'Live preview'), device, h('span', { class: 'muted' }, 'Click a section in the preview to edit it')), stage));
  shell('pages', layout, true);
  draw(); touch(); dirtyFlag = isNew; if (isNew) { status.className = 'pill draft'; status.textContent = 'Not saved yet'; }
  preview.render(page.sections);
  // Re-draw preview once frame is ready is handled by Preview.onMsg using `last`.
  preview.last = { t: 'render', sections: page.sections, site: boot.site, posts: boot.posts, path: '/' };
}

// ------------------------------------------------------------------ posts
function postsList() {
  const cat = (k: string) => boot.site.categories?.find((c: any) => c.key === k)?.label ?? k;
  shell('posts', h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Blog posts'), h('p', { class: 'muted' }, 'Testimonies and reports. They appear on the Blog and Outreach pages.')),
      h('a', { class: 'btn primary', href: '#/posts/new' }, '＋ New post')),
    h('div', { class: 'stack-list' }, boot.posts.map((p) => h('div', { class: 'card row-card' },
      h('img', { class: 'thumb', src: p.image, alt: '' }),
      h('div', { class: 'grow' }, h('h3', null, p.title), h('p', { class: 'muted' }, `${p.date} · ${p.author} · ${cat(p.category)}`)),
      h('a', { class: 'btn small', href: `/post/${p.slug}`, target: '_blank', rel: 'noopener' }, 'View'),
      h('a', { class: 'btn small primary', href: `#/posts/${p.slug}` }, 'Edit'))))));
}

async function postEditor(slugIn: string) {
  const isNew = slugIn === 'new';
  let post: any = { slug: '', title: '', date: new Date().toISOString().slice(0, 10), author: boot.user, category: boot.site.categories?.[0]?.key ?? '', image: '', description: '', body: '' };
  if (!isNew) { try { post = (await api<{ post: any }>(`posts/${slugIn}`)).post; } catch (e) { toast((e as Error).message, 'error'); location.hash = '#/posts'; return; } }
  const saved = JSON.stringify(post);
  const touch = () => { dirtyFlag = JSON.stringify(post) !== saved; };
  leaveGuard = () => !dirtyFlag || confirm('You have unsaved changes. Leave without saving?');
  const fields: Field[] = [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'author', label: 'Author', type: 'text' },
    { key: 'category', label: 'Category', type: 'select', options: (boot.site.categories ?? []).map((c: any) => ({ value: c.key, label: c.label })) },
    { key: 'image', label: 'Cover photo', type: 'image' },
    { key: 'description', label: 'Short summary', type: 'textarea', help: 'Shown on the post card and in search results.' },
  ];
  const date = h('input', { type: 'date', value: post.date, onchange: () => { post.date = date.value; touch(); } });
  const bodyField = fieldEl({ key: 'body', label: 'Post', type: 'markdown' }, post, touch);
  (bodyField.querySelector('textarea') as HTMLTextAreaElement).rows = 18;
  const insertPhoto = h('button', { class: 'btn small', type: 'button', onclick: async () => {
    const p = await pickImage(); const ta = bodyField.querySelector('textarea') as HTMLTextAreaElement;
    if (p) { ta.setRangeText(`\n\n![](${p})\n\n`, ta.selectionStart, ta.selectionEnd, 'end'); post.body = ta.value; touch(); }
  } }, '🖼 Insert a photo');
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (!post.title.trim()) { toast('Please add a title.', 'error'); return; }
    const slug = isNew ? slugify(post.title) : slugIn;
    if (isNew && boot.posts.some((p) => p.slug === slug)) { toast('A post with that title already exists. Change the title a little.', 'error'); return; }
    saveBtn.disabled = true;
    try {
      await api(`posts/${slug}`, 'PUT', { post });
      dirtyFlag = false; await refresh(); toast(boot.dev ? 'Saved to your local files.' : 'Saved! The live site updates in about a minute.');
      leaveGuard = null; location.hash = '#/posts';
    } catch (e) { toast((e as Error).message, 'error'); } finally { saveBtn.disabled = false; }
  } }, 'Save post');
  shell('posts', h('div', { class: 'narrow-col' },
    h('div', { class: 'edit-bar' }, h('a', { class: 'back', href: '#/posts' }, '← Posts'), h('h1', null, isNew ? 'New post' : post.title), h('span', { class: 'grow' }), saveBtn),
    h('div', { class: 'card' }, fieldsForm(fields, post, touch), h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Date'), date),
      h('div', { class: 'fld' }, bodyField, insertPhoto)),
    isNew ? null : h('div', { class: 'danger' }, h('button', { class: 'btn small danger-btn', type: 'button', onclick: async () => {
      if (!confirm(`Delete "${post.title}"?`)) return;
      try { await api(`posts/${slugIn}`, 'DELETE'); dirtyFlag = false; await refresh(); toast('Post deleted.'); leaveGuard = null; location.hash = '#/posts'; } catch (e) { toast((e as Error).message, 'error'); }
    } }, 'Delete this post'))));
}

// ------------------------------------------------------------------ media
function mediaView() {
  const grid = h('div', { class: 'media-grid big' });
  const draw = () => {
    grid.replaceChildren(...boot.media.map((m) => h('div', { class: 'media-tile static' },
      h('img', { src: m.path, alt: '', loading: 'lazy' }),
      h('span', null, m.name),
      h('div', { class: 'tile-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { navigator.clipboard?.writeText(m.path); toast('Photo address copied.'); } }, 'Copy address'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
          if (!confirm(`Delete ${m.name}? Pages using it will show a blank space.`)) return;
          try { await api(`media/${m.name}`, 'DELETE'); boot.media.splice(boot.media.indexOf(m), 1); draw(); toast('Photo deleted.'); } catch (e) { toast((e as Error).message, 'error'); }
        } }, 'Delete')))));
  };
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async () => {
    for (const f of Array.from(file.files ?? [])) {
      try { await uploadPhoto(f); draw(); toast(`Uploaded ${f.name}`); } catch (e) { toast((e as Error).message, 'error'); }
    }
    file.value = '';
  } });
  shell('media', h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Photos'), h('p', { class: 'muted' }, 'Upload photos once, then pick them in any section. Big photos are shrunk automatically.')),
      h('button', { class: 'btn primary', type: 'button', onclick: () => file.click() }, '⬆ Upload photos'), file), grid));
  draw();
}

// ------------------------------------------------------------------ settings
const SETTINGS: { title: string; fields: Field[] }[] = [
  { title: 'Church', fields: [
    { key: 'name', label: 'Church name', type: 'text' }, { key: 'tagline', label: 'Tagline', type: 'text' },
    { key: 'description', label: 'Default search description', type: 'textarea' }] },
  { title: 'Contact details (footer)', fields: [
    { key: 'hours', label: 'Service times line', type: 'text', help: 'Shown at the bottom of every page, e.g. “Sundays 11-1”.' },
    { key: 'phone', label: 'Phone (as shown)', type: 'text' }, { key: 'phoneHref', label: 'Phone link', type: 'text', help: 'e.g. tel:+12094626560' },
    { key: 'textNumber', label: 'Text-message number', type: 'text' }, { key: 'email', label: 'Email', type: 'text' },
    { key: 'street', label: 'Street address', type: 'text' }, { key: 'cityStateZip', label: 'City, state, ZIP', type: 'text' },
    { key: 'mailing', label: 'Mailing address', type: 'text' }, { key: 'mapUrl', label: 'Map link', type: 'link' }] },
  { title: 'Buttons and links', fields: [
    { key: 'donateLabel', label: 'Donate button text', type: 'text' }, { key: 'donateUrl', label: 'Donate link (leave empty to hide the button)', type: 'link' },
    { key: 'facebookUrl', label: 'Facebook page', type: 'link' }, { key: 'youtubeUrl', label: 'YouTube channel', type: 'link' }] },
  { title: 'Top menu', fields: [
    { key: 'nav', label: 'Menu items', type: 'list', itemLabel: 'label', max: 9, fields: [{ key: 'label', label: 'Name', type: 'text' }, { key: 'href', label: 'Goes to', type: 'link' }] }] },
  { title: 'Footer', fields: [
    { key: 'newsletterHeading', label: 'Newsletter box heading', type: 'text' },
    { key: 'affiliationName', label: 'Affiliation name', type: 'text' }, { key: 'affiliationUrl', label: 'Affiliation link', type: 'link' },
    { key: 'creditName', label: 'Web design credit', type: 'text' }, { key: 'creditUrl', label: 'Web design credit link', type: 'link' }] },
  { title: 'Blog categories', fields: [
    { key: 'categories', label: 'Categories', type: 'list', itemLabel: 'label', max: 8, fields: [
      { key: 'label', label: 'Name', type: 'text' }, { key: 'key', label: 'Short key', type: 'text', help: 'Lowercase, no spaces (used by posts).' },
      { key: 'slug', label: 'Address', type: 'text', help: 'Used in the web address /blog/categories/…' }] }] },
];

function settingsView() {
  const site = clone(boot.site);
  const saved = JSON.stringify(site);
  const touch = () => { dirtyFlag = JSON.stringify(site) !== saved; };
  leaveGuard = () => !dirtyFlag || confirm('You have unsaved changes. Leave without saving?');
  const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    saveBtn.disabled = true;
    try { boot.site = (await api<{ site: any }>('site', 'PUT', { site })).site; dirtyFlag = false; toast(boot.dev ? 'Saved to your local files.' : 'Saved! The live site updates in about a minute.'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { saveBtn.disabled = false; }
  } }, 'Save settings');
  shell('settings', h('div', { class: 'narrow-col' },
    h('div', { class: 'edit-bar' }, h('h1', null, 'Settings'), h('span', { class: 'grow' }), saveBtn),
    SETTINGS.map((g) => h('details', { class: 'card', open: g.title === 'Church' }, h('summary', null, g.title), fieldsForm(g.fields, site, touch)))));
}

start();
