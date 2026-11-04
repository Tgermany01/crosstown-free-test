// Loads blog posts for the build and shapes them for the section renderers. Astro-only (uses astro:content).
import { getCollection } from 'astro:content';
import type { PostLite } from './blocks';

export async function loadPosts(): Promise<PostLite[]> {
  const posts = await getCollection('posts');
  return posts
    .map((p) => ({
      id: p.id,
      title: p.data.title,
      date: p.data.date.toISOString(),
      author: p.data.author,
      category: p.data.category,
      image: p.data.image,
      description: p.data.description,
      minutes: Math.max(1, Math.round((p.body?.split(/\s+/).length ?? 0) / 200)),
    }))
    .sort((a, b) => +new Date(b.date) - +new Date(a.date) || b.id.localeCompare(a.id));
}
