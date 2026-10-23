"use client";
/* eslint-disable @next/next/no-img-element -- art and avatars load straight from Tumblr's CDN, lazily
   and natively; next/image would spend Vercel's image-optimization quota on them. */

import DOMPurify from "dompurify";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { UsernameForm } from "@/app/username-form";
import type { AudioPost, ErrorResponse, PostsResponse } from "@/lib/posts";
import styles from "./blog.module.css";

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
  const [page, setPage] = useState<PostsResponse>();
  const [error, setError] = useState<BlogError>();
  const [attempt, setAttempt] = useState(0);
  // The one shared player: its source changes per track, because iOS only lets an audio element
  // that already exists start the next track with the screen locked.
  const audio = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<AudioPost>();
  // The card expanded because it's playing, kept apart from the cards opened with "▾ more".
  const [playExpanded, setPlayExpanded] = useState<string>();
  useEffect(() => {
    let stale = false;
    fetch(`/api/blogs/${username}/posts`)
      .then((res) => res.json() as Promise<PostsResponse | ErrorResponse>)
      .catch((): ErrorResponse => ({ error: { code: "network_error" } }))
      .then((body) => {
        if (stale) return;
        if ("error" in body) setError({ ...body.error, at: new Date().toISOString() });
        else setPage(body);
      });
    return () => {
      stale = true;
    };
  }, [username, attempt]);

  // The next page loads when the end of the list nears the viewport. The loading indicator at the
  // end of the list is what's watched, so it shows exactly while there's more to load.
  const cursor = page?.nextCursor;
  const [moreError, setMoreError] = useState<BlogError>();
  const end = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!cursor || moreError) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        fetch(`/api/blogs/${username}/posts?cursor=${encodeURIComponent(cursor)}`)
          .then((res) => res.json() as Promise<PostsResponse | ErrorResponse>)
          .catch((): ErrorResponse => ({ error: { code: "network_error" } }))
          .then((next) => {
            if ("error" in next) return setMoreError({ ...next.error, at: new Date().toISOString() });
            setPage((prev) => {
              const seen = new Set(prev!.posts.map((post) => post.id));
              const posts = [...prev!.posts, ...next.posts.filter((post) => !seen.has(post.id))];
              return { ...prev!, posts, nextCursor: next.nextCursor };
            });
          });
      },
      { rootMargin: "1000px" },
    );
    observer.observe(end.current!);
    return () => observer.disconnect();
  }, [username, cursor, moreError]);

  // Clicking the playing card pauses or resumes it; any other native card starts from the top.
  // play() runs inside the click, which is what lets browsers start audio.
  function play(post: AudioPost, fileUrl: string) {
    const player = audio.current!;
    setPlayExpanded(post.id);
    if (post.id === current?.id && !player.paused) return player.pause();
    if (post.id !== current?.id) {
      player.src = fileUrl;
      setCurrent(post);
    }
    // A file that fails to load also fires the element's error event, which is where failures get handled.
    player.play().catch(() => {});
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
            <span>{page.blog.totalAudioPosts} audio posts</span>
          </>
        )}
        <UsernameForm />
      </header>
      <main>
        {page &&
          (page.posts.length ? (
            <ol className={styles.cards}>
              {page.posts.map((post) => (
                <li key={post.id}>
                  <Card
                    post={post}
                    playExpanded={post.id === playExpanded}
                    onPlay={(fileUrl) => play(post, fileUrl)}
                    onEmbed={() => openEmbed(post)}
                    onCollapse={() => setPlayExpanded((id) => (id === post.id ? undefined : id))}
                  />
                </li>
              ))}
            </ol>
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
        <audio ref={audio} controls controlsList="nodownload" />
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
  playExpanded: boolean;
  onPlay: (fileUrl: string) => void;
  onEmbed: () => void;
  onCollapse: () => void;
};

// Clicking anywhere on a card plays its native track or opens its embed; link cards only expand.
// The title is a button so keyboard users can do the same: its click bubbles up to the card. The
// links and the more/less toggle stop their clicks from reaching the card.
function Card({ post, playExpanded, onPlay, onEmbed, onCollapse }: CardProps) {
  const [moreExpanded, setMoreExpanded] = useState(false);
  const expanded = moreExpanded || playExpanded;
  const date = new Date(post.publishedAt * 1000);
  const body = DOMPurify.sanitize(post.bodyHtml, { FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });
  return (
    <article
      className={expanded ? `${styles.card} ${styles.expanded}` : styles.card}
      onClick={() => {
        if (post.track.kind === "native") onPlay(post.track.fileUrl);
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

// Providers arrive as Tumblr's lowercase ids ("soundcloud", "tumblr").
function providerName(provider: string) {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
