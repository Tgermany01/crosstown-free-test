// The "site agent": turns a plain-English request into page sections.
// It can only use the block library in src/lib/blocks.ts, and everything it returns is passed
// through normalizePage(), so it can never inject scripts or invent new kinds of content.
import { blockTypes, describeBlocks, normalizePage, PALETTE, type PageData } from '../lib/blocks';
import { slugify } from '../lib/html';

export interface AgentEnv { ANTHROPIC_API_KEY?: string; ANTHROPIC_MODEL?: string; ANTHROPIC_BASE_URL?: string }
export interface AgentRequest {
  prompt: string;
  /** The page as it currently stands in the editor, when asking for changes to an existing page. */
  current?: { title: string; description: string; sections: unknown[] };
  images: string[];
  pages: { slug: string; title: string }[];
  site: { name: string; phone: string; email: string; street: string; cityStateZip: string; hours: string };
}
export interface AgentResult { page: PageData & { slug: string }; notes: string }

const system = (r: AgentRequest) => `You are the site agent for ${r.site.name}, a small church in Stockton, California. You build and edit web pages for the church's staff, who are not technical.

You do not write HTML or CSS. You build pages by choosing from a fixed library of sections ("blocks") and filling in their fields, then calling the build_page tool. The site's design (fonts, colours, spacing, wavy edges, parallax photos) is applied automatically.

## Voice
Warm, plain, welcoming and specific. Short sentences. No jargon, no hype, no emoji. Only state facts the user gave you or that appear in the site details below; never invent service times, names, phone numbers, addresses, scripture quotes or statistics. When something is missing, write a sensible placeholder the staff can edit and say so in "notes".

## Site details
Name: ${r.site.name}. Address: ${r.site.street}, ${r.site.cityStateZip}. Phone: ${r.site.phone}. Email: ${r.site.email}. Hours: ${r.site.hours}.
Existing pages: ${r.pages.map((p) => `${p.title} (/${p.slug === 'index' ? '' : p.slug})`).join(', ') || 'none'}.

## Design rules
- Start most pages with a "hero" or "split-intro" block. Use "photo-band" sparingly between sections.
- Alternate section background colours for rhythm (white, light blue "ice", "mist", "teal", "navy"). Use the wavy edge ("wave" or "wave-flip") where the background colour changes, and "flat" where it does not. The first section's edge must be "flat".
- Keep headings short. Break long text into several paragraphs separated by a blank line.
- End pages that invite action with a "cta" or "contact-form" block.
- Use 4 to 8 sections for a typical page.

## Images
You may only use these existing image paths (copy them exactly), or leave an image empty:
${r.images.length ? r.images.map((i) => `- ${i}`).join('\n') : '(none uploaded yet)'}
Pick photos whose names fit the topic. Leave image fields empty rather than guessing; the staff can add photos in the editor.

## Links
Link to existing pages with their path (e.g. /about). External links must start with https://.

## Block library
Every section is an object with a "type" and its own fields as listed (put the fields directly on the section object).

${describeBlocks()}

Colours available for "bg": ${Object.keys(PALETTE).join(', ')}.

## Output
Always respond by calling build_page. Include a short "notes" (one or two sentences, plain language) telling the staff what you built and anything they need to fill in. ${r.current ? 'You are EDITING the existing page given below: keep what the user did not ask to change, and return the complete updated list of sections.' : 'You are creating a NEW page.'}`;

const tool = {
  name: 'build_page',
  description: 'Return the finished page.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Page title, e.g. "Youth Ministry".' },
      slug: { type: 'string', description: 'URL name: lowercase letters, numbers and dashes.' },
      description: { type: 'string', description: 'One-sentence summary for search engines.' },
      notes: { type: 'string', description: 'Short note to the staff about what you did.' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: { type: { type: 'string', enum: blockTypes } },
          required: ['type'],
          additionalProperties: true,
        },
      },
    },
    required: ['title', 'sections', 'notes'],
  },
};

export async function runAgent(env: AgentEnv, req: AgentRequest): Promise<AgentResult> {
  if (!env.ANTHROPIC_API_KEY) throw new AgentError('The site agent is not switched on yet. Ask whoever set up the site to add ANTHROPIC_API_KEY.', 503);
  const user = req.current
    ? `Current page:\n${JSON.stringify(req.current)}\n\nRequest: ${req.prompt}`
    : `Build this page: ${req.prompt}`;
  const res = await fetch(`${env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY.trim(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
      max_tokens: 12000,
      system: system(req),
      tools: [tool],
      tool_choice: { type: 'tool', name: 'build_page' },
      messages: [{ role: 'user', content: user.slice(0, 60000) }],
    }),
  });
  if (!res.ok) {
    const raw = await res.text();
    let reason = '';
    try { reason = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? ''; } catch { /* not JSON */ }
    console.error(`Anthropic API ${res.status}: ${raw.slice(0, 500)}`);
    throw new AgentError(explainAnthropicError(res.status, reason, env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'), 502);
  }
  const data = (await res.json()) as { content?: { type: string; name?: string; input?: any }[] };
  const call = data.content?.find((c) => c.type === 'tool_use' && c.name === 'build_page');
  if (!call?.input) throw new AgentError('The site agent did not return a page. Try rephrasing your request.', 502);

  const page = normalizePage(call.input, { strictImages: new Set(req.images) });
  if (!page.sections.length) throw new AgentError('The site agent returned an empty page. Try giving it a bit more detail.', 502);
  if (page.sections[0]) page.sections[0].edge = 'flat';
  return {
    page: { ...page, draft: true, slug: slugify(String(call.input.slug || page.title)) || 'new-page' },
    notes: String(call.input.notes ?? '').slice(0, 600),
  };
}

/** Turns an Anthropic API error into something the person setting this up can act on. */
export function explainAnthropicError(status: number, reason: string, model: string): string {
  const r = reason.toLowerCase();
  const detail = reason ? ` Anthropic said: "${reason.slice(0, 240)}"` : '';
  if (status === 401) return 'Anthropic rejected the API key. ANTHROPIC_API_KEY is wrong, was deleted, or has extra spaces: make a new one at console.anthropic.com and update it in Cloudflare.';
  if (r.includes('credit balance')) return 'The Anthropic account has no credit left. Add credits under Plans & Billing at console.anthropic.com, then try again.';
  if (status === 403) return `The Anthropic key isn't allowed to do this.${detail}`;
  if (status === 404 || r.includes('model')) return `Anthropic doesn't recognise the model "${model}" for this key. Remove ANTHROPIC_MODEL to use the default, or set it to a model your account can use.${detail}`;
  if (status === 429) return 'Anthropic is rate-limiting this key. Wait a minute and try again.';
  if (status === 529 || status >= 500) return 'Anthropic is busy or having trouble right now. Try again in a moment.';
  return `Anthropic refused the request (${status}).${detail}`;
}

export class AgentError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
