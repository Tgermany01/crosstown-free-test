import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Images from the Wix site. `npm run images` downloads each one into
// public/images/<file>. Until a file is downloaded, pages fall back to the
// Wix CDN copy so nothing renders broken; after cancelling Wix, every image
// must be local.
export const wixImages = {
  hero: { file: 'hero.jpg', wix: 'b26b85_729298e2cdd747838bc94a3c9226b085~mv2.jpg' },
  bibleStudy: { file: 'bible-study.jpg', wix: 'b26b85_92224b101f884cc9846876b052ca5063~mv2.jpg' },
  kitchen: { file: 'kevin-and-paula.jpg', wix: 'b26b85_822274fd4b83477d831cd423520ecb75~mv2.jpg' },
  logo: { file: 'logo.png', wix: 'ab48db_1663cf8dedaa4871bff7c95000a29f53~mv2.png' },
  ogImage: { file: 'og-image.jpg', wix: 'b26b85_12d283c682fc4f2d8744a2c973378f1f~mv2.jpg' },
  aboutHero: { file: 'about-hero.jpg', wix: 'b26b85_a5e39447b4f140828f966e8b3f7249ff~mv2.jpg' },
  about1: { file: 'about-1.jpg', wix: 'b26b85_62788f002c4c4a80999330d4b4c9bf86~mv2.jpg' },
  about2: { file: 'about-2.jpg', wix: 'b26b85_20d1170eff0b4860b0bcc48a03da1c2f~mv2.jpg' },
  about3: { file: 'about-3.jpg', wix: 'b26b85_478df212b38842acbe9612fc07419e47~mv2.jpg' },
  about4: { file: 'about-4.jpg', wix: 'b26b85_d12745da04bf4320a50a209680776c48~mv2.jpg' },
  about5: { file: 'about-5.jpg', wix: 'b26b85_ba4b7157ee854c9ebb087d99c0d430f9~mv2.jpg' },
  about6: { file: 'about-6.jpg', wix: 'b26b85_e5d4ccb4f68a4236812beba06b9597d1~mv2.jpg' },
  outreachHero: { file: 'outreach-hero.jpg', wix: 'b26b85_1f33559f65924004b48f4e7bc036185f~mv2.jpg' },
  csi: { file: 'csi.jpg', wix: 'b26b85_0e379f5ac53f4a90a0c3db88f0c7bf21~mv2.jpg' },
  csiReports: { file: 'csi-reports.jpg', wix: 'b26b85_523dce19363e4ff3b3f332e14d235272~mv2.jpg' },
  feeding1: { file: 'feeding-hands-1.jpg', wix: 'b26b85_e99d71b2e4ea486b96d5990ecd6101c1~mv2.jpg' },
  feeding2: { file: 'feeding-hands-2.jpg', wix: 'b26b85_b88cfc8d36e042c2945ed5869b19133e~mv2.jpg' },
  feeding3: { file: 'feeding-hands-3.jpg', wix: 'b26b85_787d81986ffb421a90cf746534a67458~mv2.jpg' },
  feeding4: { file: 'feeding-hands-4.jpg', wix: 'b26b85_d0b49f9c973e47758a094bebc4d8d82e~mv2.jpg' },
  partners: { file: 'ministry-partners.jpg', wix: 'b26b85_25798d5cfb3a4bb6be84ca185fc0986d~mv2.jpg' },
} as const;

export type ImageKey = keyof typeof wixImages;

export function img(key: ImageKey): string {
  const { file, wix } = wixImages[key];
  return existsSync(join(process.cwd(), 'public/images', file))
    ? `/images/${file}`
    : `https://static.wixstatic.com/media/${wix}`;
}
