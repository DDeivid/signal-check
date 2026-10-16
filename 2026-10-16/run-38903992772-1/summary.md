# Signal Check run: FAILED in review

- Date: 2026-10-16
- Format: friday (prediction_check)
- Target: 12 min (1800 words)
- News window: 2026-10-15T06:56:27.106Z → 2026-10-16T12:56:27.106Z, 311 items
- Failed feeds: none

## Failure
Stage: review

```
Critical issues remain after the content loop (quality.on_unresolved = stop). See out/review.md.
```

## Stories
- main 1: Linus Torvalds posts his first AI-assisted patch to the Linux kernel, synthetic test clocks 23x performance leap (s51)
- main 2: Estonia wants to block Russian gas transit through Baltics for good (s34)
- headline: Zelensky rallies EU support as Trump says Ukraine leader 'more difficult to deal with than Putin' (s48)
- headline: Linus Torvalds posts his first AI-assisted patch to the Linux kernel, synthetic test clocks 23x performance leap (s51)
- headline: Estonia wants to block Russian gas transit through Baltics for good (s34)
- headline: Sega and Creative Assembly remove Total War: Shogun 2 remaster from sale as it "falls short of both your expectations and our own standards" (s96)
- headline: Trump just effectively killed a popular solar energy program for rural America (s98)
- segment: How Do Fungi Keep the Planet Healthy? (s236)
- segment: Another Wireless Chip has a Hidden SDR Revealed (s126)
- quick hit: Jailbroken PS5s can now run local AI models at over 100+ tokens per second (s71)
- quick hit: Estonia gets €32m EU funding for 'free world's first line of defense' surveillance (s93)
- quick hit: Ahead of Call of Duty: Modern Warfare 4's launch next week, unionised Activision testers have voted to authorise a strike (s163)
- quick hit: Long after the Maui fires, toxic metals linger in residents’ bodies (s89)

## Models
| Stage | Calls | Model |
| --- | --- | --- |
| select | 1 | gemini-flash-latest |
| research | 2 | gemini-flash-latest |
| write | 1 | gemini-flash-latest |
| fact-check | 3 | gemini-flash-latest |
| revise | 2 | gemini-flash-latest |

No fallbacks needed.

## Review
### Round 1 (1740 words)
- [critical] line 8: The price 'five-dollar' is a specific number not supported anywhere in source [s126]. Fix: Change 'popular five-dollar wireless chip' to 'popular cheap wireless chip' or 'ubiquitous wireless chip'. (fact-check)
- [minor] line 33: The segment instructions state: 'No predictions are waiting to be graded. Say so in one line and spend the time on weekend picks.' Introducing a new prediction and discussing it across lines 33–34 violates this formatting guidance. Fix: Remove Theo's new prediction and Mia's response in line 34, moving directly from line 32 into the first weekend pick. (fact-check)
- [critical] line 36: Specific details that fungi trade 'phosphorus and nitrogen' for 'sugars' and 'hoard nutrients when they are scarce' are not in source [s236], which only states that fungi 'trade nutrients with plants, help keep carbon underground, and strike bargains'. Fix: Rephrase to stick to the source: 'They act almost like an underground marketplace, trading nutrients to plant roots in exchange for carbon and striking bargains depending on local conditions.' (fact-check)
- [critical] line 40: The price 'five-dollar' is not in source [s126], nor does the snippet support the claims that the ESP32 powers 'smart light bulbs to DIY sensors' or is normally locked to 'standard Wi-Fi and Bluetooth protocols'. Fix: Revise to stick to the material: 'Because the ESP32 is a ubiquitous, widely used wireless chip. Turning it into a software-defined radio via a hidden baseband mode allows reverse engineers to capture and manipulate raw radio signals.' (fact-check)

### Round 2 (1694 words)
- [minor] line 33: The prompt instructed to state in one line that no predictions are waiting to be graded and spend the time on weekend picks, but lines 33 and 34 add an unrequested new prediction. Fix: Cut lines 33 and 34, and move directly from line 32 into introducing the first weekend pick. (fact-check)
- [critical] line 35: The term 'mycorrhizal' is not found anywhere in the provided materials. Fix: Change 'Kiers studies mycorrhizal fungi' to 'Kiers studies fungal networks in soil'. (fact-check)

### Round 3 (1696 words), kept
- [critical] line 38: The script states that the Hackaday article is about discovering a hidden SDR in the ESP32. However, the article headline is 'Another Wireless Chip has a Hidden SDR Revealed' and mentions the ESP32 discovery as context from 'the past couple of weeks'—the article itself covers a different wireless chip. Fix: Revise the line to state that Hackaday is covering another wireless chip found to have a hidden SDR, following up on the ESP32 discovery from recent weeks. (fact-check)
- [minor] line 42: The script claims the fork allows the console to use 'unified RAM', but the source text specifically states it accesses 'the GPU and more RAM'. Fix: Replace 'unified RAM' with 'more RAM'. (fact-check)
- [minor] line 45: The script specifies 'toxic heavy metals', but the source material refers more generally to 'toxic metals'. Fix: Change 'toxic heavy metals' to 'toxic metals'. (fact-check)
