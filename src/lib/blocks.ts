// The section ("block") library. Each block type is described once here and used by:
//   - the public site (renderSections turns page JSON into HTML),
//   - the /admin editor (the `fields` drive the edit forms and the live preview),
//   - the site agent (the catalogue below is sent to the model, and its answer is
//     validated against the same fields, so it can only ever produce known blocks).
// Keep this file free of framework imports: it runs in Astro, the browser and Workers.
import { esc, safeUrl, md, uid } from './html';
import { icon, iconNames } from './icons';

// ---------------------------------------------------------------- types
export type FieldType = 'text' | 'textarea' | 'markdown' | 'image' | 'link' | 'select' | 'boolean' | 'icon' | 'list' | 'youtube';
export interface Option { value: string; label: string }
export interface Field {
  key: string; label: string; type: FieldType;
  help?: string; options?: Option[]; fields?: Field[]; itemLabel?: string; max?: number;
  default?: unknown;
}
export type Props = Record<string, any> & { id: string; type: string };
export interface PostLite { id: string; title: string; date: string; author: string; category: string; image: string; description: string; minutes: number }
export interface SiteLite {
  name: string; phone: string; phoneHref: string; textNumber: string; email: string;
  nav: { label: string; href: string }[];
  categories: { key: string; label: string; slug: string }[];
  [k: string]: any;
}
export interface Ctx { site: SiteLite; posts: PostLite[]; prevBg: string | null; turnstileKey?: string }
export interface BlockDef {
  type: string; label: string; description: string; icon: string;
  fields: Field[]; defaults: Record<string, unknown>;
  /** CSS colour of the section background, or null when it is an image. Used to draw wavy edges. */
  bg?: (p: Props) => string | null;
  render: (p: Props, ctx: Ctx) => string;
}

// ---------------------------------------------------------------- palette
export const PALETTE: Record<string, string> = {
  white: '#ffffff', ice: '#d4edf4', mist: '#c8d8e6', teal: '#045174', navy: '#001f3d',
};
const BG_OPTIONS: Option[] = [
  { value: 'white', label: 'White' }, { value: 'ice', label: 'Light blue' }, { value: 'mist', label: 'Soft grey-blue' },
  { value: 'teal', label: 'Teal' }, { value: 'navy', label: 'Navy' },
];

const FOCUS: Record<string, string> = { top: '50% 0%', upper: '50% 25%', center: '50% 50%', lower: '50% 75%', bottom: '50% 100%' };
const FOCUS_OPTIONS: Option[] = [
  { value: 'top', label: 'Top' }, { value: 'upper', label: 'Upper middle' }, { value: 'center', label: 'Middle' },
  { value: 'lower', label: 'Lower middle' }, { value: 'bottom', label: 'Bottom' },
];
const EDGE_OPTIONS: Option[] = [
  { value: 'flat', label: 'Straight' }, { value: 'wave', label: 'Wavy' }, { value: 'wave-flip', label: 'Wavy (other way)' },
];
const BUTTON_STYLES: Option[] = [
  { value: 'orange', label: 'Orange' }, { value: 'teal', label: 'Teal' }, { value: 'outline', label: 'Outline' },
];
const iconOptions: Option[] = iconNames
  .filter((n) => !['facebook', 'youtube', 'instagram', 'menu', 'close', 'plus', 'arrow-left', 'arrow-right', 'chevron-down', 'play', 'clock', 'phone', 'mail', 'mailbox'].includes(n))
  .map((n) => ({ value: n, label: n.replace(/-/g, ' ') }));

// ---------------------------------------------------------------- shared field sets
const buttonsField: Field = {
  key: 'buttons', label: 'Buttons', type: 'list', itemLabel: 'label', max: 4,
  fields: [
    { key: 'label', label: 'Button text', type: 'text' },
    { key: 'url', label: 'Link', type: 'link' },
    { key: 'style', label: 'Colour', type: 'select', options: BUTTON_STYLES, default: 'orange' },
  ],
};
const bgField = (def = 'white', label = 'Background colour'): Field => ({ key: 'bg', label, type: 'select', options: BG_OPTIONS, default: def });
const commonFields: Field[] = [
  { key: 'edge', label: 'Top edge', type: 'select', options: EDGE_OPTIONS, default: 'flat', help: 'A gentle wave where this section meets the one above it.' },
  { key: 'anchor', label: 'Link name (optional)', type: 'text', help: 'Lets you link to this section, e.g. /about#our-story. Letters and dashes only.' },
];

// ---------------------------------------------------------------- render helpers
const attr = (s: unknown) => esc(s);
const bgOf = (p: Props) => PALETTE[p.bg] ?? PALETTE.white!;

const WAVES: Record<string, string> = {
  wave: 'M0,30 C240,0 600,10 900,40 C1140,64 1320,40 1440,20 L1440,0 L0,0 Z',
  'wave-flip': 'M0,40 C320,80 720,0 1080,30 C1260,45 1380,40 1440,30 L1440,0 L0,0 Z',
};
function edgeSvg(edge: string, prevBg: string | null): string {
  if (!prevBg || !WAVES[edge]) return '';
  return `<svg class="edge" viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true"><path d="${WAVES[edge]}" fill="${prevBg}"/></svg>`;
}

/** Wraps a block's inner HTML in its <section>, adding the wavy top edge when asked for. */
function section(def: BlockDef, p: Props, ctx: Ctx, inner: string, cls = ''): string {
  const bg = def.bg?.(p) ?? null;
  const edge = edgeSvg(p.edge, ctx.prevBg);
  const anchor = String(p.anchor ?? '').replace(/[^a-z0-9_-]/gi, '');
  const bgClass = typeof p.bg === 'string' && PALETTE[p.bg] ? `bg-${p.bg}` : '';
  const classes = ['blk', `blk-${def.type}`, bgClass, edge ? 'has-edge' : '', cls].filter(Boolean).join(' ');
  void bg;
  return `<section class="${classes}"${anchor ? ` id="${attr(anchor)}"` : ''} data-sid="${attr(p.id)}">${edge}${inner}</section>`;
}

function parallaxImg(src: string, alt: string, opts: { parallax?: boolean; speed?: number; focus?: string; eager?: boolean } = {}): string {
  if (!src) return '';
  const focus = FOCUS[opts.focus ?? 'center'] ?? FOCUS.center;
  const img = `<img class="px-img" src="${attr(src)}" alt="${attr(alt)}" style="object-position:${focus}"${opts.eager ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
  return opts.parallax === false
    ? `<div class="px">${img}</div>`
    : `<div class="px" data-parallax="${opts.speed ?? 0.3}">${img}</div>`;
}

function buttons(list: any[], extraClass = ''): string {
  const items = (list ?? []).filter((b) => b?.label && safeUrl(b.url));
  if (!items.length) return '';
  return `<div class="btns ${extraClass}">${items
    .map((b) => `<a class="btn btn-${attr(b.style || 'orange')}" href="${attr(safeUrl(b.url))}">${esc(b.label)}</a>`)
    .join('')}</div>`;
}

function turnstile(ctx: Ctx): string {
  return ctx.turnstileKey ? `<div class="cf-turnstile" data-sitekey="${attr(ctx.turnstileKey)}"></div>` : '';
}

function signupForm(ctx: Ctx, o: { list: string; button: string; success: string; buttonClass: string; label?: string }): string {
  return `<form class="stack js-form" method="post" action="/api/subscribe" data-success="${attr(o.success)}">
    <input type="hidden" name="list" value="${attr(o.list)}">
    <label class="field">${esc(o.label ?? 'Email *')}<input name="email" type="email" autocomplete="email" placeholder="e.g., email@example.com" required></label>
    <label class="hp" aria-hidden="true">Leave blank <input name="website" tabindex="-1" autocomplete="off"></label>
    ${turnstile(ctx)}
    <button class="${attr(o.buttonClass)}" type="submit">${esc(o.button)}</button>
    <p class="form-status" role="status"></p>
  </form>`;
}

export function renderPostCard(post: PostLite, site: SiteLite, layout: 'stacked' | 'row' = 'stacked'): string {
  const cat = site.categories.find((c) => c.key === post.category);
  const date = new Date(post.date);
  const dateText = isNaN(+date) ? '' : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  return `<a class="post-card ${layout}" href="/post/${attr(post.id)}">
    <img class="cover" src="${attr(post.image)}" alt="" loading="lazy">
    <div class="pc-body">
      <p class="meta">${layout === 'row' ? '<span class="avatar" aria-hidden="true"></span>' : ''}<span>${esc(post.author)}<br>${esc(dateText)} · ${post.minutes} min read</span></p>
      ${layout === 'stacked' && cat ? `<p class="cat">${esc(cat.label)}</p>` : ''}
      <h3>${esc(post.title)}</h3>
      <p class="excerpt">${esc(post.description)}</p>
    </div></a>`;
}

export function renderBlogTabs(site: SiteLite, active: string): string {
  const tabs = [{ href: '/blog', label: 'All Posts', key: 'all' }, ...site.categories.map((c) => ({ href: `/blog/categories/${c.slug}`, label: c.label, key: c.key }))];
  return `<nav class="blog-tabs" aria-label="Blog categories">${tabs
    .map((t) => `<a href="${attr(t.href)}"${t.key === active ? ' aria-current="page"' : ''}>${esc(t.label)}</a>`)
    .join('')}</nav>`;
}

// ---------------------------------------------------------------- block definitions
const blocks: BlockDef[] = [];
const add = (b: BlockDef) => blocks.push(b);

add({
  type: 'hero', label: 'Hero banner', icon: 'star',
  description: 'Big opening banner with a background photo, optional logo, headline, text and buttons. Best at the very top of a page.',
  fields: [
    { key: 'image', label: 'Background photo', type: 'image' },
    { key: 'focus', label: 'Photo focus', type: 'select', options: FOCUS_OPTIONS, default: 'center' },
    { key: 'overlay', label: 'Photo tint', type: 'select', default: 'light', options: [{ value: 'light', label: 'Light (dark text)' }, { value: 'dark', label: 'Dark (white text)' }, { value: 'none', label: 'None' }] },
    { key: 'logo', label: 'Show the Crosstown logo', type: 'boolean', default: false },
    { key: 'eyebrow', label: 'Small line above', type: 'text' },
    { key: 'heading', label: 'Headline', type: 'text' },
    { key: 'text', label: 'Text', type: 'markdown' },
    buttonsField,
    { key: 'height', label: 'Height', type: 'select', default: 'tall', options: [{ value: 'tall', label: 'Tall' }, { value: 'medium', label: 'Medium' }, { value: 'short', label: 'Short' }] },
    { key: 'parallax', label: 'Parallax scroll', type: 'boolean', default: true },
    ...commonFields,
  ],
  defaults: { image: '/images/hero.jpg', focus: 'center', overlay: 'light', logo: false, eyebrow: '', heading: 'Welcome', text: 'Come as you are.', buttons: [], height: 'medium', parallax: true, edge: 'flat', anchor: '' },
  bg: () => null,
  render(p, ctx) {
    const def = blocksByType.hero!;
    const logo = p.logo ? `<img class="hero-logo" src="/images/logo-${p.overlay === 'dark' ? 'white' : 'navy'}.png" alt="" width="455" height="340">` : '';
    const eyebrow = p.eyebrow ? `<p class="hero-eyebrow">${esc(p.eyebrow)}</p>` : '';
    const heading = p.heading ? `<h1 class="${p.logo ? 'visually-hidden' : 'hero-heading'}">${esc(p.heading)}</h1>` : '';
    const inner = `${parallaxImg(p.image, '', { parallax: p.parallax, speed: 0.2, focus: p.focus, eager: true })}
      <div class="hero-inner">
        ${p.logo ? `<div class="hero-logo-wrap">${logo}${eyebrow}</div>${heading}` : `${eyebrow}${heading}`}
        ${p.text ? `<div class="hero-text">${md(p.text, { inline: true })}</div>` : ''}
        ${buttons(p.buttons)}
      </div>`;
    return section(def, p, ctx, inner, `ov-${p.overlay} h-${p.height}${p.image ? '' : ' no-img'}`);
  },
});

add({
  type: 'split-intro', label: 'Page intro (photo + title)', icon: 'book',
  description: 'Half photo, half title and short paragraph. A good start for About-style pages.',
  fields: [
    { key: 'image', label: 'Photo', type: 'image' },
    { key: 'alt', label: 'Photo description (for screen readers)', type: 'text' },
    { key: 'focus', label: 'Photo focus', type: 'select', options: FOCUS_OPTIONS, default: 'center' },
    { key: 'imageSide', label: 'Photo side', type: 'select', default: 'left', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
    { key: 'heading', label: 'Title', type: 'text' },
    { key: 'text', label: 'Text', type: 'markdown' },
    { key: 'arrow', label: 'Show a "scroll down" arrow', type: 'boolean', default: false },
    { key: 'height', label: 'Height', type: 'select', default: 'tall', options: [{ value: 'tall', label: 'Tall' }, { value: 'medium', label: 'Medium' }] },
    { key: 'parallax', label: 'Parallax scroll', type: 'boolean', default: true },
    ...commonFields,
  ],
  defaults: { image: '', alt: '', focus: 'center', imageSide: 'left', heading: 'Page title', text: 'A short introduction to this page.', arrow: false, height: 'tall', parallax: true, edge: 'flat', anchor: '' },
  bg: () => PALETTE.white!,
  render(p, ctx) {
    const def = blocksByType['split-intro']!;
    const inner = `<div class="split-media">${parallaxImg(p.image, p.alt, { parallax: p.parallax, speed: 0.16, focus: p.focus, eager: true })}</div>
      <div class="split-text">
        <h1>${esc(p.heading)}</h1>
        ${p.text ? `<div class="split-copy">${md(p.text)}</div>` : ''}
        ${p.arrow ? `<a class="scroll-down" href="#next" data-scroll-next aria-label="Keep reading">${icon('chevron-down', 26)}</a>` : ''}
      </div>`;
    return section(def, p, ctx, inner, `side-${p.imageSide} h-${p.height}${p.arrow ? '' : ' no-arrow'}`);
  },
});

add({
  type: 'resources', label: 'Quick links (icon tiles)', icon: 'pin',
  description: 'A heading with a grid of light-blue icon tiles that link to other pages or sections.',
  fields: [
    { key: 'heading', label: 'Heading', type: 'text' },
    {
      key: 'cards', label: 'Tiles', type: 'list', itemLabel: 'title', max: 12,
      fields: [
        { key: 'icon', label: 'Icon', type: 'icon', default: 'star' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Short text', type: 'textarea' },
        { key: 'link', label: 'Link', type: 'link' },
      ],
    },
    ...commonFields,
  ],
  defaults: { heading: 'Resources', cards: [{ icon: 'heart', title: 'Title', text: 'A short description.', link: '/' }], edge: 'flat', anchor: '' },
  bg: () => PALETTE.white!,
  render(p, ctx) {
    const def = blocksByType.resources!;
    const cards = (p.cards as any[]).map((c) => `<a class="res-card" href="${attr(safeUrl(c.link) || '#')}">${icon(c.icon, 52, 'res-icon')}<h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></a>`).join('');
    return section(def, p, ctx, `<div class="res-grid">${p.heading ? `<h2 class="dot-heading">${esc(p.heading)}</h2>` : '<span></span>'}<div class="res-cards">${cards}</div></div>`);
  },
});

add({
  type: 'photo-band', label: 'Photo strip (parallax)', icon: 'camera',
  description: 'A wide, shallow strip of photo tinted blue. The photo slides gently as you scroll. Use between sections.',
  fields: [
    { key: 'image', label: 'Photo', type: 'image' },
    { key: 'fit', label: 'Shape', type: 'select', default: 'strip', options: [{ value: 'strip', label: 'Wide strip (photo is cropped, slides on scroll)' }, { value: 'full', label: 'Whole photo (nothing is cropped)' }] },
    { key: 'focus', label: 'Photo focus (strip only)', type: 'select', options: FOCUS_OPTIONS, default: 'center' },
    { key: 'tint', label: 'Tint', type: 'select', default: 'teal', options: [{ value: 'teal', label: 'Teal' }, { value: 'navy', label: 'Navy' }, { value: 'none', label: 'None' }] },
    { key: 'height', label: 'Height (strip only)', type: 'select', default: 'short', options: [{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'tall', label: 'Tall' }] },
    { key: 'parallax', label: 'Parallax scroll (strip only)', type: 'boolean', default: true },
    ...commonFields,
  ],
  defaults: { image: '', fit: 'strip', focus: 'center', tint: 'teal', height: 'short', parallax: true, edge: 'wave', anchor: '' },
  bg: () => null,
  render(p, ctx) {
    const def = blocksByType['photo-band']!;
    if (p.fit === 'full' && p.image) {
      // The whole photo at its natural proportions: nothing is cropped, so there is nothing to slide.
      return section(def, p, ctx, `<img class="band-full" src="${attr(p.image)}" alt="" loading="lazy">`, `tint-${p.tint} fit-full`);
    }
    return section(def, p, ctx, parallaxImg(p.image, '', { parallax: p.parallax, speed: 0.3, focus: p.focus }), `tint-${p.tint} h-${p.height}`);
  },
});

add({
  type: 'quote', label: 'Big quote', icon: 'chat',
  description: 'A large centred quote or statement in the italic heading font.',
  fields: [
    { key: 'text', label: 'Quote', type: 'markdown' },
    { key: 'attribution', label: 'Who said it (optional)', type: 'text' },
    bgField('teal'),
    ...commonFields,
  ],
  defaults: { text: '"A quote or short statement."', attribution: '', bg: 'teal', edge: 'flat', anchor: '' },
  bg: bgOf,
  render(p, ctx) {
    const def = blocksByType.quote!;
    return section(def, p, ctx, `<div class="narrow-720"><div class="quote-text">${md(p.text, { inline: true })}</div>${p.attribution ? `<p class="quote-by">${esc(p.attribution)}</p>` : ''}</div>`);
  },
});

function textInner(p: Props, aside = ''): string {
  const badge = p.headingStyle === 'badge-up' || p.headingStyle === 'badge-down';
  const align = p.align === 'center' ? 'center' : 'left';
  const body = `${p.heading ? `<h2${p.headingStyle === 'dot' ? ' class="dot-heading"' : ''}>${esc(p.heading)}</h2>` : ''}
    <div class="rich${p.headingStyle === 'dot' ? ' indent' : ''}${p.bodyColor === 'teal' ? ' tone-teal' : ''}">${md(p.body)}</div>${buttons(p.buttons)}`;
  const content = badge
    ? `<div class="badge-row"><span class="badge"><span class="tri ${p.headingStyle === 'badge-up' ? 'up' : 'down'}"></span></span><div>${body}</div></div>`
    : body;
  const width = p.width === 'wide' ? 'w-wide' : 'w-narrow';
  if (aside) return `<div class="text-grid ${width}"><div class="a-${align}">${content}</div><div class="text-aside">${aside}</div></div>`;
  return `<div class="text-col ${width} a-${align}">${content}</div>`;
}
const textFields: Field[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'headingStyle', label: 'Heading style', type: 'select', default: 'dot', options: [{ value: 'dot', label: 'Round bullet' }, { value: 'plain', label: 'Plain' }, { value: 'badge-up', label: 'Badge with ▲' }, { value: 'badge-down', label: 'Badge with ▼' }] },
  { key: 'body', label: 'Text', type: 'markdown', help: 'Leave a blank line between paragraphs. Use ### for a smaller heading.' },
  buttonsField,
  { key: 'align', label: 'Alignment', type: 'select', default: 'left', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centred' }] },
  { key: 'width', label: 'Width', type: 'select', default: 'narrow', options: [{ value: 'narrow', label: 'Narrow' }, { value: 'wide', label: 'Wide' }] },
  { key: 'bodyColor', label: 'Text colour', type: 'select', default: 'auto', options: [{ value: 'auto', label: 'Automatic' }, { value: 'teal', label: 'Teal' }] },
  { key: 'space', label: 'Spacing above and below', type: 'select', default: 'normal', options: [{ value: 'compact', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'roomy', label: 'Roomy' }] },
];
const textDefaults = { heading: 'Heading', headingStyle: 'dot', body: 'Write something here.', buttons: [], align: 'left', width: 'narrow', bodyColor: 'auto', space: 'normal', bg: 'white', edge: 'flat', anchor: '' };

add({
  type: 'text', label: 'Text section', icon: 'bible',
  description: 'A heading and paragraphs on a coloured background. The workhorse for most content. Optional buttons.',
  fields: [...textFields, bgField('white'), ...commonFields],
  defaults: textDefaults, bg: bgOf,
  render(p, ctx) { return section(blocksByType.text!, p, ctx, textInner(p), `sp-${p.space}`); },
});

add({
  type: 'text-signup', label: 'Text + sign-up form', icon: 'mail',
  description: 'Text on the left and a small sign-up card (email only) on the right, e.g. to join a team or a group text.',
  fields: [
    ...textFields,
    { key: 'asideIcon', label: 'Card icon', type: 'icon', default: 'fingerprint' },
    { key: 'list', label: 'Sign-up list name', type: 'text', default: 'newsletter', help: 'Shown in the email you receive, e.g. "csi" or "newsletter".' },
    { key: 'asideButton', label: 'Card button text', type: 'text', default: 'Join' },
    { key: 'asideSuccess', label: 'Thank-you message', type: 'text', default: 'Thanks! We will be in touch.' },
    bgField('white'), ...commonFields,
  ],
  defaults: { ...textDefaults, asideIcon: 'fingerprint', list: 'newsletter', asideButton: 'Join', asideSuccess: 'Thanks! We will be in touch.' },
  bg: bgOf,
  render(p, ctx) {
    const aside = `<div class="join-card">${icon(p.asideIcon, 64, 'join-icon')}${signupForm(ctx, { list: p.list, button: p.asideButton, success: p.asideSuccess, buttonClass: 'btn btn-teal' })}</div>`;
    return section(blocksByType['text-signup']!, p, ctx, textInner(p, aside), `sp-${p.space}`);
  },
});

add({
  type: 'text-gallery', label: 'Text + photo gallery', icon: 'camera',
  description: 'Text on the left with a main photo and clickable thumbnails on the right.',
  fields: [
    ...textFields,
    { key: 'images', label: 'Photos', type: 'list', itemLabel: 'alt', max: 12, fields: [{ key: 'image', label: 'Photo', type: 'image' }, { key: 'alt', label: 'Photo description', type: 'text' }] },
    bgField('navy'), ...commonFields,
  ],
  defaults: { ...textDefaults, bg: 'navy', images: [] },
  bg: bgOf,
  render(p, ctx) {
    const imgs = (p.images as any[]).filter((i) => i.image);
    const aside = imgs.length
      ? `<div class="gallery"><img class="g-main" src="${attr(imgs[0].image)}" alt="${attr(imgs[0].alt)}" loading="lazy"><div class="thumbs">${imgs
          .map((i, n) => `<button type="button" aria-label="Show photo ${n + 1}" aria-pressed="${n === 0}" data-src="${attr(i.image)}" data-alt="${attr(i.alt)}"><img src="${attr(i.image)}" alt="" loading="lazy"></button>`)
          .join('')}</div></div>`
      : '';
    return section(blocksByType['text-gallery']!, p, ctx, textInner(p, aside), `sp-${p.space}`);
  },
});

add({
  type: 'image-text', label: 'Photo + text', icon: 'users',
  description: 'A photo beside a heading, paragraph and button. Great for introducing a person or ministry.',
  fields: [
    { key: 'image', label: 'Photo', type: 'image' },
    { key: 'alt', label: 'Photo description (for screen readers)', type: 'text' },
    { key: 'imageSide', label: 'Photo side', type: 'select', default: 'left', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
    { key: 'heading', label: 'Heading', type: 'text' },
    { key: 'body', label: 'Text', type: 'markdown' },
    buttonsField,
    bgField('navy'), ...commonFields,
  ],
  defaults: { image: '', alt: '', imageSide: 'left', heading: 'Heading', body: 'Write something here.', buttons: [], bg: 'navy', edge: 'flat', anchor: '' },
  bg: bgOf,
  render(p, ctx) {
    const img = p.image ? `<img class="it-img" src="${attr(p.image)}" alt="${attr(p.alt)}" loading="lazy">` : '';
    return section(blocksByType['image-text']!, p, ctx, `<div class="it-grid side-${p.imageSide}">${img}<div class="it-copy"><h2>${esc(p.heading)}</h2><div class="rich">${md(p.body)}</div>${buttons(p.buttons)}</div></div>`);
  },
});

add({
  type: 'video-banner', label: 'Video banner (parallax)', icon: 'play',
  description: 'A full-width photo with a title and a "Play Video" button that plays a YouTube video right on the page.',
  fields: [
    { key: 'kicker', label: 'Small line above', type: 'text', default: 'Crosstown Stockton' },
    { key: 'heading', label: 'Title', type: 'text' },
    { key: 'youtubeId', label: 'YouTube video', type: 'youtube', help: 'Paste the video link or the part after v= in the address.' },
    { key: 'image', label: 'Background photo (optional)', type: 'image', help: 'Leave empty to use the YouTube thumbnail.' },
    { key: 'moreLabel', label: 'Second button text', type: 'text', default: 'All Videos' },
    { key: 'moreUrl', label: 'Second button link', type: 'link' },
    { key: 'parallax', label: 'Parallax scroll', type: 'boolean', default: true },
    ...commonFields,
  ],
  defaults: { kicker: 'Crosstown Stockton', heading: "This Week's Sermon", youtubeId: '', image: '', moreLabel: 'All Videos', moreUrl: '', parallax: true, edge: 'flat', anchor: '' },
  bg: () => null,
  render(p, ctx) {
    const src = p.image || (p.youtubeId ? `https://i.ytimg.com/vi/${attr(p.youtubeId)}/maxresdefault.jpg` : '');
    const more = p.moreLabel && safeUrl(p.moreUrl) ? `<a class="btn btn-outline all-videos" href="${attr(safeUrl(p.moreUrl))}">${esc(p.moreLabel)} ${icon('plus', 16)}</a>` : '';
    const inner = `${parallaxImg(src, '', { parallax: p.parallax, speed: 0.25 })}
      <div class="vb-inner">
        ${p.kicker ? `<p class="vb-kicker">${esc(p.kicker)}</p>` : ''}
        <h2 class="vb-title">${esc(p.heading)}</h2>
        ${p.youtubeId ? `<button class="play" type="button" data-video="${attr(p.youtubeId)}">${icon('play', 38)}<span>Play Video</span></button>` : ''}
        ${more}
      </div>`;
    return section(blocksByType['video-banner']!, p, ctx, inner);
  },
});

add({
  type: 'people', label: 'People / team cards', icon: 'users',
  description: 'A heading and a two-column grid of teal cards with a name, role, short bio and photo.',
  fields: [
    { key: 'heading', label: 'Heading', type: 'text' },
    { key: 'intro', label: 'Intro text', type: 'markdown' },
    {
      key: 'people', label: 'People', type: 'list', itemLabel: 'name', max: 30,
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'role', label: 'Role', type: 'text' },
        { key: 'bio', label: 'Short bio', type: 'textarea' },
        { key: 'photo', label: 'Photo', type: 'image' },
      ],
    },
    ...commonFields,
  ],
  defaults: { heading: 'Our team', intro: '', people: [{ name: 'Name', role: 'Role', bio: 'A sentence or two.', photo: '' }], edge: 'flat', anchor: '' },
  bg: () => PALETTE.white!,
  render(p, ctx) {
    const cards = (p.people as any[]).map((l) => `<article class="person"><div class="person-text"><p class="role">${esc(l.role)}</p><h3>${esc(l.name)}</h3><p class="blurb">${esc(l.bio)}</p></div>${l.photo ? `<img class="cover" src="${attr(l.photo)}" alt="${attr(l.name)}" loading="lazy">` : '<div class="cover"></div>'}</article>`).join('');
    const head = `<div class="text-col w-narrow">${p.heading ? `<h2 class="dot-heading">${esc(p.heading)}</h2>` : ''}${p.intro ? `<div class="rich indent">${md(p.intro)}</div>` : ''}</div>`;
    return section(blocksByType.people!, p, ctx, `${head}<div class="people-grid">${cards}</div>`);
  },
});

add({
  type: 'partners', label: 'Slideshow of partners', icon: 'dove',
  description: 'A one-at-a-time slideshow with an icon, name, paragraph and optional website button for each partner.',
  fields: [
    {
      key: 'slides', label: 'Slides', type: 'list', itemLabel: 'name', max: 20,
      fields: [
        { key: 'icon', label: 'Icon', type: 'icon', default: 'heart' },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'text', label: 'Text', type: 'textarea' },
        { key: 'url', label: 'Website link (optional)', type: 'link', help: 'The button is hidden until you add a link.' },
        { key: 'buttonLabel', label: 'Button text', type: 'text', default: 'Visit their website' },
      ],
    },
    ...commonFields,
  ],
  defaults: { slides: [{ icon: 'heart', name: 'Partner name', text: 'A short description of this partner.', url: '', buttonLabel: 'Visit their website' }], edge: 'flat', anchor: '' },
  bg: () => PALETTE.white!,
  render(p, ctx) {
    const slides = p.slides as any[];
    const body = slides.map((s, i) => `<article class="slide" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}"${i ? ' hidden' : ''}><span class="partner-icon">${icon(s.icon, 72)}</span><h2>${esc(s.name)}</h2><p>${esc(s.text)}</p>${safeUrl(s.url) ? `<a class="btn btn-orange" href="${attr(safeUrl(s.url))}">${esc(s.buttonLabel || 'Visit their website')}</a>` : ''}</article>`).join('');
    const dots = slides.map((s, i) => `<button type="button" aria-label="Show ${attr(s.name)}" data-i="${i}"${i ? '' : ' aria-current="true"'}></button>`).join('');
    const multi = slides.length > 1;
    return section(blocksByType.partners!, p, ctx, `<div class="carousel" aria-roledescription="carousel" aria-label="Slideshow">
      ${multi ? `<button class="arrow prev" type="button" aria-label="Previous">${icon('arrow-left', 80)}</button>` : '<span></span>'}
      <div class="slides">${body}</div>
      ${multi ? `<button class="arrow next" type="button" aria-label="Next">${icon('arrow-right', 80)}</button>` : '<span></span>'}
      ${multi ? `<div class="dots">${dots}</div>` : ''}</div>`);
  },
});

add({
  type: 'collage-hero', label: 'Title + photo collage', icon: 'camera',
  description: 'A navy banner with a title and short quote on the left and two overlapping photos on the right.',
  fields: [
    { key: 'heading', label: 'Title', type: 'text' },
    { key: 'text', label: 'Text or quote', type: 'markdown' },
    { key: 'imageSmall', label: 'Small photo (top right)', type: 'image' },
    { key: 'altSmall', label: 'Small photo description', type: 'text' },
    { key: 'imageBig', label: 'Large photo (bottom left)', type: 'image' },
    { key: 'altBig', label: 'Large photo description', type: 'text' },
    ...commonFields,
  ],
  defaults: { heading: 'Title', text: '', imageSmall: '', altSmall: '', imageBig: '', altBig: '', edge: 'flat', anchor: '' },
  bg: () => PALETTE.navy!,
  render(p, ctx) {
    const a = p.imageSmall ? `<img class="small" src="${attr(p.imageSmall)}" alt="${attr(p.altSmall)}" loading="lazy">` : '';
    const b = p.imageBig ? `<img class="big" src="${attr(p.imageBig)}" alt="${attr(p.altBig)}" loading="lazy">` : '';
    return section(blocksByType['collage-hero']!, p, ctx, `<div class="ch-grid"><div class="ch-text"><h1>${esc(p.heading)}</h1><div>${md(p.text, { inline: true })}</div></div><div class="collage">${a}${b}</div></div>`, 'bg-navy');
  },
});

add({
  type: 'post-feed', label: 'Blog posts', icon: 'bible',
  description: 'Shows the latest blog posts, either all of them or one category. Posts are written under Posts in the admin.',
  fields: [
    { key: 'heading', label: 'Heading', type: 'text' },
    { key: 'category', label: 'Which posts', type: 'text', default: 'all', help: 'Type "all" or a category key such as csi or feeding-hands.' },
    { key: 'layout', label: 'Layout', type: 'select', default: 'cards', options: [{ value: 'cards', label: 'Small cards' }, { value: 'rows', label: 'Large rows' }] },
    { key: 'tabs', label: 'Show category tabs', type: 'boolean', default: false },
    { key: 'limit', label: 'How many (0 = all)', type: 'text', default: '0' },
    bgField('white'), ...commonFields,
  ],
  defaults: { heading: 'Latest posts', category: 'all', layout: 'cards', tabs: false, limit: '0', bg: 'white', edge: 'flat', anchor: '' },
  bg: bgOf,
  render(p, ctx) {
    const limit = parseInt(String(p.limit), 10) || 0;
    let posts = ctx.posts.filter((x) => p.category === 'all' || x.category === p.category).sort((a, b) => +new Date(b.date) - +new Date(a.date) || b.id.localeCompare(a.id));
    if (limit > 0) posts = posts.slice(0, limit);
    const layout = p.layout === 'rows' ? 'row' : 'stacked';
    const tabs = p.tabs ? renderBlogTabs(ctx.site, p.category) : '';
    const head = p.heading ? `<h2 class="${p.layout === 'rows' ? 'visually-hidden' : 'feed-heading'}">${esc(p.heading)}</h2>` : '';
    return section(blocksByType['post-feed']!, p, ctx, `<div class="feed feed-${p.layout === 'rows' ? 'rows' : 'cards'}">${head}${tabs}<div class="post-list">${posts.map((x) => renderPostCard(x, ctx.site, layout)).join('') || '<p>No posts yet.</p>'}</div></div>`);
  },
});

add({
  type: 'cards', label: 'Cards (photo or icon)', icon: 'gift',
  description: 'A row or grid of cards, each with a photo or icon, title, text and optional link. Good for ministries, events or programs.',
  fields: [
    { key: 'heading', label: 'Heading', type: 'text' },
    { key: 'intro', label: 'Intro text', type: 'markdown' },
    {
      key: 'cards', label: 'Cards', type: 'list', itemLabel: 'title', max: 12,
      fields: [
        { key: 'image', label: 'Photo (optional)', type: 'image' },
        { key: 'icon', label: 'Icon (used when there is no photo)', type: 'icon', default: 'heart' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'text', label: 'Text', type: 'textarea' },
        { key: 'linkLabel', label: 'Link text', type: 'text' },
        { key: 'link', label: 'Link', type: 'link' },
      ],
    },
    { key: 'columns', label: 'Cards per row', type: 'select', default: '3', options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }] },
    bgField('white'), ...commonFields,
  ],
  defaults: { heading: 'Heading', intro: '', cards: [{ image: '', icon: 'heart', title: 'Card title', text: 'A short description.', linkLabel: '', link: '' }], columns: '3', bg: 'white', edge: 'flat', anchor: '' },
  bg: bgOf,
  render(p, ctx) {
    const cards = (p.cards as any[]).map((c) => {
      const top = c.image ? `<img class="cd-img" src="${attr(c.image)}" alt="" loading="lazy">` : `<span class="cd-icon">${icon(c.icon, 44)}</span>`;
      const link = safeUrl(c.link) && c.linkLabel ? `<a class="cd-link" href="${attr(safeUrl(c.link))}">${esc(c.linkLabel)} →</a>` : '';
      return `<article class="cd">${top}<div class="cd-body"><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p>${link}</div></article>`;
    }).join('');
    return section(blocksByType.cards!, p, ctx, `<div class="text-col w-wide">${p.heading ? `<h2 class="dot-heading">${esc(p.heading)}</h2>` : ''}${p.intro ? `<div class="rich indent">${md(p.intro)}</div>` : ''}</div><div class="cd-grid cols-${p.columns}">${cards}</div>`);
  },
});

add({
  type: 'cta', label: 'Call to action', icon: 'heart',
  description: 'A short, centred banner with a heading, a line of text and buttons. For invitations, giving or sign-ups.',
  fields: [
    { key: 'heading', label: 'Heading', type: 'text' },
    { key: 'text', label: 'Text', type: 'markdown' },
    buttonsField, bgField('teal'), ...commonFields,
  ],
  defaults: { heading: 'Join us this Sunday', text: 'Sundays at 11 a.m. at 924 North Filbert Street, Stockton.', buttons: [], bg: 'teal', edge: 'flat', anchor: '' },
  bg: bgOf,
  render(p, ctx) {
    return section(blocksByType.cta!, p, ctx, `<div class="narrow-720"><h2>${esc(p.heading)}</h2><div class="rich">${md(p.text)}</div>${buttons(p.buttons)}</div>`);
  },
});

add({
  type: 'contact-form', label: 'Contact form', icon: 'mail',
  description: 'The "Get in touch" form. Messages are emailed to the church.',
  fields: [
    { key: 'heading', label: 'Heading', type: 'text', default: 'Get in touch' },
    { key: 'subject', label: 'Email subject label', type: 'text', default: 'Website contact form' },
    bgField('ice'), ...commonFields,
  ],
  defaults: { heading: 'Get in touch', subject: 'Website contact form', bg: 'ice', edge: 'flat', anchor: 'contact' },
  bg: bgOf,
  render(p, ctx) {
    return section(blocksByType['contact-form']!, p, ctx, `<div class="contact-wrap"><h2>${esc(p.heading)}</h2>
      <form class="stack js-form" method="post" action="/api/contact" data-success="Thanks! Your message was sent. We'll be in touch soon.">
        <input type="hidden" name="subject" value="${attr(p.subject)}">
        <div class="cf-grid">
          <label class="field">First Name <input name="firstName" autocomplete="given-name" required></label>
          <label class="field">Last Name <input name="lastName" autocomplete="family-name"></label>
          <label class="field">Email * <input name="email" type="email" autocomplete="email" required></label>
          <label class="field message">Message <textarea name="message" rows="5" required></textarea></label>
          <label class="field">Phone <input name="phone" type="tel" autocomplete="tel"></label>
        </div>
        <label class="hp" aria-hidden="true">Leave blank <input name="website" tabindex="-1" autocomplete="off"></label>
        ${turnstile(ctx)}
        <button class="btn btn-teal submit" type="submit">Submit</button>
        <p class="form-status" role="status"></p>
      </form></div>`);
  },
});

add({
  type: 'video', label: 'YouTube video', icon: 'play',
  description: 'A heading and a YouTube video player.',
  fields: [
    { key: 'heading', label: 'Heading', type: 'text' },
    { key: 'youtubeId', label: 'YouTube video', type: 'youtube' },
    { key: 'caption', label: 'Caption (optional)', type: 'text' },
    bgField('white'), ...commonFields,
  ],
  defaults: { heading: '', youtubeId: '', caption: '', bg: 'white', edge: 'flat', anchor: '' },
  bg: bgOf,
  render(p, ctx) {
    const frame = p.youtubeId ? `<div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/${attr(p.youtubeId)}" title="${attr(p.heading || 'Video')}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>` : '<p>Add a YouTube link to show the video.</p>';
    return section(blocksByType.video!, p, ctx, `<div class="text-col w-narrow">${p.heading ? `<h2 class="dot-heading">${esc(p.heading)}</h2>` : ''}${frame}${p.caption ? `<p class="caption">${esc(p.caption)}</p>` : ''}</div>`);
  },
});

add({
  type: 'map', label: 'Map & directions', icon: 'map',
  description: 'A Google map for an address, with the address written beside it.',
  fields: [
    { key: 'heading', label: 'Heading', type: 'text', default: 'Find us' },
    { key: 'address', label: 'Address', type: 'text', default: '924 North Filbert Street, Stockton, CA 95205' },
    { key: 'text', label: 'Directions or notes', type: 'markdown' },
    bgField('white'), ...commonFields,
  ],
  defaults: { heading: 'Find us', address: '924 North Filbert Street, Stockton, CA 95205', text: '', bg: 'white', edge: 'flat', anchor: '' },
  bg: bgOf,
  render(p, ctx) {
    const q = encodeURIComponent(p.address);
    return section(blocksByType.map!, p, ctx, `<div class="text-grid w-wide"><div>${p.heading ? `<h2 class="dot-heading">${esc(p.heading)}</h2>` : ''}<p class="addr">${esc(p.address)}</p><div class="rich">${md(p.text)}</div></div><div class="embed map"><iframe src="https://www.google.com/maps?q=${q}&output=embed" title="Map" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>`);
  },
});

add({
  type: 'accordion', label: 'Questions & answers', icon: 'chat',
  description: 'A list of questions that open to show their answers.',
  fields: [
    { key: 'heading', label: 'Heading', type: 'text', default: 'Common questions' },
    { key: 'items', label: 'Questions', type: 'list', itemLabel: 'question', max: 30, fields: [{ key: 'question', label: 'Question', type: 'text' }, { key: 'answer', label: 'Answer', type: 'markdown' }] },
    bgField('white'), ...commonFields,
  ],
  defaults: { heading: 'Common questions', items: [{ question: 'A question?', answer: 'The answer.' }], bg: 'white', edge: 'flat', anchor: '' },
  bg: bgOf,
  render(p, ctx) {
    const items = (p.items as any[]).map((i) => `<details><summary>${esc(i.question)}</summary><div class="rich">${md(i.answer)}</div></details>`).join('');
    return section(blocksByType.accordion!, p, ctx, `<div class="text-col w-narrow">${p.heading ? `<h2 class="dot-heading">${esc(p.heading)}</h2>` : ''}<div class="faq">${items}</div></div>`);
  },
});

// ---------------------------------------------------------------- registry + normalising
export const blockDefs = blocks;
export const blocksByType: Record<string, BlockDef> = Object.fromEntries(blocks.map((b) => [b.type, b]));
export const blockTypes = blocks.map((b) => b.type);

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);

export function parseYouTube(v: unknown): string {
  const s = String(v ?? '').trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) ?? s.match(/^([\w-]{11})$/);
  return m ? m[1]! : '';
}

function coerce(f: Field, v: unknown, strictImages?: Set<string>): unknown {
  switch (f.type) {
    case 'text': return clip(v ?? f.default ?? '', f.max ?? 400);
    case 'textarea': return clip(v ?? f.default ?? '', 3000);
    case 'markdown': return clip(v ?? f.default ?? '', 30000);
    case 'boolean': return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : Boolean(f.default);
    case 'youtube': return parseYouTube(v);
    case 'link': { const s = String(v ?? '').trim(); return s.startsWith('/') || s.startsWith('#') ? clip(s, 500) : safeUrl(s); }
    case 'image': {
      const s = String(v ?? '').trim();
      if (!s) return '';
      if (strictImages) return strictImages.has(s) ? s : '';
      return s.startsWith('/images/') || /^https:\/\//i.test(s) ? clip(s, 600) : '';
    }
    case 'icon': return iconNames.includes(String(v)) ? String(v) : String(f.default ?? 'star');
    case 'select': {
      const s = String(v ?? '');
      return f.options?.some((o) => o.value === s) ? s : String(f.default ?? f.options?.[0]?.value ?? '');
    }
    case 'list': {
      const arr = Array.isArray(v) ? v : [];
      return arr.slice(0, f.max ?? 50).filter((x) => x && typeof x === 'object').map((item) => normalizeFields(f.fields ?? [], item, strictImages));
    }
  }
}
function normalizeFields(fields: Field[], raw: any, strictImages?: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.key] = coerce(f, raw?.[f.key], strictImages);
  return out;
}

/** Clean one section: keep only known fields, fix types, drop anything unsafe. Returns null for unknown types. */
export function normalizeSection(raw: any, opts: { strictImages?: Set<string> } = {}): Props | null {
  const def = blocksByType[String(raw?.type)];
  if (!def) return null;
  // The agent (and hand-edited files) may nest fields under `props`; accept both.
  const src = raw.props && typeof raw.props === 'object' ? { ...raw, ...raw.props } : raw;
  const merged = { ...def.defaults, ...src };
  return { id: /^s_[a-z0-9]{3,10}$/.test(String(raw.id)) ? raw.id : uid(), type: def.type, ...normalizeFields(def.fields, merged, opts.strictImages) } as Props;
}

export interface PageData { title: string; description: string; draft: boolean; sections: Props[] }
export function normalizePage(raw: any, opts: { strictImages?: Set<string> } = {}): PageData {
  const sections = (Array.isArray(raw?.sections) ? raw.sections : []).slice(0, 60).map((s: unknown) => normalizeSection(s, opts)).filter(Boolean) as Props[];
  return { title: clip(raw?.title ?? 'Untitled', 120), description: clip(raw?.description ?? '', 300), draft: Boolean(raw?.draft), sections };
}

// ---------------------------------------------------------------- rendering
export function renderSections(sections: any[], ctx: Omit<Ctx, 'prevBg'>): string {
  const out: string[] = [];
  let prevBg: string | null = null;
  for (const raw of sections) {
    const p = normalizeSection(raw);
    if (!p) continue;
    const def = blocksByType[p.type]!;
    out.push(def.render(p, { ...ctx, prevBg }));
    prevBg = def.bg?.(p) ?? null;
  }
  return out.join('\n');
}

/** Plain-text description of every block, for the site agent's instructions. */
export function describeBlocks(): string {
  const fieldLine = (f: Field, indent = '    '): string => {
    let t = f.type as string;
    if (f.type === 'select') t = `one of ${f.options!.map((o) => `"${o.value}"`).join(' | ')}`;
    if (f.type === 'icon') t = `icon, one of ${iconOptions.map((o) => o.value).join(', ')}`;
    if (f.type === 'list') t = `list of objects (max ${f.max ?? 50})`;
    let line = `${indent}- ${f.key} (${t})${f.help ? ': ' + f.help : ''}`;
    if (f.type === 'list') line += '\n' + f.fields!.map((c) => fieldLine(c, indent + '    ')).join('\n');
    return line;
  };
  return blocks.map((b) => `### ${b.type}: ${b.label}\n${b.description}\nFields:\n${b.fields.map((f) => fieldLine(f)).join('\n')}`).join('\n\n');
}
