# Signal Check run: FAILED in tts

- Date: 2026-10-16
- Format: friday (prediction_check)
- Target: 12 min (1800 words)
- News window: 2026-10-15T06:37:28.864Z → 2026-10-16T12:37:28.864Z, 282 items
- Failed feeds: ERR News (HTTP 403)

## Failure
Stage: tts

```
{"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing. Learn more at https://ai.google.dev/gemini-api/docs/billing#prepay. ","status":"RESOURCE_EXHAUSTED"}}
```

## Stories
- main 1: US senators call for investigation into Ukraine's Starlink restrictions (s6)
- main 2: Linus Torvalds posts his first AI-assisted patch to the Linux kernel, synthetic test clocks 23x performance leap (s44)
- headline: US senators call for investigation into Ukraine's Starlink restrictions (s6)
- headline: Linus Torvalds posts his first AI-assisted patch to the Linux kernel, synthetic test clocks 23x performance leap (s44)
- headline: Trump just effectively killed a popular solar energy program for rural America (s87)
- headline: 264 million euro contract signed for Rīga Airport rail link (s35)
- headline: Targeted ads delivered 0-click exploits to install mercenary malware (s144)
- segment: Jailbroken PS5s can now run local AI models at over 100+ tokens per second (s63)
- segment: How to be a (Roman) man (s64)
- quick hit: Is Apple’s foldable iPhone Duo worth $2,000? See how it stacks up against other foldable phones. (s14)
- quick hit: Sega and Creative Assembly remove Total War: Shogun 2 remaster from sale as it "falls short of both your expectations and our own standards" (s85)
- quick hit: Ukrainian drones hit Russian data centers, disrupting Russian apps and services (s50)
- quick hit: How Do Fungi Keep the Planet Healthy? (s219)

## Models
| Stage | Calls | Model |
| --- | --- | --- |
| select | 1 | gemini-3.7-flash |
| research | 2 | gemini-flash-lite-latest, gemini-3.7-flash |
| write | 1 | gemini-flash-lite-latest |
| fact-check | 1 | gemini-flash-lite-latest |
| revise | 1 | (none) |
| tts | 12 | gemini-3.8-flash-tts, (none), gemini-3.8-flash-lite-tts, gemini-3.1-flash-tts-preview, gemini-3.1-flash-tts-preview (failed) |

Fallbacks hit:
- select: gemini-flash-latest (429 You exceeded your current quota, please check your plan and billing details.) → gemini-3.7-flash
- research:s6: gemini-flash-latest (demoted) → gemini-3.7-flash (503 This model is currently experiencing high demand. Spikes in demand are usual) → gemini-3.5-flash (503 This model is currently experiencing high demand. Spikes in demand are usual) → gemini-flash-lite-latest
- research:s44: gemini-flash-latest (demoted) → gemini-3.7-flash
- write: gemini-flash-latest (demoted) → gemini-3.7-flash (429 You exceeded your current quota, please check your plan and billing details.) → gemini-3.5-flash (503 This model is currently experiencing high demand. Spikes in demand are usual) → gemini-flash-lite-latest
- fact-check: gemini-flash-latest (demoted) → gemini-3.7-flash (demoted) → gemini-3.5-flash (demoted) → gemini-flash-lite-latest
- revise: gemini-flash-latest (demoted) → gemini-3.7-flash (demoted) → gemini-3.5-flash (demoted) → gemini-flash-lite-latest (503 This model is currently experiencing high demand. Spikes in demand are usual) → (none)
- tts:4: gemini-3.8-flash-tts (429 You exceeded your current quota, please check your plan and billing details.) → (none)
- tts:4: gemini-3.8-flash-lite-tts (429 You exceeded your current quota, please check your plan and billing details.) → (none)

## Review
### Round 1 (1026 words), kept
- [major] Script is 1026 words; target is 1800. Fix: Add about 774 words of substance. (rules)

### Round 2 (failed)
- [major] The revise call failed in round 2: {"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}} Fix: Check the run log; the best reviewed draft was kept. (pipeline)

## TTS
| Chunk | Words | Chars | Seconds | Ratio | Model | Finish | Check |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 365 | 2425 | 136.5 | 0.93 | gemini-3.1-flash-tts-preview | STOP | ok |
| 2 | 302 | 1908 | 109.2 | 0.9 | gemini-3.1-flash-tts-preview | STOP | ok |
| 3 | 341 | 2056 | 135.8 | 1 | gemini-3.1-flash-tts-preview | STOP | ok |
