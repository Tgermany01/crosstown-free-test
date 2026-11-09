// CSV reading and column matching for importing contacts (built for Wix's "Export contacts" file, works for most CSVs).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export const FIELDS = [
  { key: 'email', label: 'Email', required: true, names: ['email', 'email 1', 'e-mail', 'email address'] },
  { key: 'email2', label: 'Second email', names: ['email 2'] },
  { key: 'first_name', label: 'First name', names: ['first name', 'firstname', 'first'] },
  { key: 'last_name', label: 'Last name', names: ['last name', 'lastname', 'last', 'surname'] },
  { key: 'name', label: 'Full name (split into first and last)', names: ['name', 'full name'] },
  { key: 'phone', label: 'Phone', names: ['phone', 'phone 1', 'mobile', 'telephone'] },
  { key: 'phone2', label: 'Second phone', names: ['phone 2'] },
  { key: 'street', label: 'Street address', names: ['address 1 - street', 'street', 'address'] },
  { key: 'city', label: 'City', names: ['address 1 - city', 'city'] },
  { key: 'zip', label: 'ZIP', names: ['address 1 - zip', 'zip', 'postal code', 'postcode'] },
  { key: 'tags', label: 'Tags / labels', names: ['labels', 'tags', 'label'] },
  { key: 'created', label: 'Date added', names: ['created at (utc+0)', 'created at', 'created', 'date added'] },
  { key: 'email_status', label: 'Email subscription status', names: ['email subscriber status', 'subscription status', 'subscribed'] },
  { key: 'sms_status', label: 'SMS status', names: ['sms subscriber status'] },
  { key: 'last_activity', label: 'Last activity', names: ['last activity'] },
  { key: 'last_activity_date', label: 'Last activity date', names: ['last activity date (utc+0)', 'last activity date'] },
  { key: 'source', label: 'Source', names: ['source'] },
  { key: 'language', label: 'Language', names: ['language'] },
] as const;
export type FieldKey = (typeof FIELDS)[number]['key'];
export type Mapping = Record<FieldKey, number>;

export function autoMap(headers: string[]): Mapping {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const m = {} as Mapping;
  for (const f of FIELDS) m[f.key] = norm.findIndex((h) => (f.names as readonly string[]).includes(h));
  return m;
}

const toMs = (s: string): number => {
  const t = Date.parse(s.trim().replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s.trim()) ? '' : 'Z'));
  return Number.isFinite(t) ? t : 0;
};

export interface ImportRow {
  email: string; email2?: string; first_name?: string; last_name?: string; phone?: string; phone2?: string;
  street?: string; city?: string; zip?: string; tags: string[]; created_at?: number; email_status: 'subscribed' | 'never' | 'unsubscribed';
  sms_status?: string; last_activity?: string; last_activity_at?: number; source?: string; language?: string;
}

export function rowToContact(row: string[], map: Mapping, extraTags: string[] = []): ImportRow {
  const get = (k: FieldKey) => (map[k] >= 0 ? (row[map[k]] ?? '').trim() : '');
  let first = get('first_name'), last = get('last_name');
  if (!first && !last && get('name')) { const parts = get('name').split(/\s+/); first = parts.shift() ?? ''; last = parts.join(' '); }
  const status = get('email_status').toLowerCase();
  const created = get('created') ? toMs(get('created')) : 0;
  const activity = get('last_activity_date') ? toMs(get('last_activity_date')) : 0;
  return {
    email: get('email').toLowerCase(), email2: get('email2').toLowerCase() || undefined, first_name: first, last_name: last,
    phone: get('phone') || undefined, phone2: get('phone2') || undefined, street: get('street') || undefined, city: get('city') || undefined, zip: get('zip') || undefined,
    tags: [...get('tags').split(/[;,]/).map((t) => t.trim()).filter(Boolean), ...extraTags],
    created_at: created || undefined,
    email_status: /^subscribed$/.test(status) ? 'subscribed' : /unsub|opted out|cleaned/.test(status) ? 'unsubscribed' : 'never',
    sms_status: get('sms_status') || undefined, last_activity: get('last_activity') || undefined, last_activity_at: activity || created || undefined,
    source: get('source') || 'Imported', language: get('language') || undefined,
  };
}
