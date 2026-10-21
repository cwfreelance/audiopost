- Issue titles never contain an issue number (`#n`): not the parent's, not a phase's ("Email editor: defaults + carry-over", not "#266 P2: defaults"); the parent/phase relationship goes in the body's first line ("Phase 2 of #266") and the native blocked-by/sub-issue link. In running prose (bodies, comments, PR text) GitHub expands a bare `#n` into the full title on render, so cite as a custom-text link, `[#166](https://github.com/<owner>/<repo>/issues/166)` (`/pull/n` for PRs), never a bare `#n` and never a pasted title; a bare `#n` belongs only in index/tracking lines where the expanded title is wanted.
- Issue bodies are self-contained: every step, value, and decision the reader needs is written out in the body itself, never delegated to another issue ("implement using the stack described in #150" is wrong; name the stack). Where a fact came from goes in one `## Sources` footer at the bottom, as custom-text links with a few plain words each, kept for provenance only; the body above it reads without opening anything else.

## Agent skills

### Issue tracker

GitHub Issues on `cwfreelance/audiopost`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Privacy

- Never write the maintainer's Tumblr blog names anywhere in the repo, issues, PRs, commits, or docs. They live only in the gitignored `.env.local` as `FIXTURE_BLOGS`; call them "main fixture blog" and "secondary fixture blog".
