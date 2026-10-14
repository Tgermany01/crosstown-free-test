// Scrapes text and original-size images from the live Wix site into ./scraped.
// Run from a machine that can reach the site (your laptop):
//   npm run scrape
// Output:
//   scraped/<page>.md          page title, meta description and text blocks in order
//   scraped/images/<page>/...  every image the page uses, at original size
// Copy what you need from scraped/ into src/copy, src/content/posts and public/images.
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parse } from 'node-html-parser';

const SITE = 'https://www.crosstowncommunitychurch.com';
const OUT = new URL('../scraped/', import.meta.url);
const UA = { 'User-Agent': 'Mozilla/5.0 (site migration script)' };

async function get(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res;
}

async function sitemapUrls() {
  const index = await (await get(`${SITE}/sitemap.xml`)).text();
  const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls = [];
  for (const child of children) {
    const xml = await (await get(child)).text();
    urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }
  return [...new Set(urls)];
}

const clean = (s) => s.replace(/​/g, '').replace(/\s+/g, ' ').trim();

// Flattens inline markup to text, keeping links as Markdown links.
function inline(node) {
  if (node.nodeType === 3) return node.text;
  if (node.tagName === 'A' && node.getAttribute('href')) {
    const t = clean(node.text);
    return t ? `[${t}](${node.getAttribute('href')})` : '';
  }
  if (node.tagName === 'BR') return ' ';
  return node.childNodes.map(inline).join('');
}

// Turns one Wix rich-text block into Markdown, keeping headings, lists and links.
function toMarkdown(el) {
  const lines = [];
  for (const node of el.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')) {
    // Skip paragraphs nested in list items; the <li> already covers them.
    if (node.tagName === 'P' && node.closest('li')) continue;
    let text = inline(node);
    text = clean(text);
    if (!text) continue;
    const tag = node.tagName;
    if (tag.startsWith('H')) lines.push(`${'#'.repeat(Number(tag[1]) + 1)} ${text}`);
    else if (tag === 'LI') lines.push(`- ${text}`);
    else lines.push(text);
  }
  return lines.join('\n\n');
}

export function extract(html) {
  const root = parse(html);
  const title = clean(root.querySelector('title')?.text ?? '');
  const description = root.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';

  // Blog posts keep their body in the post container; regular pages use rich-text blocks.
  const post = root.querySelector('[data-hook="post-description"]') ?? root.querySelector('article');
  const blocks = post
    ? [post]
    : root.querySelectorAll('[data-testid="richTextElement"]');
  const body = blocks.map(toMarkdown).filter(Boolean);

  // Image ids look like b26b85_<hash>~mv2.jpg. Strip Wix's resize suffix to get the original.
  const images = [
    ...new Set([...html.matchAll(/static\.wixstatic\.com\/media\/([a-z0-9]+_[a-f0-9]+~mv2\.(?:jpe?g|png|gif|webp))/gi)].map((m) => m[1])),
  ];
  return { title, description, body, images };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const urls = await sitemapUrls();
  console.log(`Found ${urls.length} pages in the sitemap`);

  for (const url of urls) {
    const path = new URL(url).pathname;
    const name = path === '/' ? 'home' : path.slice(1).replace(/\//g, '__');
    const html = await (await get(url)).text();
    const { title, description, body, images } = extract(html);

    const md = [
      `<!-- Scraped from ${url} -->`,
      `# ${title}`,
      description && `> Meta description: ${description}`,
      ...body,
      images.length && `## Images\n\n${images.map((i) => `- images/${name}/${i}`).join('\n')}`,
    ].filter(Boolean).join('\n\n');
    await writeFile(new URL(`${name}.md`, OUT), md + '\n');

    const imgDir = new URL(`images/${name}/`, OUT);
    await mkdir(imgDir, { recursive: true });
    for (const id of images) {
      try {
        const buf = Buffer.from(await (await get(`https://static.wixstatic.com/media/${id}`)).arrayBuffer());
        await writeFile(new URL(id, imgDir), buf);
      } catch (err) {
        console.error(`  image failed: ${id} (${err.message})`);
        process.exitCode = 1;
      }
    }
    console.log(`saved ${name}.md (${body.length} text blocks, ${images.length} images)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
