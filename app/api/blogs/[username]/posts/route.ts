import { normalizePost, type ErrorResponse, type PostsResponse, type TumblrPost } from "@/lib/posts";
import { parseUsername } from "@/lib/username";

// The only code that talks to Tumblr, so the API key stays on the server. Never log or return the
// request URL or a fetch error's message: they can carry the key.
export async function GET(request: Request, ctx: RouteContext<"/api/blogs/[username]/posts">) {
  const username = parseUsername((await ctx.params).username);
  if (!username) return error(400, { code: "invalid_username" });

  const params = new URLSearchParams({
    api_key: process.env.TUMBLR_API_KEY ?? "",
    npf: "true",
    reblog_info: "true",
    limit: "20",
  });
  // The cursor is the next page's `before`.
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor) params.set("before", cursor);
  let res: Response | undefined;
  try {
    res = await fetch(`https://api.tumblr.com/v2/blog/${username}.tumblr.com/posts/audio?${params}`, {
      headers: { "User-Agent": "audiopost (+https://github.com/cwfreelance/audiopost)" },
    });
    if (res.ok) {
      const { response } = (await res.json()) as { response: TumblrResponse };
      // Tumblr's `before` is exclusive, so a page ending partway through a second would skip the
      // rest of that second (ADR 0001). A full page holds back its last second's posts instead,
      // and the next page starts with them.
      let posts = response.posts;
      let nextCursor: string | null = null;
      if (posts.length === 20) {
        const last = posts[19].timestamp;
        const earlier = posts.filter((post) => post.timestamp !== last);
        // ponytail: 20 posts from one second can't be held back, so the rest of that second is skipped.
        if (earlier.length) posts = earlier;
        nextCursor = String(earlier.length ? last + 1 : last);
      }
      const body: PostsResponse = {
        blog: {
          username,
          title: response.blog.title ?? "",
          avatarUrl: response.blog.avatar?.find((a) => a.width === 128)?.url ?? null,
          blogUrl: response.blog.url,
          totalAudioPosts: response.total_posts,
        },
        posts: posts.map(normalizePost),
        nextCursor,
      };
      // A later page's posts are long published, so it can be cached much longer than the first.
      const cache = cursor ? "s-maxage=86400" : "s-maxage=300, stale-while-revalidate=3600";
      return Response.json(body, { headers: { "Cache-Control": cache } });
    }
    if (res.status === 429) return error(429, { code: "rate_limited" });
    if (res.status === 404) {
      // A private blog is a 404 too, told apart by its error code (docs/adr/0001-tumblr-npf-format.md).
      const { errors } = (await res.json()) as { errors?: { code: number }[] };
      return errors?.[0]?.code === 4012 ? error(403, { code: "blog_private" }) : error(404, { code: "blog_not_found" });
    }
  } catch {
    // A network failure or a body we can't read: reported as upstream_error below.
  }
  return error(502, { code: "upstream_error", upstreamStatus: res?.status });
}

function error(status: number, error: ErrorResponse["error"]) {
  return Response.json({ error } satisfies ErrorResponse, { status, headers: { "Cache-Control": "no-store" } });
}

type TumblrResponse = {
  blog: { title?: string; url: string; avatar?: { width: number; url: string }[] };
  total_posts: number;
  posts: TumblrPost[];
};
