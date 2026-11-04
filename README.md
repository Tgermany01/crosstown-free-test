# Crosstown Community Church website

Static Astro site for [crosstowncommunitychurch.com](https://www.crosstowncommunitychurch.com), replacing the Wix site. Hosted free on Cloudflare Pages. The team edits it at **`/admin`**.

## Develop

```sh
npm install
npm run dev        # http://localhost:4321  (site)  and  http://localhost:4321/admin  (editor)
npm run build      # outputs dist/
```

In `npm run dev` the editor works without any setup: sign in with the password `crosstown` and every save is written straight into the files in this folder. To try the site agent locally, start the dev server with `ANTHROPIC_API_KEY=... npm run dev`.

## How the site is built

Every page is a list of **sections** stored in `src/content/pages/<slug>.json` (`index.json` is the home page). The section types ("blocks") are defined once in `src/lib/blocks.ts`: their editable fields, their HTML, and their descriptions. That one file drives:

- the public site (`src/pages/[...slug].astro` renders the JSON),
- the editor forms and live preview in `/admin`,
- the site agent's instructions (and the validation of what it returns).

To add a new kind of section, add one `add({...})` entry in `blocks.ts` and its CSS in `src/styles/global.css`. It shows up in the editor and the agent automatically.

Other content:

| What | Where |
|---|---|
| Blog posts | `src/content/posts/*.md` |
| Contact details, menu, footer, blog categories | `src/data/site.json` |
| Photos | `public/images/` |
| Colours and type | top of `src/styles/global.css` |
| Wix reference screenshots and computed styles | `design-reference/` |

Parallax: every photo section (hero, photo strip, video banner, page intro) puts its image in a layer taller than its frame and slides it against the scroll (`src/scripts/site.ts`). It uses transforms so it also works on iPhones, and it switches off for people who ask their device for reduced motion.

## The editor (`/admin`)

- **Pages:** edit any page, add / reorder / duplicate / delete sections, and see a live desktop, tablet and phone preview. Click a section in the preview to jump to its form. Pages can be Draft (hidden) or Published, and can be added to the top menu.
- **New pages:** build from sections (blank, simple or landing starter), or describe the page to the **site agent**, which drafts it for review. In any page, the agent box can also change an existing page ("add a section with our Bible study times"), with one-click undo.
- **Blog posts, Photos, Settings:** posts with a cover photo, an upload library (large photos are shrunk in the browser), and the site-wide details and menu.

Every save is a commit to this repo, so there is a full history, and Cloudflare Pages rebuilds the live site in about a minute.

The site agent can only use the section library. Its answer is cleaned against the same field definitions as the editor (unknown sections, unknown photos, `javascript:` links and extra fields are dropped, and all text is escaped when rendered), and it never publishes: the staff review the draft and press Save.

### One-time setup in Cloudflare

Pages project → Settings → Variables and Secrets (add as *secrets* unless noted):

| Name | What it is |
|---|---|
| `ADMIN_PASSWORD` | The shared password the team signs in with. |
| `SESSION_SECRET` | Any long random string (signs the login cookie). Optional, but recommended. |
| `GITHUB_REPO` | `tanner-svg/crosstown-community-site` (plain variable). |
| `GITHUB_BRANCH` | The production branch, usually `main` (plain variable). |
| `GITHUB_TOKEN` | A fine-grained GitHub token for this one repo with **Contents: Read and write**. |
| `ANTHROPIC_API_KEY` | Turns on the site agent. Without it the rest of the editor still works. |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-sonnet-5-5`. |

Recommended extras: put the `/admin*` and `/api/admin*` paths behind **Cloudflare Access** (free for small teams) so staff sign in with their own email, and add a Cloudflare rate-limiting rule on `/api/admin/login`. The password sign-in works without them.

## Forms and email

Forms post to Cloudflare Pages Functions in `functions/api/`, which check Turnstile and send email through Resend. Environment variables:

- `PUBLIC_TURNSTILE_SITE_KEY` (build) and `TURNSTILE_SECRET_KEY` (secret): from Cloudflare Turnstile.
- `RESEND_API_KEY` (secret): from [resend.com](https://resend.com) (free tier), after verifying the domain.
- `CONTACT_TO`: `crosstownstockton@gmail.com`
- `CONTACT_FROM`: e.g. `Crosstown Website <web@crosstowncommunitychurch.com>`

## Deploy (Cloudflare Pages)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect this GitHub repo.
2. Build command `npm run build`, output directory `dist`, Node 22.
3. Add the variables above.
4. Add the custom domain (`www` plus apex, redirect apex to `www`).

## Before launch

- [ ] **Logo:** `public/images/logo-*.png` were generated from a small Wix JPG. Swap in the original SVG or a high-res PNG.
- [ ] **Icons:** the Resources tiles use hand-drawn line icons close to the Wix ones. If you can export the originals from Wix, drop them into `src/lib/icons.ts`.
- [ ] **Sermon banner photo:** it uses the YouTube thumbnail. The Wix site showed a specific video still; upload it under Photos and set it as the banner's background photo.
- [ ] **Partner links:** add the Pray Stockton and Stockton Police Chaplaincy links on the Ministry Partners page (the "Visit their website" button stays hidden until a link is set).
- [ ] **Leaders:** confirm roles and bios on the About page.
- [ ] **Service times:** confirm the Sunday end time (Wix said both 12:30 and 1).
- [ ] **Newsletter list:** export subscribers from Wix (Contacts, filtered to subscribers) and pick a newsletter tool; `functions/api/subscribe.ts` emails the church until then.

## How it maps to the old site

| Wix URL | New source |
|---|---|
| `/` | `src/content/pages/index.json` (anchors `#liveat5`, `#thisweekssermon`, `#contact` kept) |
| `/about`, `/ministry-partners`, `/outreach`, `/blog` | `src/content/pages/<slug>.json` |
| `/post/<slug>` | `src/content/posts/<slug>.md` |
| `/blog/categories/<slug>` | generated from the categories in `src/data/site.json` |
| `/down-for-maintenance` | 301 to `/` in `public/_redirects` |
