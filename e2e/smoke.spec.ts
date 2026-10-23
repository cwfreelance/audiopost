import { expect, test } from "@playwright/test";

test("enter a username, click a card, and the now-playing bar plays it", async ({ page }) => {
  await page.route("**/api/blogs/*/posts*", (route) =>
    route.fulfill({
      json: {
        blog: { username: "blog-1", title: "", avatarUrl: null, blogUrl: "https://blog-1.tumblr.com/", totalAudioPosts: 1 },
        posts: [
          {
            id: "1",
            postUrl: "https://blog-1.tumblr.com/post/1",
            publishedAt: 1262304000,
            title: "Quiet Track",
            artist: "Some Artist",
            bodyHtml: "<p>A caption.</p>",
            track: { kind: "native", fileUrl: "https://a.tumblr.com/tumblr_silence.mp3" },
          },
        ],
        nextCursor: null,
      },
    }),
  );
  // Tumblr's CDN allows cross-origin reads, which the file check before playing relies on.
  await page.route("https://a.tumblr.com/**", (route) =>
    route.fulfill({ path: `${__dirname}/silence.mp3`, headers: { "access-control-allow-origin": "*" } }),
  );

  await page.goto("/");
  await page.getByLabel("Tumblr username").fill("blog-1");
  await page.getByRole("button", { name: "Listen" }).click();
  await page.getByText("A caption.").click();

  const bar = page.getByRole("region", { name: "Now playing" });
  await expect(bar).toContainText("Quiet Track — Some Artist");
  await expect.poll(() => bar.locator("audio").evaluate((audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0)).toBe(true);
});
