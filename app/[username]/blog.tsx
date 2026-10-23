"use client";
/* eslint-disable @next/next/no-img-element -- art and avatars load straight from Tumblr's CDN, lazily
   and natively; next/image would spend Vercel's image-optimization quota on them. */

import DOMPurify from "dompurify";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { UsernameForm } from "@/app/username-form";
import { playQueue, type PlayQueue, type QueueEvent, type TrackStatus } from "@/lib/play-queue";
import type { AudioPost, ErrorResponse, PostsResponse } from "@/lib/posts";
import { parseView } from "@/lib/view";
import styles from "./blog.module.css";
import { ViewControls } from "./view-controls";

// Post bodies are Tumblr HTML: links open in a new tab. DOMPurify only works in the browser, and
// cards only render there, after the posts arrive.
if (DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

// Fetched from the browser, not during server rendering, so repeat lookups come from the edge cache
// and the smoke test can fake the API.
export function Blog({ username }: { username: string }) {
  // The view's filter and sort come from the URL, and its window from the viewer's own timezone.
  const searchParams = useSearchParams();
  const view = parseView(`/${username}?${searchParams}`, Intl.DateTimeFormat().resolvedOptions().timeZone)!;
  const { from, to } = view.window;
  const query = new URLSearchParams({ sort: view.sort });
  if (from !== undefined) query.set("from", String(from));
  if (to !== undefined) query.set("to", String(to));
  const postsUrl = `/api/blogs/${username}/posts?${query}`;

  const [page, setPage] = useState<PostsResponse>();
  const [error, setError] = useState<BlogError>();
  const [moreError, setMoreError] = useState<BlogError>();
  const [attempt, setAttempt] = useState(0);
  // A new view starts over from its first page.
  const [shownUrl, setShownUrl] = useState(postsUrl);
  if (postsUrl !== shownUrl) {
    setShownUrl(postsUrl);
    setPage(undefined);
    setError(undefined);
    setMoreError(undefined);
  }
  // The one shared player: its source changes per track, because iOS only lets an audio element
  // that already exists start the next track with the screen locked.
  const audio = useRef<HTMLAudioElement>(null);
  // The card expanded because it's playing, kept apart from the cards opened with "▾ more".
  const [playExpanded, setPlayExpanded] = useState<string>();
  // The play queue decides what plays. `latest` mirrors it so events that arrive later (a page
  // loading, the lock screen's buttons) step from the queue as it is now, not as it was.
  const [queue, setQueue] = useState<PlayQueue>({ posts: [], more: false, statuses: {}, checks: [] });
  const latest = useRef(queue);
  const current = queue.current;

  // Steps the play queue and does what it says: checks the files it asks about, sending each result
  // back, and starts the track it's ready to play. A track usually starts inside the click, the
  // ended event, or the media key, which is what lets browsers start audio.
  const send = useCallback(function send(event: QueueEvent) {
    const prev = latest.current;
    const next = (latest.current = playQueue(prev, event));
    setQueue(next);
    for (const post of next.checks) {
      if (post.track.kind !== "native") continue;
      checkFile(post.track.fileUrl).then((status) => send({ type: "checked", post, status, now: Date.now() }));
    }
    const moved = next.current?.id !== prev.current?.id;
    // The card moved to expands the way a click does, so its status shows while its file is checked.
    if (moved && next.current) setPlayExpanded(next.current.id);
    const player = audio.current!;
    if (next.play?.track.kind === "native") {
      player.src = next.play.track.fileUrl;
      // A file that fails to load also fires the element's error event, which is where failures get handled.
      player.play().catch(() => {});
    } else if (moved) player.pause();
  }, []);

  // The queue's clock, while a track is waking: its countdown and its retry run off it.
  const waking = Object.values(queue.statuses).some((s) => s.status === "waking");
  useEffect(() => {
    if (!waking) return;
    const clock = setInterval(() => send({ type: "tick", now: Date.now() }), 1000);
    return () => clearInterval(clock);
  }, [waking, send]);

  useEffect(() => {
    let stale = false;
    fetch(postsUrl)
      .then((res) => res.json() as Promise<PostsResponse | ErrorResponse>)
      .catch((): ErrorResponse => ({ error: { code: "network_error" } }))
      .then((body) => {
        if (stale) return;
        if ("error" in body) return setError({ ...body.error, at: new Date().toISOString() });
        setPage(body);
        send({ type: "posts", posts: body.posts, more: !!body.nextCursor });
      });
    return () => {
      stale = true;
    };
  }, [postsUrl, attempt, send]);

  // Loads the next page, once per cursor: both the end of the list nearing the viewport and the
  // play queue running low ask for it. A new view drops a page still loading for the old one.
  const cursor = page?.nextCursor;
  const loading = useRef<string>(undefined);
  useEffect(
    () => () => {
      loading.current = undefined;
    },
    [postsUrl],
  );
  const loadMore = useEffectEvent(() => {
    if (!cursor || moreError) return;
    const url = `${postsUrl}&cursor=${encodeURIComponent(cursor)}`;
    if (loading.current === url) return;
    loading.current = url;
    fetch(url)
      .then((res) => res.json() as Promise<PostsResponse | ErrorResponse>)
      .catch((): ErrorResponse => ({ error: { code: "network_error" } }))
      .then((next) => {
        if (loading.current !== url) return;
        if ("error" in next) {
          loading.current = undefined;
          return setMoreError({ ...next.error, at: new Date().toISOString() });
        }
        const seen = new Set(latest.current.posts.map((post) => post.id));
        const posts = [...latest.current.posts, ...next.posts.filter((post) => !seen.has(post.id))];
        setPage((prev) => ({ ...prev!, posts, nextCursor: next.nextCursor }));
        send({ type: "posts", posts, more: !!next.nextCursor });
      });
  });
  // The loading indicator at the end of the list is what's watched, so it shows exactly while
  // there's more to load.
  const end = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!cursor || moreError) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && loadMore(), {
      rootMargin: "1000px",
    });
    observer.observe(end.current!);
    return () => observer.disconnect();
  }, [cursor, moreError]);
  // A new cursor re-asks, so a queue still waiting for a native track keeps loading pages.
  useEffect(() => {
    if (queue.loadMore) loadMore();
  }, [queue.loadMore, cursor, moreError]);

  // The lock screen, headphone, and keyboard media keys drive the same queue as the bar's buttons.
  useEffect(() => {
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => audio.current?.play().catch(() => {})],
      ["pause", () => audio.current?.pause()],
      ["previoustrack", () => send({ type: "previous" })],
      ["nexttrack", () => send({ type: "next" })],
    ];
    for (const [action, handler] of handlers) navigator.mediaSession.setActionHandler(action, handler);
    return () => handlers.forEach(([action]) => navigator.mediaSession.setActionHandler(action, null));
  }, [send]);
  useEffect(() => {
    if (!current) return;
    const { title, artist, album, artUrl } = current;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album, artwork: artUrl ? [{ src: artUrl }] : [] });
  }, [current]);

  // Clicking the playing card pauses or resumes it; any other native card starts from the top.
  function play(post: AudioPost) {
    if (post.id !== current?.id || queue.statuses[post.id]?.status !== "ready") return send({ type: "pick", post });
    const player = audio.current!;
    setPlayExpanded(post.id);
    if (player.paused) player.play().catch(() => {});
    else player.pause();
  }

  // An embed card plays in its provider's player, so the shared player pauses: two things never play at once.
  function openEmbed(post: AudioPost) {
    audio.current!.pause();
    setPlayExpanded(post.id);
  }

  return (
    <>
      <header className={styles.header}>
        <Link href="/">audiopost</Link>
        {page?.blog.avatarUrl && <img className={styles.avatar} src={page.blog.avatarUrl} alt="" />}
        <h1>{page?.blog.title || username}</h1>
        {page && (
          <>
            <a href={page.blog.blogUrl}>@{username}</a>
            {/* Tumblr doesn't report filtered counts. */}
            {!view.filter && <span>{page.blog.totalAudioPosts} audio posts</span>}
          </>
        )}
        <UsernameForm />
      </header>
      <main>
        <ViewControls view={view} />
        {page &&
          (page.posts.length ? (
            <ol className={styles.cards}>
              {page.posts.map((post) => (
                <li key={post.id}>
                  <Card
                    post={post}
                    status={queue.statuses[post.id]}
                    now={queue.now}
                    playExpanded={post.id === playExpanded}
                    onPlay={() => play(post)}
                    onRetry={() => send({ type: "retry", post })}
                    onEmbed={() => openEmbed(post)}
                    onCollapse={() => setPlayExpanded((id) => (id === post.id ? undefined : id))}
                  />
                </li>
              ))}
            </ol>
          ) : view.filter ? (
            <p>No results found. Try changing or removing the filter.</p>
          ) : (
            <p>Sorry, @{username} hasn&apos;t posted any audio.</p>
          ))}
        {error && (
          <BlogErrorMessage
            username={username}
            error={error}
            onRetry={() => {
              setError(undefined);
              setAttempt((n) => n + 1);
            }}
          />
        )}
        {moreError ? (
          <BlogErrorMessage username={username} error={moreError} onRetry={() => setMoreError(undefined)} />
        ) : (
          cursor && (
            <p ref={end} role="status">
              Loading more…
            </p>
          )
        )}
      </main>
      <section className={styles.bar} aria-label="Now playing" hidden={!current}>
        {current?.artUrl && <img src={current.artUrl} alt="" />}
        <p>
          {current?.title}
          {current?.artist && ` — ${current.artist}`}
        </p>
        <button type="button" aria-label="Previous track" onClick={() => send({ type: "previous" })}>
          ◀◀
        </button>
        <button type="button" aria-label="Next track" onClick={() => send({ type: "next" })}>
          ▶▶
        </button>
        <audio
          ref={audio}
          controls
          controlsList="nodownload"
          onEnded={() => send({ type: "ended" })}
          onError={() => send({ type: "error" })}
        />
      </section>
    </>
  );
}

// A failed fetch, with the UTC time it failed for the bug report.
type BlogError = ErrorResponse["error"] & { at: string };

function BlogErrorMessage({ username, error, onRetry }: { username: string; error: BlogError; onRetry: () => void }) {
  if (error.code === "blog_not_found") return <p role="alert">Sorry, we couldn&apos;t find a blog named @{username}</p>;
  if (error.code === "blog_private") return <p role="alert">Sorry, @{username}&apos;s blog is set to private</p>;
  if (error.code === "rate_limited") {
    return <p role="alert">Oops! Tumblr is rate-limiting us. Try again in a little bit.</p>;
  }
  const code = error.upstreamStatus ? `${error.code} ${error.upstreamStatus}` : error.code;
  const issueTitle = encodeURIComponent(`Bug report: ${code} ${error.at}`);
  return (
    <div role="alert" className={styles.error}>
      <p>Couldn&apos;t reach Tumblr. Try again.</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
      <code>{code}</code>
      <a href={`https://github.com/cwfreelance/audiopost/issues/new?title=${issueTitle}`}>Bug? Report on GitHub</a>
    </div>
  );
}

type CardProps = {
  post: AudioPost;
  status?: TrackStatus;
  now?: number;
  playExpanded: boolean;
  onPlay: () => void;
  onRetry: () => void;
  onEmbed: () => void;
  onCollapse: () => void;
};

// Clicking anywhere on a card plays its native track or opens its embed; link cards only expand.
// The title is a button so keyboard users can do the same: its click bubbles up to the card. The
// links, the more/less toggle, and Try again stop their clicks from reaching the card.
function Card({ post, status, now = 0, playExpanded, onPlay, onRetry, onEmbed, onCollapse }: CardProps) {
  const [moreExpanded, setMoreExpanded] = useState(false);
  const expanded = moreExpanded || playExpanded;
  const date = new Date(post.publishedAt * 1000);
  // Memoized: every card re-renders each second while a track's retry counts down.
  const body = useMemo(
    () => DOMPurify.sanitize(post.bodyHtml, { FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] }),
    [post.bodyHtml],
  );
  const retry = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRetry();
      }}
    >
      Try again
    </button>
  );
  return (
    <article
      className={expanded ? `${styles.card} ${styles.expanded}` : styles.card}
      onClick={() => {
        if (post.track.kind === "native") onPlay();
        else if (post.track.kind === "embed") onEmbed();
        else setMoreExpanded(true);
      }}
    >
      {post.artUrl && <img className={styles.art} src={post.artUrl} alt="" loading="lazy" />}
      <div>
        <h2>
          <button type="button">
            {post.title}
            {post.artist && ` — ${post.artist}`}
          </button>
        </h2>
        <p className={styles.meta}>
          <time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined, { dateStyle: "medium" })}</time>
          {post.rebloggedFrom && <span>reblogged from @{post.rebloggedFrom}</span>}
          <a
            href={post.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the original post"
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </a>
        </p>
        {status?.status === "waking" && (
          <p>
            Waking this file up. Tumblr hasn&apos;t served it in a while. Retrying in{" "}
            {Math.ceil((status.retryAt - now) / 1000)}s…
          </p>
        )}
        {status?.status === "gave-up" && (
          <p>
            This file hasn&apos;t been opened in a while. Trying again usually fixes it -- if not, the file may be
            corrupted. {retry}
          </p>
        )}
        {status?.status === "gone" && <p>This file has been deleted from Tumblr.</p>}
        {status?.status === "host-failed" && (
          <p>
            This file was hosted on {status.host}, which doesn&apos;t seem to be serving it anymore. {retry}
          </p>
        )}
        {/* The app's own iframe, from the embed URL the posts API checked against the provider
            allowlist. It only exists while the card is expanded, so collapsing stops its audio. */}
        {expanded && post.track.kind === "embed" && (
          <iframe
            className={styles.embed}
            src={post.track.embedUrl}
            title={`${post.title} on ${providerName(post.track.provider)}`}
            sandbox="allow-scripts allow-same-origin allow-popups"
            allow="autoplay; encrypted-media"
          />
        )}
        {post.track.kind === "link" && (
          <a href={post.track.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            Listen on {providerName(post.track.provider)} ↗
          </a>
        )}
        <div
          className={expanded ? undefined : styles.preview}
          onClick={(e) => (e.target as Element).closest("a") && e.stopPropagation()}
          dangerouslySetInnerHTML={{ __html: body }}
        />
        <button
          type="button"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            setMoreExpanded(!expanded);
            if (expanded) onCollapse();
          }}
        >
          <span aria-hidden="true">{expanded ? "▴" : "▾"}</span> {expanded ? "less" : "more"}
        </button>
      </div>
    </article>
  );
}

// Reads a file's HTTP status with a 2-byte range request, dropping the body once the status
// arrives. A request that fails outright reads as 0. Only Tumblr's CDN allows this cross-origin.
function checkFile(url: string) {
  return fetch(url, { headers: { Range: "bytes=0-1" }, cache: "no-store" }).then(
    (res) => {
      res.body?.cancel().catch(() => {});
      return res.status;
    },
    () => 0,
  );
}

// Providers arrive as Tumblr's lowercase ids ("soundcloud", "tumblr").
function providerName(provider: string) {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
