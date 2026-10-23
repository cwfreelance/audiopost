# Read Tumblr posts in Neue Post Format, and what the spike found

The posts API asks Tumblr for audio posts with `npf=true&reblog_info=true&limit=20` and normalizes Neue Post Format (NPF), not the legacy format. Only NPF exposes every track the same way: one `audio` block with `provider`, `media.url`, `embed_url`, `title`, `artist`, `album`, and `poster[].url`, whether the post is a 2009 audio post or one made in today's editor. The price is that NPF has no HTML, so the normalizer renders `bodyHtml` itself from text blocks instead of passing Tumblr's HTML through.

Measured on 2026-10-23 against all 466 audio posts on the main fixture blog and all 3 on the secondary fixture blog, in both formats.

## Considered options

- **Legacy format.** Its `caption` is ready-made HTML with the whole reblog chain, and for audio posts made in the old editor its `audio_url`, `track_name`, `artist`, `album`, and `album_art` carry the same data as NPF. But posts made in the current editor (every Spotify and Bandcamp post, `is_blocks_post_format: true`) come back as `type: "text"`, with the track only inside a `<figure data-npf='…'>` attribute in `body`, double HTML-escaped, and with a `poster` that has a `media_key` but no URL, so there's no art. SoundCloud's embed URL is only inside the `player` iframe HTML.
- **Both formats per page.** Doubles API calls against a 1,000/hour, 5,000/day key. Rejected.

## Answers

- **Nonexistent blog:** HTTP `404`, body `{"meta":{"status":404,"msg":"Not Found"},"errors":[{"title":"Not Found","code":0,"detail":"…"}],"response":[]}`, the same in both formats. `detail` is random flavor text ("Hit a snag. Try again.", "Tumblr went thud. Try again.").
- **Private blog:** also HTTP `404` with the same `meta`, so the status alone can't tell it from a nonexistent blog. The difference is `errors[0].code`: `4012`, with `detail` "This Tumblr is only viewable within the Tumblr dashboard", against `0` for a nonexistent blog. Map a 404 with code `4012` to `blog_private`, and any other 404 to `blog_not_found`. Recorded with the secondary fixture blog set to "Hide from people without an account"; a password-protected blog was not tried.
- **Paging works as documented, with exclusive bounds.** `before=T` returns posts published strictly before `T`, newest first; `sort=asc&after=T` returns posts strictly after `T`, oldest first. Chaining 24 pages each way with the last post's timestamp returned all 466 posts once each, with no gaps or repeats; `before=T+1` and `after=T-1` return the post at `T`. `after` without `sort=asc` returns the newest posts, so oldest-first needs both. `response.total_posts` is the blog's audio-post count whatever `before`/`after` say.
- **Same-second straddling** can happen in principle, since a page is a fixed 20 posts, but was not seen: no two audio posts on either fixture blog share a second. Because the bounds are exclusive, a straddle would skip the rest of that second's posts, not repeat them, so de-duplicating by ID alone doesn't cover it. To cover it, page on from the boundary second inclusively (`before=cursor+1`, `after=cursor-1`) and drop the IDs already returned. More than 20 posts in one second would then repeat the same page forever.
  - **What the posts API does instead:** when Tumblr returns a full page, the API holds back every post from that page's last second, and `nextCursor` makes the next page start inclusively at that second (`before=cursor`, where the cursor is that second plus one). The cursor carries no post IDs, and nothing is skipped or repeated. The price is that a full page returns 19 posts, or fewer when several share the last second. If all 20 posts share one second, the page is returned whole and the rest of that second is skipped, instead of looping.
- **Window edges.** A window is `[from, to)`. Newest-first's first page is `before=to`. Oldest-first's first page is `sort=asc&after=from-1`, because `after=from` would drop posts published at exactly `from`.
- **NPF-created audio posts appear under the `audio` filter.** Both posts the maintainer made in today's editor (a Spotify one and a Bandcamp one) are returned by `/posts/audio`; none of the secondary fixture blog's other 43 posts has an audio block.
- **Reblog chain.** Every reblog on the fixture blogs (85 of 466 posts, all old) has exactly one `trail` entry, the root post, which holds the audio block, so the track can be in `trail[0].content` rather than `content`. The rest of the chain is text blocks: in that trail entry's `content`, or, for older reblogs, in the reblogger's own `content` as `indented` blocks nested by `indent_level`, each after a `name:` block linking that blog. A trail entry from a deactivated blog has `broken_blog_name` instead of `blog`. Neither fixture blog has a modern reblog with several trail entries, so the fixtures don't include one.

## What the normalizer reads

- `id_string`, never `id`: post IDs exceed JavaScript's safe integers (`831177547463229441` parses as `831177547463229400`).
- `post_url`, `timestamp`, `response.total_posts`, `response.blog.name` and `.url`. The blog's title and avatar are in the response but dropped from the fixtures by the privacy rules.
- `rebloggedFrom`: `reblogged_from_name`, which needs `reblog_info=true` and is missing on 35 of the 85 reblogs (sources since deleted or renamed); fall back to `trail[0].blog.name`, then `trail[0].broken_blog_name`. The fallback names the root, which isn't always the blog reblogged from.
- The first `audio` block in `content`, else in `trail[].content`:
  - `provider` is `tumblr`, `soundcloud`, `spotify`, or `bandcamp`. Files on other hosts are also `provider: "tumblr"`, so a native track is Tumblr-hosted only when `media.url`'s host is `a.tumblr.com` (all 399 Tumblr-hosted files); 65 posts point at hosts like filefreak.com.
  - Check the provider allowlist before `media`: Bandcamp blocks have both an `embed_url` and a `media.url` (`bandcamp.com/stream_redirect`), and SoundCloud blocks have an `api.soundcloud.com` stream URL.
  - `embed_url` is HTML-escaped for Spotify and SoundCloud (`&amp;` between query parameters); decode it before parsing.
  - `media.url` carries an added `play_key` query parameter, and NPF upgrades `http` file URLs to `https`.
  - `title`, `artist`, `album` may be missing or `""`; treat `""` as missing. Neither format has an ID3 title (no post has legacy `id3_title`), so the title falls back straight to "Untitled". `poster[0].url` is the art.
- Text blocks for `bodyHtml`, trail first, then `content`: `text`, `subtype` (`heading1` and `indented` seen), `indent_level`, and `formatting` ranges (`bold`, `italic`, `strikethrough`, `link` seen).

## Fixtures

`pnpm run record-fixtures` (`scripts/record-fixtures.mts`) records into `fixtures/raw/` (gitignored) and writes scrubbed copies to `fixtures/tumblr/`, each `{ request, status, body }`. A raw file that exists is reused, so the secondary fixture blog's public posts survive it going private. Only the fields above are kept, and nothing in them should lead a web search back to the maintainer:

- Blog usernames become `blog-1` (main fixture blog), `blog-2` (secondary fixture blog), `blog-3`…, and the strings in `FIXTURE_SCRUB` (`.env.local`; the maintainer's artist name) become `artist-1`…, everywhere, URLs included.
- Text block `text` is masked (letters to `x`/`X`, digits to `0`) at its original length, so `formatting` ranges still line up. This departs from the spec's "captions are kept as written": every caption is verbatim from a public post, so searching any sentence would find it.
- Post IDs are replaced by fakes of the same length everywhere, and `post_url` slugs are dropped.
- The maintainer's own tracks (an audio block whose artist is a `FIXTURE_SCRUB` string, or whose URLs point at a fixture blog's own Bandcamp or SoundCloud) get `track-N` / `album-N` titles, `track-N` URL slugs, fake Bandcamp, SoundCloud, and Spotify track IDs, and zeroed art URLs. Hosts and path shapes stay real, so the provider allowlist can still be tested.

The guard refuses to write anything if a fixture blog name, a `FIXTURE_SCRUB` string (also as `first-last`, `first_last`, `first+last`, `first%20last`, `firstlast`), or the API key survives.
