// Seam 3, the play queue: the view's posts and a stream of events in (the clock and the file
// checks' results among them), the current track, each track's status, and requests to play,
// check, and load more out. Posts are built by hand; the expected play orders are written out.
import { expect, test } from "vitest";
import type { AudioPost } from "@/lib/posts";
import { playQueue, type PlayQueue, type QueueEvent } from "./play-queue";

// A native track's file is on Tumblr's CDN unless another host is given.
function post(id: string, kind: "native" | "embed" | "link" = "native", host = "a.tumblr.com"): AudioPost {
  const track =
    kind === "native"
      ? { kind, fileUrl: `https://${host}/${id}.mp3` }
      : kind === "embed"
        ? { kind, provider: "soundcloud", embedUrl: `https://w.soundcloud.com/player/?url=${id}` }
        : { kind, provider: "tumblr", url: `https://blog-1.tumblr.com/post/${id}` };
  return { id, postUrl: `https://blog-1.tumblr.com/post/${id}`, publishedAt: 0, title: id, bodyHtml: "", track };
}

// Runs the events in order and returns the queue after each one.
function run(posts: AudioPost[], more: boolean, events: QueueEvent[]) {
  let queue: PlayQueue = playQueue({ posts: [], more: false, statuses: {}, checks: [] }, { type: "posts", posts, more });
  return events.map((event) => (queue = playQueue(queue, event)));
}

const playing = (queues: PlayQueue[]) => queues.map((queue) => queue.current?.id);
const started = (queues: PlayQueue[]) => queues.map((queue) => queue.play?.id);
const checked = (queues: PlayQueue[]) => queues.map((queue) => queue.checks.map((post) => post.id));
const checkResult = (post: AudioPost, status: number, now: number): QueueEvent => ({ type: "checked", post, status, now });

test("a Tumblr-hosted track is checked before it plays, and 200 or 206 plays it", () => {
  const posts = [post("a"), post("b")];
  const queues = run(posts, false, [
    { type: "pick", post: posts[0] },
    checkResult(posts[0], 206, 0),
    { type: "pick", post: posts[1] },
    checkResult(posts[1], 200, 0),
  ]);
  // b's check starts when a plays (pre-warming), so picking b waits on that one.
  expect(checked(queues)).toEqual([["a"], ["b"], [], []]);
  expect(started(queues)).toEqual([undefined, "a", undefined, "b"]);
  expect(queues[1].statuses.a).toEqual({ status: "ready" });
});

test("a 5xx means the file is waking up: it's re-checked 31 seconds after each failure", () => {
  const a = post("a");
  const queues = run([a], false, [
    { type: "pick", post: a },
    checkResult(a, 502, 1_000),
    { type: "tick", now: 31_999 },
    { type: "tick", now: 32_000 },
    checkResult(a, 503, 40_000),
    { type: "tick", now: 70_999 },
    { type: "tick", now: 71_000 },
    checkResult(a, 206, 72_000),
  ]);
  expect(queues[1].statuses.a).toEqual({ status: "waking", attempt: 1, retryAt: 32_000 });
  expect(queues[4].statuses.a).toEqual({ status: "waking", attempt: 2, retryAt: 71_000 });
  expect(checked(queues)).toEqual([["a"], [], [], ["a"], [], [], ["a"], []]);
  expect(started(queues)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined, "a"]);
});

// A file that fails `times` checks in a row, starting at `from`, each retry right on time.
function failing(track: AudioPost, times: number, from = 0): QueueEvent[] {
  return Array.from({ length: times }, (_, n): QueueEvent[] => [
    checkResult(track, 502, from + n * 31_000),
    { type: "tick", now: from + (n + 1) * 31_000 },
  ]).flat();
}

test("after 5 failed attempts in total, the track gives up", () => {
  const a = post("a");
  const queues = run([a], false, [{ type: "pick", post: a }, ...failing(a, 5), { type: "tick", now: 1_000_000 }]);
  expect(checked(queues).flat()).toEqual(["a", "a", "a", "a", "a"]);
  expect(queues.at(-1)!.statuses.a).toEqual({ status: "gave-up" });
});

test("403 and 404 mean the file was deleted: it's gone, with no retries", () => {
  const posts = [post("a"), post("b")];
  const queues = run(posts, false, [
    { type: "pick", post: posts[0] },
    checkResult(posts[0], 403, 0),
    { type: "pick", post: posts[1] },
    checkResult(posts[1], 404, 0),
    { type: "tick", now: 1_000_000 },
  ]);
  expect(checked(queues).flat()).toEqual(["a", "b"]);
  expect(queues.at(-1)!.statuses).toEqual({ a: { status: "gone" }, b: { status: "gone" } });
  expect(started(queues).every((id) => id === undefined)).toBe(true);
});

test("Try again resets a track that gave up to a fresh first attempt, with all 5 attempts ahead of it", () => {
  const a = post("a");
  const queues = run([a], false, [
    { type: "pick", post: a },
    ...failing(a, 5),
    { type: "retry", post: a },
    ...failing(a, 4, 500_000),
    checkResult(a, 200, 700_000),
  ]);
  const retried = queues.slice(11);
  expect(retried[0].statuses.a).toEqual({ status: "checking", attempt: 1 });
  expect(checked(retried).flat()).toEqual(["a", "a", "a", "a", "a"]);
  expect(retried.at(-1)!.play?.id).toBe("a");
});

test("when a track starts playing, the track auto-advance would play next is checked, so it's warm by then", () => {
  const posts = [post("a"), post("b", "embed"), post("c"), post("d"), post("e")];
  const queues = run(posts, false, [
    { type: "pick", post: posts[0] },
    checkResult(posts[0], 200, 0),
    // c is cold, so d is next in line: it's checked too.
    checkResult(posts[2], 502, 0),
    checkResult(posts[3], 206, 0),
  ]);
  expect(started(queues)).toEqual([undefined, "a", undefined, undefined]);
  expect(checked(queues)).toEqual([["a"], ["c"], ["d"], []]);
});

test("auto-advance skips gone, gave-up, host-failed, and still-waking tracks, and waking tracks keep retrying", () => {
  const [first, gone, gaveUp, hostFailed, waking, last] = [
    post("first"),
    post("gone"),
    post("gave-up"),
    post("host-failed", "native", "files.example.com"),
    post("waking"),
    post("last"),
  ];
  const queues = run([first, gone, gaveUp, hostFailed, waking, last], false, [
    { type: "pick", post: gone },
    checkResult(gone, 404, 0),
    { type: "pick", post: hostFailed },
    { type: "error" },
    { type: "pick", post: gaveUp },
    ...failing(gaveUp, 5),
    { type: "pick", post: waking },
    checkResult(waking, 502, 200_000),
    { type: "pick", post: first },
    checkResult(first, 200, 200_000),
    checkResult(last, 200, 200_000),
    { type: "ended" },
    { type: "tick", now: 231_000 },
  ]);
  const [firstStarts, , ended, tick] = queues.slice(-4);
  expect(firstStarts.statuses).toMatchObject({
    gone: { status: "gone" },
    "gave-up": { status: "gave-up" },
    "host-failed": { status: "host-failed" },
    waking: { status: "waking" },
  });
  expect(firstStarts.checks.map((post) => post.id)).toEqual(["last"]);
  expect(ended.play?.id).toBe("last");
  expect(tick.checks.map((post) => post.id)).toEqual(["waking"]);
});

test("a track auto-advance moved to that turns out cold is skipped too, but a picked one plays once it wakes up", () => {
  const posts = [post("a"), post("b"), post("c")];
  const queues = run(posts, false, [
    { type: "pick", post: posts[0] },
    checkResult(posts[0], 200, 0),
    // a ends before b's pre-warming check is back, and b is cold.
    { type: "ended" },
    checkResult(posts[1], 502, 1_000),
    checkResult(posts[2], 206, 2_000),
    // The listener picks b while it's waking.
    { type: "pick", post: posts[1] },
    { type: "tick", now: 32_000 },
    checkResult(posts[1], 206, 33_000),
  ]);
  expect(playing(queues)).toEqual(["a", "a", "b", "c", "c", "b", "b", "b"]);
  expect(started(queues)).toEqual([undefined, "a", undefined, undefined, "c", undefined, undefined, "b"]);
});

test("a track on another host plays without a check, a media error makes it host-failed, and Try again plays it again", () => {
  const a = post("a", "native", "files.example.com");
  const queues = run([a], false, [{ type: "pick", post: a }, { type: "error" }, { type: "retry", post: a }]);
  expect(checked(queues)).toEqual([[], [], []]);
  expect(started(queues)).toEqual(["a", undefined, "a"]);
  expect(queues[1].statuses.a).toEqual({ status: "host-failed", host: "files.example.com" });
});

test("a track that ends plays the next native track in view order, skipping embed and link tracks", () => {
  const posts = [post("dec"), post("nov", "embed"), post("oct"), post("sep", "link"), post("aug")];
  const queues = run(posts, false, [{ type: "pick", post: posts[0] }, { type: "ended" }, { type: "ended" }]);
  expect(playing(queues)).toEqual(["dec", "oct", "aug"]);
});

test("order follows the view: oldest first plays the same posts chronologically", () => {
  const posts = [post("aug"), post("sep", "link"), post("oct"), post("nov", "embed"), post("dec")];
  const queues = run(posts, false, [{ type: "pick", post: posts[0] }, { type: "ended" }, { type: "ended" }]);
  expect(playing(queues)).toEqual(["aug", "oct", "dec"]);
});

test("next and previous go to the next and previous native tracks, skipping embed and link tracks", () => {
  const posts = [post("dec"), post("nov", "embed"), post("oct"), post("sep", "link"), post("aug")];
  const events: QueueEvent[] = [
    { type: "pick", post: posts[0] },
    { type: "next" },
    { type: "next" },
    { type: "previous" },
    { type: "previous" },
    { type: "previous" },
  ];
  expect(playing(run(posts, false, events))).toEqual(["dec", "oct", "aug", "oct", "dec", "dec"]);
});

test("the queue asks for the next page once 3 or fewer posts remain after the current one", () => {
  const posts = ["1", "2", "3", "4", "5", "6", "7", "8"].map((id) => post(id));
  const events: QueueEvent[] = [{ type: "pick", post: posts[3] }, { type: "next" }, { type: "next" }];
  expect(run(posts, true, events).map((queue) => queue.loadMore)).toEqual([false, true, true]);
  // A fully loaded view never asks.
  expect(run(posts, false, events).map((queue) => queue.loadMore)).toEqual([false, false, false]);
});

test("a track that ends past the loaded posts waits for more pages, then playback stops at the end of the view", () => {
  const page1 = [post("1"), post("2", "embed"), post("3", "link"), post("4", "embed"), post("5", "link")];
  const page2 = [...page1, post("6", "embed")];
  const page3 = [...page2, post("7"), post("8", "link")];
  const queues = run(page1, true, [
    { type: "pick", post: page1[0] },
    { type: "ended" },
    { type: "posts", posts: page2, more: true },
    { type: "posts", posts: page3, more: false },
    { type: "ended" },
  ]);
  expect(playing(queues)).toEqual(["1", "1", "1", "7", "7"]);
  expect(queues.map((queue) => queue.loadMore)).toEqual([false, true, true, false, false]);
});
