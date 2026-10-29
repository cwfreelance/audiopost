# Contributing to audiopost

Thanks for wanting to help. audiopost is a small project, so this guide is short. If something here gets in your way, open an issue and say so.

## Ways to help

- **Report a bug.** [Open an issue](https://github.com/cwfreelance/audiopost/issues/new) with the blog you tried (if it's public and you're happy to share it), what you expected, and what happened. If audiopost showed an error code, paste it; the "Bug? Report on GitHub" link on an error fills it in for you.
- **Suggest something.** Open an issue describing what you'd like and why. For anything bigger than a small fix, please start here before writing code, so we can agree on the shape first.
- **Send a pull request.** Fixes for open issues, copy and accessibility improvements, and tests are all welcome.

## Getting set up

You'll need Node.js 24, [pnpm](https://pnpm.io), and a tumblr API key: register an app at [tumblr.com/oauth/apps](https://www.tumblr.com/oauth/apps) and use its OAuth consumer key.

```sh
git clone https://github.com/cwfreelance/audiopost.git
cd audiopost
pnpm install
echo "TUMBLR_API_KEY=<your consumer key>" > .env.local
pnpm run dev
```

Then open [localhost:3000](http://localhost:3000). The tests don't need a key: they replay recorded tumblr responses from `fixtures/tumblr/`.

## Making a change

1. Fork the repo and create a branch from `main`.
2. Make your change. Match the style of the code around it.
3. Run the checks:

   ```sh
   pnpm run typecheck
   pnpm run lint
   pnpm test
   pnpm run test:e2e   # run `pnpm exec playwright install chromium` once first
   ```

4. Open a pull request against `main`. Say what changed and why, and link the issue it fixes. For a visual change, a before and after screenshot helps a lot.

CI runs the same checks on every pull request. Pull requests are squash-merged, so your branch's history doesn't need to be tidy.

## A few house rules

- **Use pnpm**, not npm or yarn, so the lockfile stays consistent.
- **Keep the API key on the server.** Only `app/api/` talks to tumblr. Never log or return a request URL to tumblr, because it carries the key.
- **Test logic where it lives.** Pure logic goes in `lib/` with Vitest tests beside it. A change to how posts are read from tumblr should come with a test against the recorded fixtures.
- **Big decisions get a note.** If a change picks one approach over another for reasons that aren't obvious from the code, add a short record in `docs/adr/`.
- **Be kind.** Assume good intent in issues and reviews.

## License

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
