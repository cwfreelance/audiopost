// The play queue: which track plays, in view order, as events arrive. It's pure, so the page does
// what it says: plays `current` whenever it changes, and loads the next page while `loadMore` holds.
import type { AudioPost } from "@/lib/posts";

export type PlayQueue = {
  posts: AudioPost[]; // the view's posts, in view order
  more: boolean; // the view has more pages to load
  current?: AudioPost; // the track playing, or the last one played
  waiting?: boolean; // moved past the loaded posts: the next track is on a page not loaded yet
  loadMore?: boolean; // more pages exist, and 3 or fewer posts remain after the current one, or it's waiting
};

export type QueueEvent =
  | { type: "pick"; post: AudioPost }
  | { type: "ended" | "next" | "previous" }
  // The view's posts so far: its first page, or the list after another page is appended.
  | { type: "posts"; posts: AudioPost[]; more: boolean };

const isNative = (post: AudioPost) => post.track.kind === "native";

export function playQueue(queue: PlayQueue, event: QueueEvent): PlayQueue {
  const next = step(queue, event);
  const after = next.posts.length - 1 - next.posts.findIndex((post) => post.id === next.current?.id);
  return { ...next, loadMore: next.more && (after <= 3 || !!next.waiting) };
}

function step(prev: PlayQueue, event: QueueEvent): PlayQueue {
  if (event.type === "pick") return { ...prev, current: event.post, waiting: false };
  const queue = event.type === "posts" ? { ...prev, posts: event.posts, more: event.more } : prev;
  if (event.type === "posts" && !queue.waiting) return queue;
  const i = queue.posts.findIndex((post) => post.id === queue.current?.id);
  if (event.type === "previous") {
    const previous = queue.posts.slice(0, Math.max(i, 0)).findLast(isNative);
    return previous ? { ...queue, current: previous, waiting: false } : queue;
  }
  // A track ended, next, or the posts a waiting queue asked for arrived. With nothing left to
  // play, it waits if more pages exist, and otherwise playback stops.
  const next = queue.posts.slice(i + 1).find(isNative);
  return next ? { ...queue, current: next, waiting: false } : { ...queue, waiting: queue.more };
}
