// The posts API's response types, and the normalizer that turns a Tumblr post in Neue Post Format
// into an AudioPost. docs/adr/0001-tumblr-npf-format.md explains which NPF fields are read and why.

export type Track =
  | { kind: "native"; fileUrl: string }
  | { kind: "embed"; provider: string; embedUrl: string }
  | { kind: "link"; provider: string; url: string };

export type AudioPost = {
  id: string;
  postUrl: string;
  publishedAt: number; // Unix seconds
  rebloggedFrom?: string;
  title: string;
  artist?: string;
  album?: string;
  artUrl?: string;
  bodyHtml: string; // unsanitized: sanitize before rendering
  track: Track;
};

export type PostsResponse = {
  blog: { username: string; title: string; avatarUrl: string | null; blogUrl: string; totalAudioPosts: number };
  posts: AudioPost[];
  nextCursor: string | null;
};

// network_error is the page's own, for a request that never got a response.
export type ErrorResponse = {
  error: {
    code: "invalid_username" | "blog_not_found" | "blog_private" | "rate_limited" | "upstream_error" | "network_error";
    upstreamStatus?: number;
  };
};

// The NPF fields the normalizer reads.
type Block = {
  type: string;
  subtype?: string;
  text?: string;
  indent_level?: number;
  formatting?: Formatting[];
  provider?: string;
  url?: string | null;
  title?: string;
  artist?: string;
  album?: string;
  embed_url?: string;
  media?: { url: string };
  poster?: { url: string }[];
};
type Formatting = { type: string; start: number; end: number; url?: string; blog?: { name: string } };
type Trail = { blog?: { name: string }; broken_blog_name?: string; content: Block[] };
export type TumblrPost = {
  id_string: string;
  post_url: string;
  timestamp: number;
  reblogged_from_name?: string;
  content: Block[];
  trail: Trail[];
};

export function normalizePost(post: TumblrPost): AudioPost {
  // A reblog's track is usually in the trail, not in the post's own content.
  const audio = [post.content, ...post.trail.map((t) => t.content)].flat().find((b) => b.type === "audio") ?? {
    type: "audio",
  };
  return {
    id: post.id_string,
    postUrl: post.post_url,
    publishedAt: post.timestamp,
    // reblogged_from_name is missing when the source was deleted or renamed; the trail's root blog
    // is the next best name.
    rebloggedFrom: post.reblogged_from_name ?? post.trail[0]?.blog?.name ?? post.trail[0]?.broken_blog_name,
    title: audio.title || "Untitled",
    artist: audio.artist || undefined,
    album: audio.album || undefined,
    artUrl: audio.poster?.[0]?.url,
    bodyHtml: post.trail.map(trailHtml).join("") + blocksHtml(post.content),
    track: track(audio, post.post_url),
  };
}

// Embeds are allowed only over https from these domains (or their subdomains), keyed to the provider name.
const EMBED_DOMAINS: Record<string, string> = {
  "soundcloud.com": "soundcloud",
  "spotify.com": "spotify",
  "bandcamp.com": "bandcamp",
};

function track(audio: Block, postUrl: string): Track {
  // Check embeds before media: Bandcamp and SoundCloud blocks also carry a media URL. Tumblr
  // HTML-escapes embed_url's query string.
  const embedUrl = audio.embed_url?.replaceAll("&amp;", "&");
  const parsed = URL.parse(embedUrl ?? "");
  const host = parsed?.protocol === "https:" ? parsed.hostname : "";
  const domain = Object.keys(EMBED_DOMAINS).find((d) => host === d || host.endsWith(`.${d}`));
  if (embedUrl && domain) return { kind: "embed", provider: EMBED_DOMAINS[domain], embedUrl };
  // Files on other hosts are provider "tumblr" too.
  if (audio.provider === "tumblr" && audio.media) return { kind: "native", fileUrl: audio.media.url };
  return { kind: "link", provider: audio.provider ?? "tumblr", url: audio.url || postUrl };
}

// NPF has no HTML, so bodyHtml is rendered from text blocks: each reblog trail entry under its
// blog's name, then the post's own text.
// ponytail: text blocks only (no image blocks; list items render as paragraphs). Add them when needed.
function trailHtml({ blog, broken_blog_name, content }: Trail) {
  const html = blocksHtml(content);
  const name = blog ? `<a href="https://${blog.name}.tumblr.com/">${blog.name}</a>` : escapeHtml(broken_blog_name ?? "");
  return html && `<p>${name}:</p><blockquote>${html}</blockquote>`;
}

function blocksHtml(blocks: Block[]) {
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => {
      const tag = b.subtype === "heading1" ? "h2" : b.subtype === "heading2" ? "h3" : "p";
      const depth = b.subtype === "indented" ? (b.indent_level ?? 0) + 1 : 0;
      return "<blockquote>".repeat(depth) + `<${tag}>${inlineHtml(b)}</${tag}>` + "</blockquote>".repeat(depth);
    })
    .join("");
}

// Formatting ranges index code points and may overlap, so cut the text at every range edge and
// wrap each piece in every range that covers it.
function inlineHtml({ text = "", formatting = [] }: Block) {
  const chars = Array.from(text);
  const cuts = [...new Set([0, chars.length, ...formatting.flatMap((f) => [f.start, f.end])])].sort((a, b) => a - b);
  return cuts
    .slice(1)
    .map((end, i) => {
      const start = cuts[i];
      const piece = escapeHtml(chars.slice(start, end).join("")).replaceAll("\n", "<br>");
      return formatting.reduce((html, f) => (f.start <= start && end <= f.end ? wrap(f, html) : html), piece);
    })
    .join("");
}

const INLINE_TAGS: Record<string, string> = { bold: "b", italic: "i", strikethrough: "s", small: "small" };

function wrap(f: Formatting, html: string) {
  const href = f.type === "link" ? f.url : f.type === "mention" && f.blog ? `https://${f.blog.name}.tumblr.com/` : undefined;
  if (href) return `<a href="${escapeHtml(href)}">${html}</a>`;
  const tag = INLINE_TAGS[f.type];
  return tag ? `<${tag}>${html}</${tag}>` : html;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
