import { normalizePost, type ErrorResponse, type PostsResponse, type TumblrPost } from "@/lib/posts";
import { parseUsername } from "@/lib/username";

// The only code that talks to Tumblr, so the API key stays on the server. Never log or return the
// request URL or a fetch error's message: they can carry the key.
export async function GET(_request: Request, ctx: RouteContext<"/api/blogs/[username]/posts">) {
  const username = parseUsername((await ctx.params).username);
  if (!username) return error(400, { code: "invalid_username" });

  const params = new URLSearchParams({
    api_key: process.env.TUMBLR_API_KEY ?? "",
    npf: "true",
    reblog_info: "true",
    limit: "20",
  });
  let res: Response | undefined;
  try {
    res = await fetch(`https://api.tumblr.com/v2/blog/${username}.tumblr.com/posts/audio?${params}`, {
      headers: { "User-Agent": "audiopost (+https://github.com/cwfreelance/audiopost)" },
    });
    if (res.ok) {
      const { response } = (await res.json()) as { response: TumblrResponse };
      const body: PostsResponse = {
        blog: {
          username,
          title: response.blog.title ?? "",
          avatarUrl: response.blog.avatar?.find((a) => a.width === 128)?.url ?? null,
          blogUrl: response.blog.url,
          totalAudioPosts: response.total_posts,
        },
        posts: response.posts.map(normalizePost),
        nextCursor: null,
      };
      return Response.json(body, { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=3600" } });
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
