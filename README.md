# Crosstown Community Church website

Static Astro site for [crosstowncommunitychurch.com](https://www.crosstowncommunitychurch.com), replacing the Wix site. Hosted free on Cloudflare Pages.

## Develop

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # outputs dist/
npm run images     # one-time: download the Wix images into public/images
```

## Before launch

- [ ] **Images:** run `npm run images` from your machine, then commit `public/images/`. Until then pages load images from the Wix CDN (`src/data/images.ts`), which stops working once Wix is cancelled.
- [ ] **Copy:** the files in `src/copy/` and the three posts in `src/content/posts/` are drafts or placeholders marked `TODO` / `DRAFT`. Paste the original text from Wix.
- [ ] **Leaders:** add roles and photos on the About page (`src/pages/about.astro`).
- [ ] **Service times:** confirm Sunday end time (Wix said both 12:30 and 1) in `src/data/site.ts`.
- [ ] **Sermon:** confirm the YouTube id for "This Week's Sermon" in `src/data/site.ts`.
- [ ] **Newsletter list:** export subscribers from Wix (Contacts, filtered to subscribers) and pick a newsletter tool; `functions/api/subscribe.ts` emails the church until then.

## Deploy (Cloudflare Pages)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect this GitHub repo.
2. Build command `npm run build`, output directory `dist`, Node 22.
3. Environment variables:
   - `PUBLIC_TURNSTILE_SITE_KEY` (build) and `TURNSTILE_SECRET_KEY` (secret): from Cloudflare Turnstile.
   - `RESEND_API_KEY` (secret): from [resend.com](https://resend.com) (free tier), after verifying the domain.
   - `CONTACT_TO`: `crosstownstockton@gmail.com`
   - `CONTACT_FROM`: e.g. `Crosstown Website <web@crosstowncommunitychurch.com>`
4. Add the custom domain (`www` plus apex, redirect apex to `www`).

## How it maps to the old site

| Wix URL | New source |
|---|---|
| `/` | `src/pages/index.astro` (anchors `#liveat5`, `#thisweekssermon`, `#contact` kept) |
| `/about` | `src/pages/about.astro` |
| `/ministry-partners` | `src/pages/ministry-partners.astro` |
| `/outreach` | `src/pages/outreach.astro` |
| `/blog` | `src/pages/blog.astro` |
| `/post/<slug>` | `src/content/posts/<slug>.md` |
| `/down-for-maintenance` | 301 to `/` in `public/_redirects` |

Forms post to Cloudflare Pages Functions in `functions/api/`, which check Turnstile and send email through Resend.

## Editing content

The church can edit posts and page text in [Pages CMS](https://app.pagescms.org) (free, signs in with GitHub; config in `.pages.yml`). Every save is a commit, and Cloudflare redeploys automatically. Contact details and service times live in `src/data/site.ts`.
