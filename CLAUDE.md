# Signal Check

Automated weekday news podcast. TypeScript (Node 22, ESM, run with `tsx`, no build step), runs on GitHub Actions, publishes MP3s as GitHub Release assets and the feed/site on GitHub Pages. README.md covers usage; this file covers working on the code.

## Commands

- `npm test`: vitest (pure logic: windows, dedupe, rules, market-number check, feed XML)
- `npm run typecheck`
- `SC_DRY_RUN=true npm run produce`: full text pipeline without TTS (needs `GEMINI_API_KEY`)
- `npm run validate-audio`: independent check of `out/meta.json` + its MP3 (ffprobe, size, silencedetect); the workflow runs it before the release
- `npm run rehearsal`: whole pipeline offline with the fake AI (`SC_FAKE_AI=true`), fixture feeds (`SC_FIXTURE_FEEDS`) and markets (`SC_FIXTURE_MARKETS`), plus a voice-only rerun (`SC_RESUME_SCRIPT`) of the good run and a silent-chunk run that must be stopped. Needs ffmpeg (exits 2 without it)
- `npm run check-feeds`: live check of every feed and market symbol (no key needed)

## Layout

- `podcast.config.yaml`: everything the owner tunes. Validated by the zod schema in `src/config.ts`; add new settings there first.
- `src/cli/produce.ts`: the pipeline. Writes everything to `out/`, including `summary.md`, `error.txt` (on failure), `selection.json`, `research.json` and `tts.json` for debugging. Publishing is in `.github/workflows/daily.yml` (release → `register` → commit `data/` → `pages.yml`).
- `src/stages/`: `select` → `research` → `write` → `review` (the content loop). `followups.ts`: Monday threads and Friday prediction grading, with the news window's items as evidence.
- `src/resume.ts`: the `script.json` format (everything needed to voice again) and `SC_RESUME_SCRIPT` loading. A resumed run skips straight to TTS; `SC_RESUME_ALLOW_OTHER_DATE=true` allows a script from another day.
- `src/art.ts`: the episode image (lead story, Gemini image model, after the audio passes), and its WebP (sharp is loaded only there, so a broken native module costs only the image). `src/color.ts` picks the theme colour from the image's pixels, and `cardTheme` turns it into light and dark card colours that pass 4.5:1. `src/site.ts` builds the feed of cards; `npm run art -- <date>` and `art.yml` make the image for a published episode.
- `src/llm.ts`: Gemini text calls (throttle, retry, JSON + zod validation, optional OpenRouter fallback). `src/tts.ts`: Gemini multi-speaker TTS.
- `data/episodes.json`: episode history; drives the news window, follow-ups, Monday look-back and Friday prediction check. Transcripts and notes live in `data/transcripts/` and `data/notes/`.

## Rules

- Content is final before voicing. The order is: rules + fact-check → revise (max `quality.max_revisions`, best reviewed draft kept) → TTS → audio checks. Don't voice inside the loop.
- Never publish a broken episode. Each TTS chunk is checked (`src/audio-qa.ts`: length vs words, silence, format) and retried once; one TTS model per episode; the MP3 must reconcile with its parts and reach 0.6 × target; `validate-audio` checks it again before release. Gates fail the run; don't turn them into warnings.
- Market numbers come only from `src/markets.ts` (Yahoo chart API). Never from model recall. `unmatchedMarketNumbers` enforces this on Thursdays.
- The episode image is optional: `makeArt` never throws, and a missing image only means drawn ridgelines on the site. It's the one exception to "gates fail the run"; audio gates stay hard.
- Opening/closing lines (incl. the AI-host disclosure) are inserted from config in code, not written by the model.
- Never handle API key values: the owner sets secrets with `gh secret set`.
- The repo lives on the owner's personal GitHub account, never a work account.
- No voice cloning of real people.

## Not yet verified live

Gemini model IDs (`gemini-flash-latest`, `gemini-3.1-flash-tts-preview`, the image models `gemini-3.1-flash-image-preview` and `gemini-2.5-flash-image`), free-tier rate limits, and grounding availability on the free tier. Feeds and market symbols were checked on 2026-10-15.
