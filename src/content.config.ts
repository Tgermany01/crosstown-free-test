import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string(),
    // A category `key` from src/data/site.json.
    category: z.string(),
    image: z.string(),
    description: z.string(),
  }),
});

export const collections = { posts };
