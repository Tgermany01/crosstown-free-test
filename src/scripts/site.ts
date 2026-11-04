// Small client-side behaviours for the public site. Everything is delegated from `document`
// so it keeps working when the admin preview re-renders the page.
let started = false;

// ------------------------------------------------------------------ parallax
// Photos sit in a layer taller than their frame and slide against the scroll, so the crop
// reveals different parts of the picture as you scroll. Uses transforms (works on iOS).
interface Item { el: HTMLElement; img: HTMLElement; speed: number; extra: number }
let items: Item[] = [];
let ticking = false;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function layout() {
  const vh = innerHeight;
  for (const it of items) {
    const h = it.el.clientHeight;
    it.extra = Math.round(((vh + h) / 2) * it.speed);
    it.img.style.height = `${h + it.extra * 2}px`;
    it.img.style.top = `${-it.extra}px`;
  }
}
function update() {
  ticking = false;
  const vh = innerHeight;
  for (const it of items) {
    const r = it.el.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) continue;
    const p = (r.top + r.height / 2 - vh / 2) / ((vh + r.height) / 2);
    it.img.style.transform = `translate3d(0, ${(-p * it.extra).toFixed(1)}px, 0)`;
  }
}
const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

export function refreshParallax() {
  items = [];
  if (!reduceMotion()) {
    for (const el of document.querySelectorAll<HTMLElement>('[data-parallax]')) {
      const img = el.querySelector<HTMLElement>('.px-img');
      if (img) items.push({ el, img, speed: parseFloat(el.dataset.parallax || '0.3') || 0.3, extra: 0 });
    }
  }
  layout();
  update();
}

// ------------------------------------------------------------------ everything else
function showSlide(carousel: HTMLElement, next: number) {
  const slides = [...carousel.querySelectorAll<HTMLElement>('.slide')];
  const dots = [...carousel.querySelectorAll<HTMLElement>('.dots button')];
  const i = (next + slides.length) % slides.length;
  slides.forEach((s, j) => (s.hidden = j !== i));
  dots.forEach((d, j) => (j === i ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
  carousel.dataset.current = String(i);
}

export function initSite() {
  if (started) { refreshParallax(); return; }
  started = true;

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;

    const toggle = t.closest<HTMLButtonElement>('.site-header .toggle');
    if (toggle) {
      const nav = document.getElementById('main-nav');
      const open = nav?.classList.toggle('open') ?? false;
      toggle.setAttribute('aria-expanded', String(open));
      return;
    }

    const carousel = t.closest<HTMLElement>('.carousel');
    if (carousel) {
      const cur = Number(carousel.dataset.current ?? 0);
      if (t.closest('.arrow.prev')) showSlide(carousel, cur - 1);
      else if (t.closest('.arrow.next')) showSlide(carousel, cur + 1);
      else { const dot = t.closest<HTMLElement>('.dots button'); if (dot) showSlide(carousel, Number(dot.dataset.i)); }
      return;
    }

    const thumb = t.closest<HTMLButtonElement>('.thumbs button');
    if (thumb) {
      const gallery = thumb.closest('.gallery')!;
      const main = gallery.querySelector<HTMLImageElement>('.g-main');
      if (main && thumb.dataset.src) { main.src = thumb.dataset.src; main.alt = thumb.dataset.alt ?? ''; }
      gallery.querySelectorAll('.thumbs button').forEach((b) => b.setAttribute('aria-pressed', String(b === thumb)));
      return;
    }

    const play = t.closest<HTMLButtonElement>('.play');
    if (play?.dataset.video) {
      const host = play.closest('.blk-video-banner');
      if (host && !host.querySelector('iframe')) {
        const frame = document.createElement('iframe');
        frame.src = `https://www.youtube-nocookie.com/embed/${play.dataset.video}?autoplay=1`;
        frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        frame.allowFullscreen = true;
        frame.title = 'Video';
        host.append(frame);
      }
      return;
    }

    const next = t.closest<HTMLElement>('[data-scroll-next]');
    if (next) {
      e.preventDefault();
      const sec = next.closest('section')?.nextElementSibling;
      sec?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
  });

  document.addEventListener('submit', async (e) => {
    const form = e.target as HTMLFormElement;
    if (!form.classList.contains('js-form')) return;
    e.preventDefault();
    const status = form.querySelector('.form-status');
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
    if (button) button.disabled = true;
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form) });
      if (!res.ok) throw new Error(await res.text());
      form.reset();
      if (status) status.textContent = form.dataset.success ?? 'Sent.';
    } catch {
      if (status) status.textContent = "Sorry, that didn't go through. Please email or call us instead.";
    } finally {
      if (button) button.disabled = false;
    }
  });

  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', () => { layout(); request(); });
  addEventListener('load', () => { layout(); update(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { layout(); request(); }).observe(document.body);
  refreshParallax();
}
