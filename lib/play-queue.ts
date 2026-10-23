// The play queue: which track plays, in view order, and each track's status, as events arrive. It's
// pure, so the page does what it says: starts `play` when it's set, checks each file in `checks`
// and sends back the result, sends the clock while a track is waking, and loads the next page
// while `loadMore` holds.
import type { AudioPost } from "@/lib/posts";

// Only Tumblr's CDN lets the browser read a file's status cross-origin, so only its files are checked.
const CHECKED_HOST = "a.tumblr.com";
// Tumblr's CDN caches a 502 for 30 seconds, so a sooner retry only replays it.
const RETRY_MS = 31_000;
const MAX_ATTEMPTS = 5;

export type TrackStatus =
  | { status: "idle" | "ready" | "gone" | "gave-up" }
  | { status: "checking"; attempt: number }
  | { status: "waking"; attempt: number; retryAt: number }
  | { status: "host-failed"; host: string };

export type PlayQueue = {
  posts: AudioPost[]; // the view's posts, in view order
  more: boolean; // the view has more pages to load
  statuses: Record<string, TrackStatus>; // native tracks' statuses, by post id: a track with none is idle
  now?: number; // the clock, as of the last tick or check result
  current?: AudioPost; // the track picked or moved to: it plays once it's ready
  advancing?: boolean; // current was moved to by a track ending or next, not picked
  waiting?: boolean; // moved past the loaded posts: the next track is on a page not loaded yet
  play?: AudioPost; // start this track now
  checks: AudioPost[]; // check these tracks' files now
  loadMore?: boolean; // more pages exist, and 3 or fewer posts remain after the current one, or it's waiting
};

export type QueueEvent =
  // Picking a track, or Try again: a fresh first attempt at playing it.
  | { type: "pick" | "retry"; post: AudioPost }
  // error: the player couldn't load or play the current track's file.
  | { type: "ended" | "next" | "previous" | "error" }
  // A file check's HTTP status, and the time it arrived.
  | { type: "checked"; post: AudioPost; status: number; now: number }
  // The clock: waking tracks are re-checked once it passes their retry time.
  | { type: "tick"; now: number }
  // The view's posts so far: its first page, or the list after another page is appended.
  | { type: "posts"; posts: AudioPost[]; more: boolean };

const host = (post: AudioPost) => (post.track.kind === "native" && URL.parse(post.track.fileUrl)?.hostname) || "";
const statusOf = (queue: PlayQueue, post: AudioPost) => queue.statuses[post.id]?.status ?? "idle";
// Auto-advance, next, previous, and pre-warming pass over tracks that can't play right now.
const SKIPPED = ["gone", "gave-up", "host-failed", "waking"];
const playable = (queue: PlayQueue) => (post: AudioPost) =>
  post.track.kind === "native" && !SKIPPED.includes(statusOf(queue, post));
const currentIndex = (queue: PlayQueue) => queue.posts.findIndex((post) => post.id === queue.current?.id);
// The track auto-advance would play next.
const ahead = (queue: PlayQueue) => queue.posts.slice(currentIndex(queue) + 1).find(playable(queue));

export function playQueue(prev: PlayQueue, event: QueueEvent): PlayQueue {
  let next = step(prev, event);
  // Moving on never stalls on a track that turns out unable to play: it moves past that one too.
  if (next.advancing && next.current && !playable(next)(next.current)) next = advance(next);
  const { current } = next;
  const ready = (queue: PlayQueue) => !!current && queue.current?.id === current.id && statusOf(queue, current) === "ready";
  // Pre-warming: while a track plays, the one after it is checked, so a cold file has time to wake.
  const upcoming = ready(next) && ahead(next);
  if (upcoming && host(upcoming) === CHECKED_HOST && statusOf(next, upcoming) === "idle") {
    next = withStatus(next, upcoming, { status: "checking", attempt: 1 });
  }
  const after = next.posts.length - 1 - currentIndex(next);
  return {
    ...next,
    // The current track plays as soon as it's ready, once.
    play: ready(next) && !ready(prev) ? current : undefined,
    // Each check is asked for once, when a track starts checking.
    checks: next.posts.filter((post) => statusOf(next, post) === "checking" && next.statuses[post.id] !== prev.statuses[post.id]),
    loadMore: next.more && (after <= 3 || !!next.waiting),
  };
}

function step(prev: PlayQueue, event: QueueEvent): PlayQueue {
  if (event.type === "pick") return select(prev, event.post);
  if (event.type === "retry") return select(withStatus(prev, event.post, { status: "idle" }), event.post);
  if (event.type === "tick") {
    const statuses = Object.fromEntries(
      Object.entries(prev.statuses).map(([id, s]): [string, TrackStatus] => [
        id,
        s.status === "waking" && s.retryAt <= event.now ? { status: "checking", attempt: s.attempt + 1 } : s,
      ]),
    );
    return { ...prev, statuses, now: event.now };
  }
  if (event.type === "checked") {
    const checking = prev.statuses[event.post.id];
    if (checking?.status !== "checking") return prev;
    // Any other status (or 0, a check that couldn't be sent) plays the file and lets the player decide.
    const { attempt } = checking;
    const status: TrackStatus =
      event.status === 403 || event.status === 404
        ? { status: "gone" }
        : event.status < 500
          ? { status: "ready" }
          : attempt < MAX_ATTEMPTS
            ? { status: "waking", attempt, retryAt: event.now + RETRY_MS }
            : { status: "gave-up" };
    return { ...withStatus(prev, event.post, status), now: event.now };
  }
  if (event.type === "error") {
    // Only a ready current track is in the player. A Tumblr file that passed its check but won't
    // play may be corrupted, which is what giving up says.
    const { current } = prev;
    if (!current || statusOf(prev, current) !== "ready") return prev;
    const failed = host(current);
    return withStatus(prev, current, failed === CHECKED_HOST ? { status: "gave-up" } : { status: "host-failed", host: failed });
  }
  const queue = event.type === "posts" ? { ...prev, posts: event.posts, more: event.more } : prev;
  if (event.type === "posts" && !queue.waiting) return queue;
  if (event.type === "previous") {
    const previous = queue.posts.slice(0, Math.max(currentIndex(queue), 0)).findLast(playable(queue));
    return previous ? select(queue, previous) : queue;
  }
  // A track ended, next, or the posts a waiting queue asked for arrived.
  return advance(queue);
}

// Moves to the next track that can play. With none left, it waits if more pages exist, and
// otherwise playback stops.
function advance(queue: PlayQueue): PlayQueue {
  const next = ahead(queue);
  return next ? select(queue, next, true) : { ...queue, waiting: queue.more };
}

// Moves to a track. A fresh Tumblr-hosted one is checked first; one on another host can't be, so it plays directly.
function select(queue: PlayQueue, post: AudioPost, advancing = false): PlayQueue {
  const fresh = statusOf(queue, post) === "idle";
  const status: TrackStatus = host(post) === CHECKED_HOST ? { status: "checking", attempt: 1 } : { status: "ready" };
  return { ...(fresh ? withStatus(queue, post, status) : queue), current: post, advancing, waiting: false };
}

const withStatus = (queue: PlayQueue, post: AudioPost, status: TrackStatus): PlayQueue => ({
  ...queue,
  statuses: { ...queue.statuses, [post.id]: status },
});
