// Seam 3, the play queue: the view's posts and a stream of events in, the current track and a
// load-more request out. Posts are built by hand; the expected play orders are written out.
import { expect, test } from "vitest";
import type { AudioPost } from "@/lib/posts";
import { playQueue, type PlayQueue, type QueueEvent } from "./play-queue";

function post(id: string, kind: "native" | "embed" | "link" = "native"): AudioPost {
  const track =
    kind === "native"
      ? { kind, fileUrl: `https://a.tumblr.com/${id}.mp3` }
      : kind === "embed"
        ? { kind, provider: "soundcloud", embedUrl: `https://w.soundcloud.com/player/?url=${id}` }
        : { kind, provider: "tumblr", url: `https://blog-1.tumblr.com/post/${id}` };
  return { id, postUrl: `https://blog-1.tumblr.com/post/${id}`, publishedAt: 0, title: id, bodyHtml: "", track };
}

// Runs the events in order and returns the queue after each one.
function run(posts: AudioPost[], more: boolean, events: QueueEvent[]) {
  let queue: PlayQueue = playQueue({ posts: [], more: false }, { type: "posts", posts, more });
  return events.map((event) => (queue = playQueue(queue, event)));
}

const playing = (queues: PlayQueue[]) => queues.map((queue) => queue.current?.id);

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
