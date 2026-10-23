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
  const [data, setData] = useState<PostsResponse | ErrorResponse>();
  useEffect(() => {
    fetch(`/api/blogs/${username}/posts`)
      .then((res) => res.json())
      .then(setData, () => setData({ error: { code: "network_error" } }));
  }, [username]);
  const page = data && "blog" in data ? data : undefined;

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
        {data && "error" in data && (
          // ponytail: one message for every error until the error-mapping ticket.
          <p role="alert">
            Couldn&apos;t reach Tumblr. Try again. ({data.error.code})
          </p>
        )}
        {page && (
          <ol className={styles.cards}>
            {page.posts.map((post) => (
              <li key={post.id}>
                <Card post={post} />
              </li>
            ))}
          </ol>
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

function Card({ post }: { post: AudioPost }) {
  const date = new Date(post.publishedAt * 1000);
  const body = DOMPurify.sanitize(post.bodyHtml, { FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });
  return (
    <article className={styles.card}>
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
        <div className={styles.preview} dangerouslySetInnerHTML={{ __html: body }} />
      </div>
    </article>
  );
}
