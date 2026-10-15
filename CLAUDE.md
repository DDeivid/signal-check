# Signal Check

Automated weekday news podcast. TypeScript (Node 22, ESM, run with `tsx`, no build step), runs on GitHub Actions, publishes MP3s as GitHub Release assets and the feed/site on GitHub Pages. README.md covers usage; this file covers working on the code.

## Commands

- `npm test`: vitest (pure logic: windows, dedupe, rules, market-number check, feed XML)
- `npm run typecheck`
- `SC_DRY_RUN=true npm run produce`: full text pipeline without TTS (needs `GEMINI_API_KEY`)
- `npm run check-feeds`: live check of every feed and market symbol (no key needed)

## Layout

- `podcast.config.yaml`: everything the owner tunes. Validated by the zod schema in `src/config.ts`; add new settings there first.
- `src/cli/produce.ts`: the pipeline. Writes everything to `out/`. Publishing is in `.github/workflows/daily.yml` (release → `register` → commit `data/` → `pages.yml`).
- `src/stages/`: `select` → `research` → `write` → `review` (the content loop).
- `src/llm.ts`: Gemini text calls (throttle, retry, JSON + zod validation, optional OpenRouter fallback). `src/tts.ts`: Gemini multi-speaker TTS.
- `data/episodes.json`: episode history; drives the news window, follow-ups, Monday look-back and Friday prediction check. Transcripts and notes live in `data/transcripts/` and `data/notes/`.

## Rules

- Content is final before voicing. The order is: rules + fact-check → revise (max `quality.max_revisions`) → TTS → real-length check (warning only). Don't voice inside the loop.
- Market numbers come only from `src/markets.ts` (Yahoo chart API). Never from model recall. `unmatchedMarketNumbers` enforces this on Thursdays.
- Opening/closing lines (incl. the AI-host disclosure) are inserted from config in code, not written by the model.
- Never handle API key values: the owner sets secrets with `gh secret set`.
- The repo lives on the owner's personal GitHub account, never a work account.
- No voice cloning of real people.

## Not yet verified live

Gemini model IDs (`gemini-flash-latest`, `gemini-3.1-flash-tts-preview`), voice names (Aoede, Charon), free-tier rate limits, and grounding availability on the free tier. Feeds and market symbols were checked on 2026-10-15.
