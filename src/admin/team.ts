// Team screen: who can sign in to /admin, who gets notified, and invitations.
import { api, clear, h, modal, toast } from './dom';

export interface Deps { shell(active: string, content: HTMLElement, wide?: boolean): void; me: { id: string; name: string; email: string } }
interface TeamUser { id: string; email: string; name: string; status: 'active' | 'invited' | 'disabled'; notify: number; last_login: number | null; created_at: number }

const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

function showLink(title: string, intro: string, link: string, result: { emailed?: boolean; emailError?: string }) {
  const box = h('input', { type: 'text', readOnly: true, value: link, onclick: () => box.select() });
  modal(title, h('div', { class: 'invite-done' },
    h('p', null, intro),
    h('p', { class: result.emailed ? 'ok-note' : 'muted' }, result.emailed ? '✓ We also emailed it to them.' : result.emailError ?? ''),
    box,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Link copied.'); } catch { box.select(); } } }, 'Copy link'),
      h('span', { class: 'muted' }, 'The link works once and expires in 7 days.'))));
}

export async function teamView(d: Deps) {
  const list = h('div', { class: 'stack-list' });
  const draw = async () => {
    const { users } = await api<{ users: TeamUser[] }>('users');
    list.replaceChildren(...users.map((u) => {
      const mine = u.id === d.me.id;
      const pill = h('span', { class: `pill ${u.status === 'active' ? 'live' : u.status === 'invited' ? 'draft' : 'off'}` }, u.status === 'active' ? 'Active' : u.status === 'invited' ? 'Invited' : 'Disabled');
      const notify = h('input', { type: 'checkbox', checked: Boolean(u.notify), disabled: u.status === 'disabled', title: 'Email this person when someone fills in a form', onchange: async () => {
        try { await api(`users/${u.id}`, 'PATCH', { notify: notify.checked }); toast(notify.checked ? 'They will be emailed about new form fills.' : 'They will no longer be emailed.'); } catch (e) { toast((e as Error).message, 'error'); notify.checked = !notify.checked; }
      } });
      const act = async (fn: () => Promise<void>) => { try { await fn(); await draw(); } catch (e) { toast((e as Error).message, 'error'); } };
      return h('div', { class: 'card row-card team-row' },
        h('div', { class: 'grow' }, h('h3', null, u.name || u.email, mine ? h('span', { class: 'muted' }, ' (you)') : null), h('p', { class: 'muted' }, `${u.email} · last signed in ${when(u.last_login)}`)),
        pill,
        h('label', { class: 'notify-tog' }, notify, h('span', null, 'Email me form fills')),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn small', type: 'button', onclick: () => act(async () => {
            const r = await api<any>(`users/${u.id}/reset`, 'POST', {});
            showLink('Password reset link', `Send this to ${u.name || u.email}. Opening it lets them choose a new password.`, r.link, r);
          }) }, u.status === 'invited' ? 'New invite link' : 'Reset password'),
          mine ? null : h('button', { class: 'btn small ghost', type: 'button', onclick: () => act(async () => { await api(`users/${u.id}`, 'PATCH', { status: u.status === 'disabled' ? 'active' : 'disabled' }); }) }, u.status === 'disabled' ? 'Enable' : 'Disable'),
          mine ? null : h('button', { class: 'btn small danger-btn', type: 'button', onclick: () => { if (confirm(`Remove ${u.email}? They will lose access immediately.`)) act(async () => { await api(`users/${u.id}`, 'DELETE'); }); } }, 'Remove')));
    }));
  };

  const name = h('input', { type: 'text', placeholder: 'Their name' });
  const email = h('input', { type: 'text', placeholder: 'their.email@example.com', autocomplete: 'off' });
  const send = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    send.disabled = true;
    try {
      const r = await api<any>('users/invite', 'POST', { email: email.value, name: name.value });
      showLink('Invitation ready', `Send this link to ${email.value.trim()}. It lets them set a password and sign in.`, r.link, r);
      name.value = ''; email.value = ''; await draw();
    } catch (e) { toast((e as Error).message, 'error'); } finally { send.disabled = false; }
  } }, 'Create invitation');

  d.shell('team', h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Team'), h('p', { class: 'muted' }, 'Everyone here can edit the site and see the contacts. People with the box ticked get an email whenever someone fills in a form.'))),
    h('div', { class: 'card' }, h('h3', null, 'Invite someone'),
      h('div', { class: 'invite-form' }, h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Name'), name), h('label', { class: 'fld' }, h('span', { class: 'fld-label' }, 'Email'), email), send),
      h('p', { class: 'help' }, 'You get a private link to send them. They choose their own password.')),
    list,
    h('div', { class: 'card note' }, h('strong', null, 'About the form-fill emails'),
      h('p', { class: 'muted' }, 'With Cloudflare’s free email, an address only receives emails after it has been verified in Cloudflare (Email Service → Email Routing → Destination addresses). Until then that person simply won’t get the email, but the contact is still saved here and everyone else is still notified.'))));
  clear(list); await draw();
}
