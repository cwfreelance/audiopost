// Seam 1, the posts API: request in, response out, with Tumblr's HTTP faked by the recorded,
// scrubbed fixtures in fixtures/tumblr/. Expected values are copied from the fixtures by hand.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import mainNewest from "@/fixtures/tumblr/main-newest-1.json";
import mainNewest2 from "@/fixtures/tumblr/main-newest-2.json";
import mainOldest from "@/fixtures/tumblr/main-oldest-1.json";
import mainOldest2 from "@/fixtures/tumblr/main-oldest-2.json";
import notFound from "@/fixtures/tumblr/not-found.json";
import privateBlog from "@/fixtures/tumblr/private.json";
import secondaryNewest from "@/fixtures/tumblr/secondary-newest-1.json";
import { GET } from "./route";

const API_KEY = "test-api-key-do-not-leak";

type Fixture = { status: number; body: unknown };

let tumblr: ReturnType<typeof vi.fn>;
function fakeTumblr(fixture: Fixture) {
  tumblr = vi.fn(async () => Response.json(fixture.body, { status: fixture.status }));
  vi.stubGlobal("fetch", tumblr);
}

// The blog's 40 newest posts, from two consecutive recorded pages, newest first.
const recorded = [...mainNewest.body.response.posts, ...mainNewest2.body.response.posts];
// The blog's 40 oldest posts, from two consecutive recorded pages, oldest first.
const recordedOldest = [...mainOldest.body.response.posts, ...mainOldest2.body.response.posts];

// Tumblr's paging over the recorded posts (given newest first): up to 20 published strictly between
// `after` and `before`, oldest first with `sort=asc`, else newest first.
function fakeTumblrPaging(posts: { timestamp: number }[] = [...recorded, ...recordedOldest.toReversed()]) {
  tumblr = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams;
    const before = Number(params.get("before") ?? Infinity);
    const after = Number(params.get("after") ?? -Infinity);
    const sorted = params.get("sort") === "asc" ? posts.toReversed() : posts;
    const page = sorted.filter((post) => post.timestamp < before && post.timestamp > after).slice(0, 20);
    return Response.json({ response: { ...mainNewest.body.response, posts: page } });
  });
  vi.stubGlobal("fetch", tumblr);
}

async function getPosts(username: string, query: Record<string, string> = {}) {
  const res = await GET(new Request(`http://localhost/api/blogs/${username}/posts?${new URLSearchParams(query)}`), {
    params: Promise.resolve({ username }),
  });
  return { res, text: await res.clone().text(), body: await res.json() };
}

// The first two pages, fetched the way the page does (the second with the first's cursor): their
// post ids, and the cursor the second ends with.
async function getTwoPages(query: Record<string, string> = {}) {
  const first = await getPosts("blog-1", query);
  const second = await getPosts("blog-1", { ...query, cursor: first.body.nextCursor });
  const ids = [...first.body.posts, ...second.body.posts].map((post: { id: string }) => post.id);
  return { ids, nextCursor: second.body.nextCursor };
}

async function getPost(username: string, id: string) {
  const { body } = await getPosts(username);
  return body.posts.find((post: { id: string }) => post.id === id);
}

beforeEach(() => {
  vi.stubEnv("TUMBLR_API_KEY", API_KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("returns the blog and its newest audio posts, newest first", async () => {
  const fixture = structuredClone(mainNewest);
  // The recorded fixtures drop the blog's title and avatar (privacy), so add them back here.
  Object.assign(fixture.body.response.blog, {
    title: "A Blog Title",
    avatar: [
      { width: 512, height: 512, url: "https://64.media.tumblr.com/avatar_512.png" },
      { width: 128, height: 128, url: "https://64.media.tumblr.com/avatar_128.png" },
      { width: 64, height: 64, url: "https://64.media.tumblr.com/avatar_64.png" },
    ],
  });
  fakeTumblr(fixture);

  const { res, body } = await getPosts(" Blog-1 ");

  expect(res.status).toBe(200);
  expect(body.blog).toEqual({
    username: "blog-1",
    title: "A Blog Title",
    avatarUrl: "https://64.media.tumblr.com/avatar_128.png",
    blogUrl: "https://blog-1.tumblr.com/",
    totalAudioPosts: 466,
  });
  // Tumblr's 20 minus the last, whose second is held back for the next page.
  expect(body.posts).toHaveLength(19);
  expect(body.posts[0].id).toBe("10000000001");
  expect(body.posts[18].id).toBe("10000000020");
});

test("asks Tumblr for 20 NPF audio posts with the API key and the app's User-Agent", async () => {
  fakeTumblr(mainNewest);

  await getPosts("blog-1");

  expect(tumblr).toHaveBeenCalledOnce();
  const [url, init] = tumblr.mock.calls[0] as [string, RequestInit];
  const { origin, pathname, searchParams } = new URL(url);
  expect(origin + pathname).toBe("https://api.tumblr.com/v2/blog/blog-1.tumblr.com/posts/audio");
  expect(Object.fromEntries(searchParams)).toEqual({
    api_key: API_KEY,
    npf: "true",
    reblog_info: "true",
    limit: "20",
  });
  expect(new Headers(init.headers).get("User-Agent")).toBe(
    "audiopost (+https://github.com/cwfreelance/audiopost)",
  );
});

test("a junk sort, window, or cursor is ignored, never passed on to Tumblr", async () => {
  fakeTumblr(mainNewest);

  const { res, body } = await getPosts("blog-1", {
    sort: "sideways",
    from: "1e9",
    to: "-5",
    cursor: "1340653536&api_key=other",
  });

  expect(body.posts).toHaveLength(19);
  expect(Object.fromEntries(new URL(tumblr.mock.calls[0][0]).searchParams)).toEqual({
    api_key: API_KEY,
    npf: "true",
    reblog_info: "true",
    limit: "20",
  });
  expect(res.headers.get("Cache-Control")).toBe("s-maxage=300, stale-while-revalidate=3600");
});

test("a successful response is cached at the edge", async () => {
  fakeTumblr(mainNewest);

  const { res } = await getPosts("blog-1");

  expect(res.headers.get("Cache-Control")).toBe("s-maxage=300, stale-while-revalidate=3600");
});

test("the next page picks up where the last ended, with no post skipped or repeated", async () => {
  fakeTumblrPaging();

  // Each full page holds back its last second for the next, so two pages are the 38 newest posts.
  expect((await getTwoPages()).ids).toEqual(recorded.slice(0, 38).map((post) => post.id_string));
});

test("posts sharing a second across a page boundary all appear, once", async () => {
  const posts = structuredClone(recorded);
  // The first recorded page's last two posts and the second's first, published in the same second.
  posts[18].timestamp = posts[20].timestamp = 1340653536;
  fakeTumblrPaging(posts);

  expect((await getTwoPages()).ids).toEqual(posts.slice(0, 37).map((post) => post.id_string));
});

test("a full page from a single second is returned whole, and the next page moves past that second", async () => {
  const posts = structuredClone(recorded);
  for (const post of posts.slice(0, 20)) post.timestamp = 1340653536;
  fakeTumblrPaging(posts);

  expect((await getTwoPages()).ids).toEqual(posts.slice(0, 39).map((post) => post.id_string));
});

test("oldest first pages forward from the blog's first post, with no post skipped or repeated", async () => {
  fakeTumblrPaging();

  // Each full page holds back its last second for the next, so two pages are the 38 oldest posts.
  expect((await getTwoPages({ sort: "oldest" })).ids).toEqual(recordedOldest.slice(0, 38).map((post) => post.id_string));
});

// A window is [from, to): a post published at `from` is in it, one published at `to` is not.
test("newest first returns the window's posts from just before `to` down to `from`, then ends", async () => {
  fakeTumblrPaging();
  const window = { from: String(recorded[29].timestamp), to: String(recorded[2].timestamp) };

  const { ids, nextCursor } = await getTwoPages(window);

  expect(ids).toEqual(recorded.slice(3, 30).map((post) => post.id_string));
  expect(nextCursor).toBeNull();
});

test("oldest first returns the window's posts from `from` up to just before `to`, then ends", async () => {
  fakeTumblrPaging();
  const window = { from: String(recordedOldest[2].timestamp), to: String(recordedOldest[29].timestamp) };

  const { ids, nextCursor } = await getTwoPages({ sort: "oldest", ...window });

  expect(ids).toEqual(recordedOldest.slice(2, 29).map((post) => post.id_string));
  expect(nextCursor).toBeNull();
});

test("a short page from Tumblr is the last page", async () => {
  fakeTumblr(secondaryNewest);

  const { body } = await getPosts("blog-2");

  expect(body.posts.map((post: { id: string }) => post.id)).toEqual([
    "100000000000000082",
    "100000000000000083",
    "10000085",
  ]);
  expect(body.nextCursor).toBeNull();
});

test("a later page, fetched with a cursor, is cached at the edge for a day", async () => {
  fakeTumblrPaging();
  const { body } = await getPosts("blog-1");

  const { res } = await getPosts("blog-1", { cursor: body.nextCursor });

  expect(res.headers.get("Cache-Control")).toBe("s-maxage=86400");
});

test.each(["bad_name", "no!", "a".repeat(33), "blog.tumblr.com", "@blog-1"])(
  "an invalid username (%s) gets a 400 without calling Tumblr",
  async (username) => {
    fakeTumblr(mainNewest);

    const { res, body } = await getPosts(username);

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: { code: "invalid_username" } });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(tumblr).not.toHaveBeenCalled();
  },
);

test("a blog Tumblr can't find is a 404 blog_not_found, never cached", async () => {
  fakeTumblr(notFound);

  const { res, body } = await getPosts("blog-12");

  expect(res.status).toBe(404);
  expect(body).toEqual({ error: { code: "blog_not_found" } });
  expect(res.headers.get("Cache-Control")).toBe("no-store");
});

test("a blog hidden from logged-out visitors is a 403 blog_private, never cached", async () => {
  fakeTumblr(privateBlog);

  const { res, body } = await getPosts("blog-2");

  expect(res.status).toBe(403);
  expect(body).toEqual({ error: { code: "blog_private" } });
  expect(res.headers.get("Cache-Control")).toBe("no-store");
});

test("Tumblr's 429 is a 429 rate_limited, never cached", async () => {
  fakeTumblr({ status: 429, body: { meta: { status: 429, msg: "Limit Exceeded" }, response: [] } });

  const { res, body } = await getPosts("blog-1");

  expect(res.status).toBe(429);
  expect(body).toEqual({ error: { code: "rate_limited" } });
  expect(res.headers.get("Cache-Control")).toBe("no-store");
});

test("a Tumblr 5xx is a 502 upstream_error carrying Tumblr's status, never cached", async () => {
  tumblr = vi.fn(async () => new Response("<html>Service Unavailable</html>", { status: 503 }));
  vi.stubGlobal("fetch", tumblr);

  const { res, body } = await getPosts("blog-1");

  expect(res.status).toBe(502);
  expect(body).toEqual({ error: { code: "upstream_error", upstreamStatus: 503 } });
  expect(res.headers.get("Cache-Control")).toBe("no-store");
});

test("a network failure is a 502 upstream_error without a status, never cached", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  const { res, body } = await getPosts("blog-1");

  expect(res.status).toBe(502);
  expect(body).toEqual({ error: { code: "upstream_error" } });
  expect(res.headers.get("Cache-Control")).toBe("no-store");
});

test("the API key never appears in a response", async () => {
  const texts: string[] = [];
  fakeTumblr(mainNewest);
  texts.push((await getPosts("blog-1")).text);
  fakeTumblr(notFound);
  texts.push((await getPosts("blog-12")).text);
  // Even when the failure's own message carries the request URL.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError(`fetch failed: ?api_key=${API_KEY}`)));
  texts.push((await getPosts("blog-1")).text);

  for (const text of texts) expect(text).not.toContain(API_KEY);
});

test("a file hosted on Tumblr is a native track, with the track's metadata and art", async () => {
  fakeTumblr(mainNewest);

  const post = await getPost("blog-1", "10000000002");

  expect(post).toEqual({
    id: "10000000002",
    postUrl: "https://blog-1.tumblr.com/post/10000000002",
    publishedAt: 1373135413,
    title: "Ain't Good Enough for You",
    artist: "Bruce Springsteen",
    album: "The Promise",
    artUrl: "https://64.media.tumblr.com/tumblr_mpj22dw8x01qznoqao1_1373135415_cover.jpg",
    bodyHtml: expect.any(String),
    track: {
      kind: "native",
      fileUrl: "https://a.tumblr.com/tumblr_mpj22dw8x01qznoqao1.mp3?play_key=e6ba8f023e92bbb5aaf06052cd0c6551",
    },
  });
});

test("a file hosted elsewhere is still a native track", async () => {
  fakeTumblr(mainOldest2);

  const post = await getPost("blog-1", "10000066");

  expect(post.track).toEqual({
    kind: "native",
    fileUrl: "https://www.filefreak.com/pfiles/81857/Spiders%20%28Kidsmoke%29.mp3?play_key=e6ba8f023e92bbb5aaf06052cd0c6551",
  });
});

test("SoundCloud, Spotify, and Bandcamp posts are embed tracks with the provider's player URL", async () => {
  fakeTumblr(mainNewest);
  expect((await getPost("blog-1", "10000000003")).track).toEqual({
    kind: "embed",
    provider: "soundcloud",
    embedUrl:
      "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fchartroommedia%2Fsarah-lee-guthrie-and-johnny&visual=true&liking=false&sharing=false&auto_play=false&show_comments=false&continuous_play=false&origin=tumblr",
  });

  fakeTumblr(secondaryNewest);
  const { body } = await getPosts("blog-2");
  expect(body.posts.map((post: { track: unknown }) => post.track)).toEqual([
    {
      kind: "embed",
      provider: "spotify",
      embedUrl:
        "https://open.spotify.com/embed?uri=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F1h0R5cstHZ070tevUAfEo7&view=coverart",
    },
    {
      kind: "embed",
      provider: "bandcamp",
      embedUrl:
        "https://bandcamp.com/EmbeddedPlayer/size=medium/bgcol=ffffff/linkcol=0687f5/notracklist=true/transparent=true/track=1000000084/",
    },
    {
      kind: "native",
      fileUrl: "https://a.tumblr.com/wkdTW9Ayrmcgrmp0mBdxUeHYo1.mp3?play_key=e6ba8f023e92bbb5aaf06052cd0c6551",
    },
  ]);
});

test("a post without a track title is titled Untitled, and empty metadata counts as missing", async () => {
  fakeTumblr(mainNewest);
  const untitled = await getPost("blog-1", "10000000013");
  expect([untitled.title, untitled.artist, untitled.album]).toEqual(["Untitled", undefined, undefined]);

  fakeTumblr(mainNewest2);
  const emptyTitle = await getPost("blog-1", "1000000037");
  expect([emptyTitle.title, emptyTitle.artist, emptyTitle.album]).toEqual(["Untitled", "artist-1", undefined]);
});

test("a reblog names the blog it was reblogged from and plays the track from the reblog trail", async () => {
  fakeTumblr(mainNewest);
  expect(await getPost("blog-1", "10000000018")).toMatchObject({
    rebloggedFrom: "blog-3",
    title: "Short-lived",
    artist: "The Greatest Actor",
    track: {
      kind: "native",
      fileUrl: "https://a.tumblr.com/tumblr_m6iozocK4q1rww885o1.mp3?play_key=e6ba8f023e92bbb5aaf06052cd0c6551",
    },
  });

  // Reblogged from blog-5, whose own post was a reblog of blog-6's.
  fakeTumblr(mainNewest2);
  expect(await getPost("blog-1", "1000000039")).toMatchObject({
    rebloggedFrom: "blog-5",
    track: { kind: "embed", provider: "soundcloud" },
  });
});

test("a reblog whose source wasn't recorded falls back to the trail's root blog", async () => {
  fakeTumblr(mainOldest2);

  expect((await getPost("blog-1", "10000075")).rebloggedFrom).toBe("blog-1");
});

test("bodyHtml renders the caption's text, formatting, links, and indents as HTML", async () => {
  fakeTumblr(mainNewest2);

  expect((await getPost("blog-1", "1000000036")).bodyHtml).toBe(
    '<p><a href="http://blog-4.tumblr.com/post/1000000086">xxxxxxxxxxxxxxx</a>:</p>' +
      "<blockquote><p>Xxx Xx - Xxxxxx’x Xxxxx Xx Xxxxx</p></blockquote>" +
      "<p>Xxxx xx xxxxxxx.</p>",
  );
});

test("bodyHtml escapes the caption's text", async () => {
  fakeTumblr(mainNewest);

  const { bodyHtml } = await getPost("blog-1", "10000000015");

  expect(bodyHtml).toContain("<p><b>Xxxx &amp; Xxxx - Xxxxx Xxxxxxx (Xxxxx Xxxxxx Xxxxx)</b></p>");
  expect(bodyHtml).toContain("Xx xxxx &quot;xxxxx&quot; xxx");
});

test("bodyHtml puts the reblog trail first, under its blog's name, then the reblogger's text", async () => {
  fakeTumblr(mainNewest);

  const { bodyHtml } = await getPost("blog-1", "10000000018");

  const start =
    '<p><a href="https://blog-3.tumblr.com/">blog-3</a>:</p>' +
    "<blockquote><p>Xxxxx xxx xx xxxxx xxxxx.</p><blockquote><p><b>XXXXX-XXXXX</b></p></blockquote>";
  const end =
    "<blockquote><p><i>xx.<br>xxxx xx xx</i><br><i>xxxxx xx xx</i><br><i>xxxx xx xx</i><br><i>xxxxx xx xx</i></p></blockquote>" +
    "</blockquote><p>Xxxx xx xxxx xxxx X xxxxxx xx 0 xx xxx xxxxxxx! Xxxxxxx xxxxx!</p>";
  expect(bodyHtml.slice(0, start.length)).toBe(start);
  expect(bodyHtml.slice(-end.length)).toBe(end);
});

test("an embed whose host isn't SoundCloud, Spotify, or Bandcamp becomes a link track", async () => {
  const fixture = structuredClone(secondaryNewest);
  const spotify = fixture.body.response.posts[0].content[1] as { embed_url: string };
  spotify.embed_url = "https://open.spotify.com.evil.example/embed?uri=spotify";
  fakeTumblr(fixture);

  const post = await getPost("blog-2", "100000000000000082");

  expect(post.track).toEqual({
    kind: "link",
    provider: "spotify",
    url: "https://open.spotify.com/track/1h0R5cstHZ070tevUAfEo7",
  });
});
