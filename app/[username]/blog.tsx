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
  const [moreError, setMoreError] = useState<string>();
  const end = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!cursor || moreError) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        fetch(`/api/blogs/${username}/posts?cursor=${encodeURIComponent(cursor)}`)
          .then((res) => res.json())
          .then((next: PostsResponse | ErrorResponse) => {
            if ("error" in next) return setMoreError(next.error.code);
            setData((prev) => {
              const { posts } = prev as PostsResponse;
              const seen = new Set(posts.map((post) => post.id));
              return {
                ...(prev as PostsResponse),
                posts: [...posts, ...next.posts.filter((post) => !seen.has(post.id))],
                nextCursor: next.nextCursor,
              };
            });
          }, () => setMoreError("network_error"));
      },
      { rootMargin: "1000px" },
    );
    observer.observe(end.current!);
    return () => observer.disconnect();
  }, [username, cursor, moreError]);

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
                  <Card post={post} />
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
          <p role="alert">
            Couldn&apos;t reach Tumblr. Try again. ({moreError}){" "}
            <button type="button" onClick={() => setMoreError(undefined)}>
              Try again
            </button>
          </p>
        ) : (
          cursor && (
            <p ref={end} role="status">
              Loading more…
            </p>
          )
        )}
      </main>
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

function Card({ post }: { post: AudioPost }) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(post.publishedAt * 1000);
  const body = DOMPurify.sanitize(post.bodyHtml, { FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });
  return (
    <article className={expanded ? `${styles.card} ${styles.expanded}` : styles.card}>
      {post.artUrl && <img className={styles.art} src={post.artUrl} alt="" loading="lazy" />}
      <div>
        <h2>
          {post.title}
          {post.artist && ` — ${post.artist}`}
        </h2>
        <p className={styles.meta}>
          <time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined, { dateStyle: "medium" })}</time>
          {post.rebloggedFrom && <span>reblogged from @{post.rebloggedFrom}</span>}
          <a href={post.postUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the original post">
            ↗
          </a>
        </p>
        <div className={expanded ? undefined : styles.preview} dangerouslySetInnerHTML={{ __html: body }} />
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <span aria-hidden="true">{expanded ? "▴" : "▾"}</span> {expanded ? "less" : "more"}
        </button>
      </div>
    </article>
  );
}
