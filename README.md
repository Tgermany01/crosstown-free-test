# Crosstown Community Church website

Static Astro site for [crosstowncommunitychurch.com](https://www.crosstowncommunitychurch.com), replacing the Wix site. Hosted on Cloudflare **Workers** (static assets plus a small Worker for `/api/*`). The team edits it at **`/admin`**.

## Develop

```sh
npm install
npm run dev        # http://localhost:4321  (site)  and  http://localhost:4321/admin  (editor)
npm run build      # outputs dist/
npm run preview:worker   # build, then run the real Worker locally (http://localhost:8787)
```

In `npm run dev` the editor works without any setup: sign in with the first-run account below and every save is written straight into the files in this folder. Contacts and team accounts live in `.local/dev.sqlite`; emails that would be sent are written to `.local/outbox.txt`. To try the site agent locally, start the dev server with `ANTHROPIC_API_KEY=... npm run dev`.

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
- **Contacts:** every form fill lands here, tagged by the form it came through (e.g. *Get in touch*, *CSI Prayer Team*, *Crosstown Newsletter*). Search and filter by tag, status or subscription, add notes, edit, export to CSV, and import the old Wix list (see below).
- **Team:** invite people by email address (you get a private link to send, and an email goes out too if sending is set up), reset passwords, disable people, and choose who is emailed when a form is filled in.
- **Blog posts, Photos, Settings:** posts with a cover photo, an upload library (large photos are shrunk in the browser), and the site-wide details and menu.

Every save is a commit to this repo, so there is a full history, and Cloudflare rebuilds the live site in about a minute.

The site agent can only use the section library. Its answer is cleaned against the same field definitions as the editor (unknown sections, unknown photos, `javascript:` links and extra fields are dropped, and all text is escaped when rendered), and it never publishes: the staff review the draft and press Save.

### One-time setup in Cloudflare

**1. Create the Worker from this repo.** Cloudflare dashboard → **Workers & Pages** → **Create application** → **Import a repository** (Workers Builds) → pick this repo, production branch `main`.

- Project / Worker name: `crosstown-community` (must match `name` in `wrangler.jsonc`)
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: leave empty

Node 22 is picked up from `.nvmrc`. Under **Settings → Build → Variables and secrets** add the *build* variable `PUBLIC_TURNSTILE_SITE_KEY` (see Forms below); build variables are separate from the Worker's runtime settings.

**2. Add the runtime settings.** Worker → **Settings → Variables and Secrets**:

| Name | Type | What it is |
|---|---|---|
| `ADMIN_PASSWORD` | Secret | The shared password the team signs in with. |
| `SESSION_SECRET` | Secret | Any long random string (`openssl rand -base64 32`). Signs the login cookie. |
| `GITHUB_TOKEN` | Secret | Fine-grained GitHub token for this one repo with **Contents: Read and write**. |
| `GITHUB_REPO` | Text | `tanner-svg/crosstown-community-site` |
| `GITHUB_BRANCH` | Text | The production branch, usually `main`. |
| `ANTHROPIC_API_KEY` | Secret | Turns on the site agent. Without it the rest of the editor still works. |
| `ANTHROPIC_MODEL` | Text | Optional. Defaults to `claude-sonnet-5-5`. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET` | Text / Secret | Optional: first admin account and login-cookie secret (see Accounts below). |
| `CONTACT_FROM`, `CONTACT_TO` | Text | Sender address for notification emails; optional extra recipient. |
| `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` | Secret | Optional Resend fallback; Turnstile spam check (below). |

`wrangler.jsonc` sets `keep_vars`, so deploys never wipe values you entered in the dashboard. (If you ever remove that line, enter everything as a Secret instead: secrets always survive deploys.) Saving these redeploys the Worker with the new values. Don't copy the editor secrets into preview builds of other branches, or those previews could write to `main`.

**3. Custom domain.** Worker → **Settings → Domains & Routes** → add `www.crosstowncommunitychurch.com` and the bare domain (redirect the bare domain to `www`). The domain's DNS has to be on Cloudflare. Cut over from Wix last.

**4. Lock down `/admin` (recommended).** Zero Trust → **Access → Applications → Self-hosted**: add `/admin*` and `/api/admin*` on your domain with an allow-list of staff emails, and add a rate-limiting rule on `/api/admin/login`. The shared password works without these.

The editor shows plain-language errors if something is mis-set (expired token, wrong repo name, missing permission).

### Accounts, contacts and email notifications

Accounts, contacts and form submissions are stored in a **Cloudflare D1** database (free plan: 5 GB, plenty for a church list). `wrangler.jsonc` declares the binding `DB` without an id, so the first deploy creates the database `crosstown-contacts` automatically, and the tables are created on first use.

- **First sign-in:** `tanner@nectarine.ink` with the temporary password `test`. You are made to choose a new password immediately. To use a different first account, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first sign-in (the account is only created while the user list is empty). Passwords are stored as salted PBKDF2 hashes, five wrong tries lock an account for 15 minutes.
- **Inviting people:** Team → *Invite someone*. The invitation link works once and expires in 7 days. `SESSION_SECRET` is optional (a random one is generated and stored in the database).
- **Who gets emailed:** everyone on the Team page with *Email me form fills* ticked (plus `CONTACT_TO` if set). Each person is emailed separately, so one bad address never blocks the others, and failures are shown in the contact's history.
- **Email sending:** the Worker uses the Cloudflare `send_email` binding (`EMAIL`). On the free plan Cloudflare only delivers to **verified destination addresses**: add each team member under *Email Service → Email Routing → Destination addresses* and have them click the confirmation. `CONTACT_FROM` must be an address on a domain with Email Routing enabled. With `RESEND_API_KEY` set instead, any address works.
- **Tags:** the contact form on any page has a *Tag* field in the editor (default *Get in touch*); sign-up forms too (*CSI Prayer Team*, *Crosstown Newsletter*). Change the tag per form to track interest, e.g. a form on the Ministry Partners page can use *Ministry Partners*. A person filling in several forms is one contact with several tags.

### Moving the Wix contacts over

In Wix: **Contacts → Export** (CSV). In the editor: **Contacts → Import CSV**, choose the file, check the matched columns and the summary, optionally add a tag for everyone (default *Wix import*), and press Import. People are matched by email, so importing twice never makes duplicates. Wix labels become tags, unsubscribed people are kept as “do not email”, and the export file itself should never be committed to this repo (it holds personal data).

### How the Worker is wired

`wrangler.jsonc` serves `dist/` as static assets and runs `worker/index.ts` only for `/api/*` (`run_worker_first`). The D1 database is bound as `DB`. `worker/index.ts` routes `/api/admin/*` to the editor API (`src/server/api.ts`, saving through the GitHub API) and `/api/contact` and `/api/subscribe` to the form handlers (`src/server/forms.ts`). `_headers` and `_redirects` in `public/` are applied by Workers static assets. Deploy by hand with `npm run deploy`.

## Forms and email

The forms check a hidden honeypot and Cloudflare Turnstile, then email the church through Resend. Settings:

- `PUBLIC_TURNSTILE_SITE_KEY` (**build** variable) and `TURNSTILE_SECRET_KEY` (runtime secret): from Cloudflare Turnstile.
- `RESEND_API_KEY` (secret): from [resend.com](https://resend.com) (free tier), after verifying the domain.
- `CONTACT_TO`: `crosstownstockton@gmail.com`
- `CONTACT_FROM`: e.g. `Crosstown Website <web@crosstowncommunitychurch.com>`

## Before launch

- [ ] **Logo:** `public/images/logo-*.png` were generated from a small Wix JPG. Swap in the original SVG or a high-res PNG.
- [ ] **Icons:** the Resources tiles use hand-drawn line icons close to the Wix ones. If you can export the originals from Wix, drop them into `src/lib/icons.ts`.
- [ ] **Sermon banner photo:** it uses the YouTube thumbnail. The Wix site showed a specific video still; upload it under Photos and set it as the banner's background photo.
- [ ] **Partner links:** add the Pray Stockton and Stockton Police Chaplaincy links on the Ministry Partners page (the "Visit their website" button stays hidden until a link is set).
- [ ] **Leaders:** confirm roles and bios on the About page.
- [ ] **Service times:** confirm the Sunday end time (Wix said both 12:30 and 1).
- [ ] **Contacts:** import the Wix export (see above) and verify each team member's email in Cloudflare Email Routing.
- [ ] **First password:** sign in once and replace the temporary `test` password.

## How it maps to the old site

| Wix URL | New source |
|---|---|
| `/` | `src/content/pages/index.json` (anchors `#liveat5`, `#thisweekssermon`, `#contact` kept) |
| `/about`, `/ministry-partners`, `/outreach`, `/blog` | `src/content/pages/<slug>.json` |
| `/post/<slug>` | `src/content/posts/<slug>.md` |
| `/blog/categories/<slug>` | generated from the categories in `src/data/site.json` |
| `/down-for-maintenance` | 301 to `/` in `public/_redirects` |
