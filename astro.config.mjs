// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.crosstowncommunitychurch.com',
  // Wix served pages without a trailing slash; keep the same URLs.
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap()],
});
