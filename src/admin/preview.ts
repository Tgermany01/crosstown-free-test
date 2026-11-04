// Runs inside the preview iframe on /admin/preview: renders whatever the editor sends, using the same
// section renderers as the public site.
import { renderSections } from '../lib/blocks';
import { renderFooter, renderHeader, renderNewsletterForm } from '../lib/chrome';
import { initSite, refreshParallax } from '../scripts/site';

const root = document.getElementById('root')!;
let selected = '';

function draw(msg: any) {
  const y = scrollY;
  root.innerHTML = `${renderHeader(msg.site, msg.path)}<main>${renderSections(msg.sections, { site: msg.site, posts: msg.posts })}</main>${renderFooter(msg.site, msg.path, renderNewsletterForm())}`;
  initSite();
  refreshParallax();
  mark();
  scrollTo(0, y);
}
function mark() {
  document.querySelectorAll('[data-sid].is-selected').forEach((e) => e.classList.remove('is-selected'));
  if (selected) document.querySelector(`[data-sid="${selected}"]`)?.classList.add('is-selected');
}

addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  if (e.data?.t === 'render') draw(e.data);
  if (e.data?.t === 'highlight') {
    selected = e.data.id; mark();
    document.querySelector(`[data-sid="${selected}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// Clicking a section in the preview selects it in the editor; links and forms stay inert.
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('.toggle, .arrow, .dots button, .thumbs button, .play')) return;
  const a = t.closest('a');
  if (a) e.preventDefault();
  const sec = t.closest<HTMLElement>('[data-sid]');
  if (sec) { selected = sec.dataset.sid!; mark(); parent.postMessage({ t: 'select', id: selected }, location.origin); }
}, true);
document.addEventListener('submit', (e) => e.preventDefault(), true);

parent.postMessage({ t: 'ready' }, location.origin);
