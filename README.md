# audiopost

Browse and play any Tumblr blog's audio posts.

Type a Tumblr username and get a scrollable list of that blog's audio posts, with a built-in player. Free, open source, no sign-up.

audiopost is a revival of Topherchris's [Tumblr Audio Parser](http://omg.topherchris.com/audio/), which went offline years ago.

This application uses the Tumblr application programming interface but is not endorsed or certified by Tumblr, Inc.

## Local development

Requires Node.js 24.

1. Install dependencies: `pnpm install`
2. Create `.env.local` at the repo root with your Tumblr API key, the OAuth consumer key of an app registered at https://www.tumblr.com/oauth/apps:

   ```
   TUMBLR_API_KEY=<your consumer key>
   ```

3. Start the dev server with `pnpm run dev` and open http://localhost:3000.

| Script | What it does |
|---|---|
| `pnpm run dev` | Dev server |
| `pnpm run build` / `pnpm start` | Production build and server |
| `pnpm run typecheck` | TypeScript |
| `pnpm run lint` | ESLint |
| `pnpm test` | Vitest unit and integration tests |
| `pnpm run test:e2e` | Playwright end-to-end tests (run `pnpm exec playwright install chromium` once first) |

## License

[MIT](LICENSE)
