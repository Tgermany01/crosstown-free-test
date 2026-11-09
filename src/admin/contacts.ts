// Contacts screen: everyone who filled in a form or was imported, with tags, notes, import and export.
import { api, debounce, h, modal, toast } from './dom';
import { autoMap, FIELDS, parseCsv, rowToContact, type FieldKey, type Mapping } from './csv';
import type { Deps } from './team';

interface Contact {
  id: string; email: string; email2: string | null; first_name: string; last_name: string; phone: string | null; phone2: string | null;
  street: string | null; city: string | null; zip: string | null; status: 'new' | 'contacted' | 'closed'; email_status: 'subscribed' | 'never' | 'unsubscribed';
  notes: string; source?: string | null; created_at: number; last_activity_at: number; last_activity: string | null; tags: string[];
  submissions?: { id: string; tag: string; page: string | null; message: string; created_at: number; notified: number; notify_error: string | null }[];
}
interface TagInfo { tags: { tag: string; n: number }[]; total: number; new: number }

const STATUS = { new: 'New', contacted: 'Contacted', closed: 'Closed' } as const;
const SUBS = { subscribed: 'Subscribed', never: 'Never subscribed', unsubscribed: 'Unsubscribed' } as const;
const fullName = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(' ');
const day = (ms: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');
const dateTime = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export async function contactsView(d: Deps, openId?: string) {
  let q = '', tag = '', status = '', emailStatus = '', offset = 0;
  const PAGE = 50;
  let info: TagInfo = { tags: [], total: 0, new: 0 };
  const body = h('div', { class: 'table-wrap' });
  const pager = h('div', { class: 'pager' });
  const tagSel = h('select', { onchange: () => { tag = tagSel.value; offset = 0; load(); } });
  const statusSel = h('select', { onchange: () => { status = statusSel.value; offset = 0; load(); } },
    h('option', { value: '' }, 'Any status'), ...Object.entries(STATUS).map(([v, l]) => h('option', { value: v }, l)));
  const subSel = h('select', { onchange: () => { emailStatus = subSel.value; offset = 0; load(); } },
    h('option', { value: '' }, 'Any subscription'), ...Object.entries(SUBS).map(([v, l]) => h('option', { value: v }, l)));
  const search = h('input', { type: 'search', placeholder: 'Search name, email or phone…', oninput: debounce(() => { q = search.value; offset = 0; load(); }, 250) });
  const count = h('p', { class: 'muted' });

  const params = (extra: Record<string, string | number> = {}) => new URLSearchParams({ q, tag, status, emailStatus, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) }).toString();

  async function loadTags() {
    info = await api<TagInfo>('contacts/tags');
    tagSel.replaceChildren(h('option', { value: '' }, `All tags (${info.total})`), ...info.tags.map((t) => h('option', { value: t.tag, selected: t.tag === tag }, `${t.tag} (${t.n})`)), h('option', { value: '__none', selected: tag === '__none' }, 'No tag'));
    count.textContent = `${info.total} contact${info.total === 1 ? '' : 's'}${info.new ? ` · ${info.new} new` : ''}`;
  }

  async function load() {
    const r = await api<{ total: number; contacts: Contact[] }>(`contacts?${params({ limit: PAGE, offset })}`);
    body.replaceChildren(r.contacts.length ? h('table', { class: 'contacts' },
      h('thead', null, h('tr', null, ['Name', 'Phone', 'Tags', 'Status', 'Last activity'].map((t) => h('th', null, t)))),
      h('tbody', null, r.contacts.map((c) => h('tr', { tabindex: 0, onclick: () => openContact(c.id), onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') openContact(c.id); } },
        h('td', null, h('strong', null, fullName(c) || c.email), fullName(c) ? h('div', { class: 'muted' }, c.email) : null),
        h('td', null, c.phone ?? ''),
        h('td', null, h('div', { class: 'chips' }, c.tags.map((t) => h('span', { class: 'chip' }, t)))),
        h('td', null, h('span', { class: `pill st-${c.status}` }, STATUS[c.status]), c.email_status === 'unsubscribed' ? h('span', { class: 'pill off' }, 'Unsubscribed') : null),
        h('td', { class: 'muted' }, day(c.last_activity_at), c.last_activity ? h('div', null, c.last_activity) : null)))))
      : h('p', { class: 'empty muted' }, info.total ? 'No contacts match those filters.' : 'No contacts yet. They appear here when someone fills in a form on the site, or you can import your list.'));
    const from = r.total ? offset + 1 : 0, to = Math.min(offset + PAGE, r.total);
    pager.replaceChildren(h('span', { class: 'muted' }, `Showing ${from}–${to} of ${r.total}`),
      h('button', { class: 'btn small', type: 'button', disabled: offset === 0, onclick: () => { offset = Math.max(0, offset - PAGE); load(); } }, '← Previous'),
      h('button', { class: 'btn small', type: 'button', disabled: offset + PAGE >= r.total, onclick: () => { offset += PAGE; load(); } }, 'Next →'));
  }

  const refresh = async () => { await loadTags(); await load(); };

  // ------------------------------------------------------------ one contact
  async function openContact(id: string) {
    const { contact: c } = await api<{ contact: Contact }>(`contacts/${id}`);
    const f = (k: keyof Contact, label: string, type = 'text') => {
      const i = h('input', { type, value: String(c[k] ?? ''), oninput: () => ((c as any)[k] = i.value) });
      return h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, label), i);
    };
    let tags = [...c.tags];
    const chips = h('div', { class: 'chips edit' });
    const newTag = h('input', { type: 'text', placeholder: 'Add a tag and press Enter', list: 'tag-suggest', onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); add(); } } });
    const add = () => { const v = newTag.value.trim(); if (v && !tags.some((t) => t.toLowerCase() === v.toLowerCase())) { tags.push(v); paint(); } newTag.value = ''; };
    const paint = () => chips.replaceChildren(...tags.map((t) => h('span', { class: 'chip' }, t, h('button', { type: 'button', 'aria-label': `Remove ${t}`, onclick: () => { tags = tags.filter((x) => x !== t); paint(); } }, '×'))));
    paint();
    const sel = (k: 'status' | 'email_status', label: string, opts: Record<string, string>) => {
      const s = h('select', { onchange: () => ((c as any)[k] = s.value) }, Object.entries(opts).map(([v, l]) => h('option', { value: v, selected: v === c[k] }, l)));
      return h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, label), s);
    };
    const notes = h('textarea', { rows: 3, value: c.notes, placeholder: 'Private notes for the team (never shown on the site)', oninput: () => (c.notes = notes.value) });
    const history = (c.submissions ?? []).map((s) => h('li', null,
      h('strong', null, s.tag), h('span', { class: 'muted' }, ` · ${dateTime(s.created_at)}${s.page ? ` · ${s.page}` : ''}`),
      s.message ? h('p', null, s.message) : null,
      s.notify_error ? h('p', { class: 'warn-note' }, `Not everyone could be emailed: ${s.notify_error}`) : null));
    const m = modal(fullName(c) || c.email, h('div', { class: 'contact-detail' },
      h('datalist', { id: 'tag-suggest' }, info.tags.map((t) => h('option', { value: t.tag }))),
      h('p', { class: 'muted' }, h('a', { href: `mailto:${c.email}` }, c.email), ` · added ${day(c.created_at)}${c.source ? ` · ${c.source}` : ''}`),
      h('div', { class: 'grid2' }, f('first_name', 'First name'), f('last_name', 'Last name'), f('phone', 'Phone'), f('phone2', 'Second phone'), f('email2', 'Second email'), f('street', 'Street'), f('city', 'City'), f('zip', 'ZIP')),
      h('div', { class: 'grid2' }, sel('status', 'Status', STATUS), sel('email_status', 'Email subscription', SUBS)),
      h('div', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Tags'), chips, newTag),
      h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Notes'), notes),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          add();
          try { await api(`contacts/${id}`, 'PATCH', { first_name: c.first_name, last_name: c.last_name, phone: c.phone, phone2: c.phone2, email2: c.email2, street: c.street, city: c.city, zip: c.zip, status: c.status, email_status: c.email_status, notes: c.notes, tags }); toast('Saved.'); m.close(); await refresh(); }
          catch (e) { toast((e as Error).message, 'error'); }
        } }, 'Save'),
        h('a', { class: 'btn', href: `mailto:${c.email}` }, 'Email them'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn danger-btn', type: 'button', onclick: async () => {
          if (!confirm(`Delete ${fullName(c) || c.email} and their history? This can't be undone.`)) return;
          try { await api(`contacts/${id}`, 'DELETE'); toast('Contact deleted.'); m.close(); await refresh(); } catch (e) { toast((e as Error).message, 'error'); }
        } }, 'Delete')),
      history.length ? h('div', null, h('h3', null, 'History'), h('ul', { class: 'history' }, history)) : null), { wide: true });
  }

  // ------------------------------------------------------------ add by hand
  function addContact() {
    const v: Record<string, string> = { email: '', first_name: '', last_name: '', phone: '', tags: '' };
    const inp = (k: string, label: string, ph = '') => { const i = h('input', { type: 'text', placeholder: ph, oninput: () => (v[k] = i.value) }); return h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, label), i); };
    const m = modal('Add a contact', h('div', null,
      h('div', { class: 'grid2' }, inp('first_name', 'First name'), inp('last_name', 'Last name'), inp('email', 'Email *'), inp('phone', 'Phone')),
      inp('tags', 'Tags', 'Separate with commas, e.g. Volunteer, CSI Prayer Team'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        try { await api('contacts', 'POST', { ...v, tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean) }); toast('Contact added.'); m.close(); await refresh(); } catch (e) { toast((e as Error).message, 'error'); }
      } }, 'Add contact'))));
  }

  // ------------------------------------------------------------ export
  async function exportCsv() {
    toast('Preparing your file…');
    const rows: Contact[] = []; let off = 0;
    for (;;) { const r = await api<{ total: number; contacts: Contact[] }>(`contacts?${params({ limit: 200, offset: off })}`); rows.push(...r.contacts); off += 200; if (off >= r.total) break; }
    const esc = (s: unknown) => { const t = String(s ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const head = ['First Name', 'Last Name', 'Email', 'Phone', 'Tags', 'Status', 'Email subscription', 'Notes', 'Added', 'Last activity'];
    const lines = [head.join(','), ...rows.map((c) => [c.first_name, c.last_name, c.email, c.phone, c.tags.join('; '), STATUS[c.status], SUBS[c.email_status], c.notes, day(c.created_at), day(c.last_activity_at)].map(esc).join(','))];
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' })), download: `crosstown-contacts-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
    toast(`Exported ${rows.length} contacts.`);
  }

  // ------------------------------------------------------------ import
  function importDialog() {
    const stage = h('div');
    const m = modal('Import contacts from a CSV file', stage, { wide: true });
    const file = h('input', { type: 'file', accept: '.csv,text/csv', onchange: async () => { const f = file.files?.[0]; if (f) mapStep(parseCsv(await f.text()), f.name); } });
    stage.replaceChildren(
      h('p', null, 'Choose the CSV you exported from Wix (or any spreadsheet saved as CSV). In Wix: ', h('strong', null, 'Contacts → Export'), ' and download the file.'),
      h('p', { class: 'muted' }, 'You can check everything before anything is saved. People already here (same email) are merged, never duplicated, so importing twice is safe.'), file);

    function mapStep(rows: string[][], name: string) {
      if (rows.length < 2) { toast('That file looks empty.', 'error'); return; }
      const headers = rows[0]!; const data = rows.slice(1);
      const map: Mapping = autoMap(headers);
      const extra = h('input', { type: 'text', value: 'Wix import', placeholder: 'e.g. Wix import' });
      const summary = h('div', { class: 'import-summary' });
      const sels = FIELDS.map((fd) => {
        const s = h('select', { onchange: () => { (map as any)[fd.key] = Number(s.value); recount(); } },
          h('option', { value: '-1' }, '(not in my file)'), ...headers.map((hd, i) => h('option', { value: String(i), selected: map[fd.key as FieldKey] === i }, hd || `Column ${i + 1}`)));
        return h('tr', null, h('td', null, fd.label, 'required' in fd && fd.required ? ' *' : ''), h('td', null, s));
      });
      const go = h('button', { class: 'btn primary', type: 'button', onclick: () => run() }, 'Import');
      const mine = () => data.map((r) => rowToContact(r, map, extra.value.trim() ? [extra.value.trim()] : []));
      function recount() {
        const parsed = mine(); const valid = parsed.filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
        const counts = new Map<string, number>(); for (const r of valid) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
        const unsub = valid.filter((r) => r.email_status === 'unsubscribed').length, subd = valid.filter((r) => r.email_status === 'subscribed').length;
        summary.replaceChildren(
          h('p', null, h('strong', null, `${valid.length} of ${parsed.length} rows`), ` have a valid email and will be imported.${parsed.length - valid.length ? ` ${parsed.length - valid.length} will be skipped (no email).` : ''}`),
          h('p', { class: 'muted' }, `${subd} subscribed · ${unsub} unsubscribed (kept as “do not email”) · ${valid.length - subd - unsub} never subscribed`),
          h('div', { class: 'chips' }, [...counts].sort((a, b) => b[1] - a[1]).map(([t, n]) => h('span', { class: 'chip' }, `${t} · ${n}`))));
        go.disabled = valid.length === 0;
      }
      extra.addEventListener('input', recount);
      stage.replaceChildren(
        h('p', null, h('strong', null, name), ` · ${data.length} rows. Check the columns were matched correctly:`),
        h('div', { class: 'map-scroll' }, h('table', { class: 'map' }, h('tbody', null, sels))),
        h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Also add this tag to everyone (optional)'), extra),
        summary, h('div', { class: 'row' }, go, h('button', { class: 'btn', type: 'button', onclick: () => importDialog() }, 'Choose a different file')));
      recount();

      async function run() {
        const parsed = mine(); const valid = parsed.filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
        const bar = h('progress', { max: valid.length, value: 0 });
        const status = h('p', { class: 'muted' }, 'Importing…');
        stage.replaceChildren(h('h3', null, 'Importing'), bar, status);
        let created = 0, updated = 0, failed = 0;
        for (let i = 0; i < valid.length; i += 25) {
          try { const r = await api<{ created: number; updated: number }>('contacts/import', 'POST', { rows: valid.slice(i, i + 25) }); created += r.created; updated += r.updated; }
          catch (e) { failed += Math.min(25, valid.length - i); toast((e as Error).message, 'error'); }
          bar.value = Math.min(valid.length, i + 25); status.textContent = `${Math.min(valid.length, i + 25)} of ${valid.length}…`;
        }
        stage.replaceChildren(h('h3', null, 'Done'),
          h('p', null, `${created} new contacts added, ${updated} merged with people who were already here.${failed ? ` ${failed} could not be saved, so try again.` : ''}${parsed.length - valid.length ? ` ${parsed.length - valid.length} rows had no email and were skipped.` : ''}`),
          h('button', { class: 'btn primary', type: 'button', onclick: async () => { m.close(); await refresh(); } }, 'View contacts'));
      }
    }
  }

  d.shell('contacts', h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Contacts'), count),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: importDialog }, '⬆ Import CSV'),
        h('button', { class: 'btn', type: 'button', onclick: () => exportCsv().catch((e) => toast((e as Error).message, 'error')) }, '⬇ Export'),
        h('button', { class: 'btn primary', type: 'button', onclick: addContact }, '＋ Add contact'))),
    h('div', { class: 'filters' }, search, tagSel, statusSel, subSel),
    body, pager));
  await refresh();
  if (openId) openContact(openId);
}
