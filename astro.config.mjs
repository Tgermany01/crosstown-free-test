// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

// Lets `npm run dev` serve /api/admin/* from local files, so /admin works without Cloudflare.
/** @returns {import('vite').Plugin} */
const adminDevApi = () => ({
  name: 'crosstown-admin-dev-api',
  configureServer(server) {
    server.middlewares.use(async (/** @type {any} */ req, /** @type {any} */ res, /** @type {() => void} */ next) => {
      if (!req.url?.startsWith('/api/admin')) return next();
      const { devHandler } = await server.ssrLoadModule('/src/server/dev-api.ts');
      return devHandler(fileURLToPath(new URL('.', import.meta.url)), process.env)(req, res, next);
    });
  },
});

export default defineConfig({
  site: 'https://www.crosstowncommunitychurch.com',
  // Wix served pages without a trailing slash; keep the same URLs.
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap({ filter: (page) => !page.includes('/admin') })],
  vite: { plugins: [adminDevApi()] },
});
