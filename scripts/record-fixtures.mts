// Records real Tumblr responses for the fixture blogs and writes scrubbed copies for the tests.
// Run by hand only, never in CI: `pnpm run record-fixtures`. See docs/adr/0001-tumblr-npf-format.md.
//
// Raw responses go to fixtures/raw/ (gitignored). A raw file that already exists is reused, not
// refetched, so re-running costs no API calls; delete a raw file to re-record it. Scrubbed copies go
// to fixtures/tumblr/ (committed), and nothing is written there if a fixture blog name or a
// FIXTURE_SCRUB string survives.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };
type Recording = {
  request: { blog: string; path: string; params: Record<string, string> };
  status: number;
  body: Json;
};

const root = join(import.meta.dirname, "..");
const rawDir = join(root, "fixtures/raw");
const outDir = join(root, "fixtures/tumblr");
process.loadEnvFile(join(root, ".env.local"));
const list = (s = "") => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const apiKey = process.env.TUMBLR_API_KEY ?? "";
const fixtureBlogs = list(process.env.FIXTURE_BLOGS);
const scrubStrings = list(process.env.FIXTURE_SCRUB); // e.g. the maintainer's artist name
if (!apiKey || fixtureBlogs.length !== 2) {
  throw new Error(".env.local needs TUMBLR_API_KEY and FIXTURE_BLOGS (main fixture blog, then secondary)");
}
const [mainBlog, secondaryBlog] = fixtureBlogs;
const PATH = "posts/audio";
const PARAMS = { npf: "true", reblog_info: "true", limit: "20" };

// Fetches one request (or reuses its raw file). Returns undefined, saving nothing, when the
// status isn't what the fixture is for: e.g. the private fixture while that blog is still public.
async function record(name: string, blog: string, params: Record<string, string>, expectOk: boolean) {
  const file = join(rawDir, `${name}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Recording;
  const all = { ...PARAMS, ...params };
  const url = `https://api.tumblr.com/v2/blog/${blog}.tumblr.com/${PATH}?${new URLSearchParams({ ...all, api_key: apiKey })}`;
  const res = await fetch(url, { headers: { "User-Agent": "audiopost (+https://github.com/cwfreelance/audiopost)" } });
  const recording: Recording = { request: { blog, path: PATH, params: all }, status: res.status, body: await res.json() };
  if (res.ok !== expectOk) {
    console.warn(`${name}: got HTTP ${res.status}, not recorded`);
    return undefined;
  }
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(file, JSON.stringify(recording, null, 2) + "\n");
  console.log(`${name}: recorded HTTP ${res.status}`);
  return recording;
}

const lastTimestamp = (r: Recording) =>
  String((r.body as { response: { posts: { timestamp: number }[] } }).response.posts.at(-1)!.timestamp);

// Two consecutive pages of the main fixture blog in each sort order, the secondary fixture blog's
// embed posts (recorded while it was public), a nonexistent blog, and the secondary blog once private.
const names: string[] = [];
async function add(name: string, blog: string, params: Record<string, string>, expectOk: boolean) {
  const r = await record(name, blog, params, expectOk);
  if (r) names.push(name);
  return r;
}
const newest1 = await add("main-newest-1", mainBlog, {}, true);
if (newest1) await add("main-newest-2", mainBlog, { before: lastTimestamp(newest1) }, true);
const oldest1 = await add("main-oldest-1", mainBlog, { sort: "asc" }, true);
if (oldest1) await add("main-oldest-2", mainBlog, { sort: "asc", after: lastTimestamp(oldest1) }, true);
await add("secondary-newest-1", secondaryBlog, {}, true);
await add("not-found", "audiopost-no-such-blog-0000", {}, false);
await add("private", secondaryBlog, {}, false);

// The fields the normalizer reads; everything else is dropped (avatars, titles, descriptions,
// uuids, embed_html, themes, ...). `true` keeps a value as is; an object keeps only its keys;
// arrays are kept element by element.
type Keep = true | { [key: string]: Keep };
const block: Keep = {
  type: true, subtype: true, text: true, indent_level: true,
  formatting: { type: true, start: true, end: true, url: true, hex: true, blog: { name: true } },
  provider: true, url: true, title: true, artist: true, album: true, embed_url: true,
  media: { url: true }, poster: { url: true },
};
const KEEP: Keep = {
  meta: true,
  errors: { title: true, code: true, detail: true },
  response: {
    blog: { name: true, url: true },
    total_posts: true,
    posts: {
      id_string: true, post_url: true, timestamp: true, reblogged_from_name: true,
      content: block,
      trail: { blog: { name: true }, broken_blog_name: true, content: block },
    },
  },
};
function pick(value: Json, keep: Keep): Json {
  if (keep === true || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => pick(v, keep));
  return Object.fromEntries(Object.entries(value).filter(([k]) => k in keep).map(([k, v]) => [k, pick(v, keep[k])]));
}

// Stable fakes for anything that could be searched back to the maintainer, replaced in every string,
// URLs included: blog usernames → blog-1, blog-2, ... (fixture blogs first); every post ID, and the
// maintainer's own tracks' slugs and track IDs → fakes of the same shape. FIXTURE_SCRUB strings
// become artist-1, ... further down.
const TUMBLR_HOSTS = new Set(["www", "api", "a", "assets", "static", "media"]);
const fakes = new Map<string, string>();
const counts = { blog: 0, id: 0, track: 0, album: 0 };
const fake = (secret: string, make: () => string, map = fakes) => {
  const key = secret.toLowerCase();
  if (!map.has(key)) map.set(key, make());
  return map.get(key)!;
};
const learn = (name: string) => {
  if (/^[a-z0-9-]+$/i.test(name) && !TUMBLR_HOSTS.has(name.toLowerCase())) fake(name, () => `blog-${++counts.blog}`);
};
const fakeId = (id: string) => fake(id, () => "1" + String(++counts.id).padStart(id.length - 1, "0"));
fixtureBlogs.forEach(learn);

// Post text (captions, lyrics, reblog comments) is copied verbatim from public posts, so a web search
// for any sentence finds the post. Letters become x/X and digits 0, keeping the length, so
// `formatting` ranges still line up.
const mask = (s: string) => s.replace(/\p{L}|\p{N}/gu, (c) => (/\p{N}/u.test(c) ? "0" : c === c.toLowerCase() ? "x" : "X"));
// The maintainer's own track: its artist is a FIXTURE_SCRUB string, or it links a fixture blog's
// own Bandcamp or SoundCloud. Its title and album become track-N / album-N (on the block only, the
// text being masked anyway), its URL slugs track-N too, its track IDs fakes, and its art URLs zeros.
const ownLink = new RegExp(
  `(?:^|[^a-z0-9-])(?:${fixtureBlogs.join("|")})\\.bandcamp\\.com|soundcloud\\.com(?:/|%2f)(?:${fixtureBlogs.join("|")})(?:/|%2f)`,
  "i",
);
const titles = new Map<string, string>();
const fakeTitle = (kind: "track" | "album", value: string) => fake(`${kind}:${value}`, () => `${kind}-${++counts[kind]}`, titles);
const SLUGS = [/bandcamp\.com\/track\/([a-z0-9-]+)/gi, /(?:\/|%2f)soundcloud\.com(?:\/|%2f)[\w-]+(?:\/|%2f)([a-z0-9-]+)/gi];
const IDS = [/track(?:_id)?=(\d+)/gi, /tracks(?:\/|%2f)(\d+)/gi, /spotify\.com(?:\/|%2f)track(?:\/|%2f)([a-z0-9]+)/gi];
function scrubPost(post: Obj) {
  fakeId(post.id_string as string);
  post.post_url = (post.post_url as string).replace(/(\/post\/\d+)\/[^/?#]*/, "$1"); // the slug repeats the caption
  const trail = post.trail as Obj[];
  for (const b of [post.content, ...trail.map((t) => t.content)].flat() as Obj[]) {
    if (typeof b.text === "string") b.text = mask(b.text);
    if (b.type !== "audio") continue;
    const urls = [b.url, b.embed_url, (b.media as Obj | undefined)?.url].filter((u): u is string => typeof u === "string");
    const artist = String(b.artist ?? "").toLowerCase();
    if (!scrubStrings.some((s) => artist.includes(s)) && !urls.some((u) => ownLink.test(u))) continue;
    const track = b.title ? fakeTitle("track", b.title as string) : `track-${++counts.track}`;
    if (b.title) b.title = track;
    if (b.album) b.album = fakeTitle("album", b.album as string);
    // The art is the maintainer's own cover; a reverse image search would find it. Zero its hashes.
    for (const p of (b.poster as Obj[] | undefined) ?? []) {
      p.url = (p.url as string).replace(/[a-z0-9_-]{12,}/gi, (s) => s.replace(/[a-z0-9]/gi, "0"));
    }
    for (const u of urls) {
      for (const re of SLUGS) for (const m of u.matchAll(re)) fake(m[1], () => track);
      for (const re of IDS) for (const m of u.matchAll(re)) fakeId(m[1]);
    }
  }
}
function collect(value: Json, key = "") {
  if (typeof value === "string") {
    if (["name", "blog", "reblogged_from_name", "broken_blog_name"].includes(key)) learn(value);
    for (const m of value.matchAll(/(?<![a-z0-9.-])(?:www\.)?([a-z0-9-]+)\.tumblr\.com/gi)) learn(m[1]);
    for (const m of value.matchAll(/www\.tumblr\.com\/(?:blog\/(?:view\/)?)?([a-z0-9-]+)/gi)) learn(m[1]);
    for (const m of value.matchAll(/\/post\/(\d+)/g)) fakeId(m[1]);
  } else if (Array.isArray(value)) value.forEach((v) => collect(v));
  else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => collect(v, k));
}

const scrubbed = names.map((name) => {
  const r = JSON.parse(readFileSync(join(rawDir, `${name}.json`), "utf8")) as Recording;
  const body = pick(r.body, KEEP) as { response?: { posts?: Obj[] } };
  body.response?.posts?.forEach(scrubPost);
  return { name, recording: { ...r, body } as Json };
});
scrubbed.forEach((s) => collect(s.recording));
// Fixture blog names and FIXTURE_SCRUB strings are replaced anywhere, even inside a longer word (the
// guard below is a plain substring search); a FIXTURE_SCRUB string also in slug or URL form
// ("first-last", "first%20last"). Other fakes only as whole tokens, so a short one doesn't mangle
// ordinary words; a token right after a %-escape counts as whole (URL-encoded links in embed URLs).
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const longestFirst = (keys: string[]) => [...keys].sort((a, b) => b.length - a.length).map(escape).join("|");
const swap = (m: string) => fakes.get(m.toLowerCase())!;
const others = [...fakes.keys()].filter((k) => !fixtureBlogs.includes(k));
const patterns: [RegExp, (m: string) => string][] = [
  [new RegExp(longestFirst(fixtureBlogs), "gi"), swap],
  ...scrubStrings.map((s, i): [RegExp, () => string] => [
    new RegExp(s.split(/\s+/).map(escape).join("(?:[\\s_+-]|%20)*"), "gi"),
    () => `artist-${i + 1}`,
  ]),
];
if (others.length) {
  patterns.push([new RegExp(`(?:(?<![a-z0-9-])|(?<=%[0-9a-f]{2}))(?:${longestFirst(others)})(?![a-z0-9-])`, "gi"), swap]);
}
const replace = (value: Json): Json =>
  typeof value === "string" ? patterns.reduce((s, [p, f]) => s.replace(p, f), value)
  : Array.isArray(value) ? value.map(replace)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]))
  : value;
const output = scrubbed.map(({ name, recording }) => ({ name, text: JSON.stringify(replace(recording), null, 2) + "\n" }));

// Guard: refuse to write anything if a fixture blog name, a FIXTURE_SCRUB string (in any of its
// slug or URL forms), or the API key survived.
const forbidden = [
  ...fixtureBlogs,
  ...scrubStrings.flatMap((s) => [s, ...["-", "_", "+", "%20", ""].map((sep) => s.replace(/\s+/g, sep))]),
  apiKey.toLowerCase(),
];
const leaks = output.filter(({ text }) => forbidden.some((f) => text.toLowerCase().includes(f)));
if (leaks.length) {
  console.error(`Refusing to write: a fixture blog name, FIXTURE_SCRUB string, or the API key survived in ${leaks.map((l) => l.name).join(", ")}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
for (const { name, text } of output) writeFileSync(join(outDir, `${name}.json`), text);
console.log(`Wrote ${output.length} scrubbed fixtures to fixtures/tumblr/ (${counts.blog} blogs, ${counts.id} IDs faked)`);
