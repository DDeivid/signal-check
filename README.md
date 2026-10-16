# Signal Check

A weekday news podcast that makes itself. Every morning (Mon–Fri, ready before 09:00 Tallinn time) a GitHub Actions run reads RSS feeds, picks and researches the stories, writes a two-host script, fact-checks and revises it, voices it with Gemini TTS and publishes it to a podcast feed that Spotify reads.

Mia (curious generalist) and Theo (sharp skeptic) are AI hosts, and every episode says so.

## How a run works

```
feeds + market data
  → pick stories (about 75% core topics, 25% outside them)
  → research the main stories (article text + web search)
  → write the script
  → content loop: rules + fact-check → revise with the concrete issues (up to 2×)
  → voices (only once the content is final)
  → MP3 → GitHub release → feed + site on GitHub Pages
```

| Day | Segment |
| --- | --- |
| Monday (~15 min) | Look-back: weekend roundup, week in review, still developing |
| Tuesday | Deep dive on the first main story |
| Wednesday | Far field: one story from well outside the usual topics |
| Thursday | Markets and numbers (numbers only from the market table) |
| Friday | Prediction check and weekend picks |

Every episode: opening → headlines → 2 main stories → the day's segment → quick hits → closing. About 12 minutes.

## Controlling the show

- **`podcast.config.yaml`**: hosts and voices, topics and the core/outside balance, feeds, weekday formats, lengths, models, quality rules. Edit it on GitHub; the next run uses it.
- **Voice direction**: each host has a default `delivery` in the config ("warm, curious, upbeat"), and the writer can add a short cue to a line ("amused", "serious"). Gemini 3.8 TTS gets both per line; the 3.1 fallback only gets the hosts' defaults, since inline cues could be read aloud.
- **Manual run** (Actions → Daily episode → Run workflow):
  - *Dry run*: writes and reviews the script without voicing or publishing. Download the `episode-…` artifact to read `review.md` and `transcript.md`.
  - *Weekday*: use another day's format.
  - *Minutes*: change the target length.
  - *Notes*: producer notes for today, e.g. "lead with the Estonian election".
- **Voice test** (Actions → Voice test) voices a short sample with several voice pairs. Download `voice-samples`, pick a pair and set it under `hosts` in the config.
- **Check feeds** (Actions → Check feeds, also every Sunday) reports dead or stale feeds and market symbols.

## Setup

1. Create a **public** repo named `signal-check` on your personal account and push this folder.
2. Settings → Pages → Source: **GitHub Actions**. Put the Pages URL in `show.site_url`.
3. Add the Gemini key (from [aistudio.google.com](https://aistudio.google.com/apikey)): `gh secret set GEMINI_API_KEY`
4. Run **Voice test**, pick voices.
5. Run **Check feeds**, fix anything that fails.
6. Run **Daily episode** as a dry run, read the review and transcript. Then a real run, and listen at your Pages URL.

Optional secrets:

| Secret | What for |
| --- | --- |
| `OPENROUTER_API_KEY` | Fallback when Gemini keeps failing; also set `llm.fallback_model` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Message when an episode is ready or a run fails |
| `NTFY_TOPIC` | Same, via ntfy.sh |

## Spotify

Submit `https://<site>/feed.xml` at [podcasters.spotify.com](https://podcasters.spotify.com). Spotify sends a code to the feed's email: set `show.owner_email`, wait for the Pages deploy, verify, then blank it again.

## Running locally

```
npm install
GEMINI_API_KEY=… SC_DRY_RUN=true npm run produce
npm test
```

Voice-only rerun (e.g. after TTS failed): `SC_RESUME_SCRIPT=path/to/script.json npm run produce` voices the reviewed script from an earlier run's `out/` folder (with the `notes.md` next to it) and writes `meta.json` as usual, without fetching, selecting, researching, writing or reviewing anything. It refuses a script dated other than today unless `SC_RESUME_ALLOW_OTHER_DATE=true`.

Without web search (`research.grounding: false`), Monday's still-developing threads and Friday's prediction check are researched from the news window's items only: every update cites item ids or says there's no update. Friday grades each prediction once (since the previous prediction check); too-early ones come back on the next two Fridays at most. Grades are stored as `predictionGrades` in `data/episodes.json`.

Voicing locally needs `ffmpeg`. `npm run cover` re-renders `assets/cover.png` from `assets/cover.svg`; `npm run jingle` regenerates the placeholder chimes.

## Costs and limits

Free: GitHub Actions and Pages are free for public repos, and Gemini's free tier covers the text and TTS calls (about 15 text calls and 5–6 TTS requests per episode). Free-tier inputs may be used by Google to improve its models; only public news goes in. Market data comes from Yahoo Finance's public chart endpoint (no key, unofficial).
