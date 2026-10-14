// Downloads the original-size images from the Wix CDN into public/images.
// Run once from a machine that can reach static.wixstatic.com:
//   npm run images
import { mkdir, writeFile, access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../src/data/images.ts', import.meta.url), 'utf8');
const entries = [...src.matchAll(/file: '([^']+)', wix: '([^']+)'/g)];
const outDir = new URL('../public/images/', import.meta.url);
await mkdir(outDir, { recursive: true });

for (const [, file, wix] of entries) {
  const dest = new URL(file, outDir);
  try {
    await access(dest);
    console.log(`skip  ${file} (already downloaded)`);
    continue;
  } catch {}
  const res = await fetch(`https://static.wixstatic.com/media/${wix}`);
  if (!res.ok) {
    console.error(`FAIL  ${file}: HTTP ${res.status}`);
    process.exitCode = 1;
    continue;
  }
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`saved ${file}`);
}
