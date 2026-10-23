// Seam 2, view state: a URL plus the viewer's timezone in, a view out, and back to a URL. Expected
// windows are worked by hand as local midnight with that zone's UTC offset on the date.
import { expect, test } from "vitest";
import { parseView, viewUrl } from "./view";

const NEW_YORK = "America/New_York";
const TOKYO = "Asia/Tokyo";

// Unix seconds for a local time written with its offset.
const at = (iso: string) => Date.parse(iso) / 1000;

test("a share link becomes the view it describes", () => {
  expect(parseView("/SomeBlog?in=2012-03&sort=oldest", NEW_YORK)).toEqual({
    username: "someblog",
    filter: { mode: "in", year: 2012, month: 3 },
    sort: "oldest",
    window: { from: at("2012-03-01T00:00-05:00"), to: at("2012-04-01T00:00-04:00") },
  });
});

test.each([
  "/someblog",
  "/someblog?sort=oldest",
  "/someblog?in=2012",
  "/someblog?in=2012-03&sort=oldest",
  "/someblog?before=2009-12",
  "/someblog?after=2015&sort=oldest",
])("the share link %s survives a round trip through its view", (url) => {
  expect(viewUrl(parseView(url, NEW_YORK)!)).toBe(url);
});

test.each([
  ["two filters", "?in=2012&before=2013"],
  ["the same filter twice", "?in=2012&in=2013"],
  ["an empty filter beside a good one", "?after=&in=2012"],
  ["a two-digit year", "?in=12"],
  ["month 13", "?in=2012-13"],
  ["month 00", "?before=2012-00"],
  ["an unpadded month", "?after=2012-3"],
  ["a day", "?in=2012-03-01"],
  ["words", "?in=last-year"],
])("%s means no filter, and the rest of the link still works", (_, query) => {
  const view = parseView(`/someblog${query}&sort=oldest`, NEW_YORK)!;

  expect(view).toEqual({ username: "someblog", sort: "oldest", window: {} });
  expect(viewUrl(view)).toBe("/someblog?sort=oldest");
});

test.each(["sideways", "", "OLDEST", "newest"])("sort=%s falls back to newest first", (sort) => {
  const view = parseView(`/someblog?in=2012&sort=${sort}`, NEW_YORK)!;

  expect(view.sort).toBe("newest");
  expect(viewUrl(view)).toBe("/someblog?in=2012");
});

test("parameters the app doesn't use are dropped from the link", () => {
  expect(viewUrl(parseView("/someblog?utm_source=x&in=2012&playing=123", NEW_YORK)!)).toBe("/someblog?in=2012");
});

test("a link to an invalid username is no view", () => {
  expect(parseView("/some_blog?in=2012", NEW_YORK)).toBeNull();
});

// The spec's six worked examples, in New York, where March to April crosses into daylight saving.
test.each([
  ["in=2012", { from: at("2012-01-01T00:00-05:00"), to: at("2013-01-01T00:00-05:00") }],
  ["in=2012-03", { from: at("2012-03-01T00:00-05:00"), to: at("2012-04-01T00:00-04:00") }],
  ["before=2012", { to: at("2012-01-01T00:00-05:00") }],
  ["before=2012-03", { to: at("2012-03-01T00:00-05:00") }],
  ["after=2012", { from: at("2013-01-01T00:00-05:00") }],
  ["after=2012-03", { from: at("2012-04-01T00:00-04:00") }],
])("%s selects the window from local midnight to local midnight", (query, window) => {
  expect(parseView(`/someblog?${query}`, NEW_YORK)!.window).toEqual(window);
});

test.each([
  [NEW_YORK, "-05:00"],
  [TOKYO, "+09:00"],
])("December rolls over into the next January in %s", (timeZone, offset) => {
  expect(parseView("/someblog?in=2012-12", timeZone)!.window).toEqual({
    from: at(`2012-12-01T00:00${offset}`),
    to: at(`2013-01-01T00:00${offset}`),
  });
  expect(parseView("/someblog?after=2012-12", timeZone)!.window).toEqual({ from: at(`2013-01-01T00:00${offset}`) });
});

// Sydney's daylight saving ended at 3am on Sunday 1 April 2012, so that midnight was still +11:00.
test("the same link selects a different window in a different timezone", () => {
  expect(parseView("/someblog?in=2012-03", "Australia/Sydney")!.window).toEqual({
    from: at("2012-03-01T00:00+11:00"),
    to: at("2012-04-01T00:00+11:00"),
  });
});
