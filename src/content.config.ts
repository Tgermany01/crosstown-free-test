import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string(),
    // Matches a key in `categories` in src/data/site.ts.
    category: z.enum(['csi', 'feeding-hands']),
    image: z.string(),
    description: z.string(),
  }),
});

export const collections = { posts };
