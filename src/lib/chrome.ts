// Site header and footer as HTML strings (used by Base.astro and by the admin preview).
import { esc, safeUrl } from './html';
import { icon } from './icons';
import type { SiteLite } from './blocks';

const isCurrent = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

export function renderHeader(site: SiteLite, path: string, turnstileKey?: string): string {
  void turnstileKey;
  const links = site.nav
    .map((n) => `<a href="${esc(safeUrl(n.href) || '/')}"${isCurrent(path, n.href) ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`)
    .join('');
  return `<header class="site-header"><div class="bar">
    <a class="brand" href="/" aria-label="${esc(site.name)} home"><img src="/images/logo-white.png" alt="Crosstown" width="117" height="86"></a>
    <button class="toggle" type="button" aria-expanded="false" aria-controls="main-nav">${icon('menu', 28)}<span class="visually-hidden">Menu</span></button>
    <nav id="main-nav" aria-label="Main">${links}${site.donateUrl ? `<a class="btn btn-orange donate" href="${esc(safeUrl(site.donateUrl))}">${esc(site.donateLabel || 'Donate')}</a>` : ''}</nav>
  </div></header>`;
}

export function renderFooter(site: SiteLite, path: string, newsletterForm: string): string {
  const year = new Date().getFullYear();
  const nav = site.nav
    .map((n) => `<a href="${esc(safeUrl(n.href) || '/')}"${isCurrent(path, n.href) ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`)
    .join('');
  return `<footer class="site-footer"><div class="cols">
    <div class="f-contact">
      <img class="f-logo" src="/images/logo-white.png" alt="Crosstown" width="148" height="109" loading="lazy">
      <p class="f-name">${esc(site.name)}</p>
      <ul>
        <li>${icon('clock', 20)}<span>${esc(site.hours)}</span></li>
        <li>${icon('phone', 20)}<a href="${esc(site.phoneHref)}">${esc(site.phone)}</a></li>
        <li>${icon('mail', 20)}<a href="mailto:${esc(site.email)}">${esc(site.email)}</a></li>
        <li>${icon('mailbox', 20)}<span>${esc(site.mailing)}</span></li>
        <li>${icon('pin', 20)}<a href="${esc(safeUrl(site.mapUrl))}">${esc(site.street)} ${esc(site.cityStateZip)}</a></li>
      </ul>
    </div>
    <nav class="f-nav" aria-label="Footer">${nav}<a class="fb" href="${esc(safeUrl(site.facebookUrl))}" aria-label="Crosstown on Facebook">${icon('facebook', 39)}</a></nav>
    <div class="f-news">
      <div class="newsletter"><h2>${esc(site.newsletterHeading)}</h2>${newsletterForm}</div>
      <p class="credit">©${year} web design by <a href="${esc(safeUrl(site.creditUrl))}">${esc(site.creditName)}</a></p>
      <p class="affil">Copyright 2023 affiliated with <a href="${esc(safeUrl(site.affiliationUrl))}">${esc(site.affiliationName)}</a></p>
    </div>
  </div></footer>`;
}

export function renderNewsletterForm(turnstileKey?: string, tag = 'Crosstown Newsletter'): string {
  return `<form class="stack js-form" method="post" action="/api/subscribe" data-success="Thanks for subscribing!">
    <input type="hidden" name="tag" value="${esc(tag)}">
    <label class="field">Email *<input name="email" type="email" autocomplete="email" placeholder="e.g., email@example.com" required></label>
    <label class="hp" aria-hidden="true">Leave blank <input name="website" tabindex="-1" autocomplete="off"></label>
    ${turnstileKey ? `<div class="cf-turnstile" data-sitekey="${esc(turnstileKey)}"></div>` : ''}
    <button class="btn btn-orange" type="submit">Join Our Mailing List</button>
    <p class="form-status" role="status"></p>
  </form>`;
}
