== HEADLINES ==
[s55] Zelensky rallies EU support as Trump says Ukraine leader 'more difficult to deal with than Putin'
(BBC World, 2026-10-16T10:37Z, topic world) https://www.bbc.co.uk/news/articles/c58jz174w89ro?at_medium=RSS&at_campaign=rss
The US president launches a new wave of blistering criticism at Volodymyr Zelensky ahead of a meeting of EU leaders in Brussels.

[s41] Estonia wants to block Russian gas transit through Baltics for good
(ERR News, 2026-10-16T11:05Z, topic estonia) https://news.err.ee/1610168398/estonia-wants-to-block-russian-gas-transit-through-baltics-for-good
Energy minister Erkki Keldo (Reform) wants to work with Latvia to permanently stop Russian gas transit through the Baltics, with other options on the table if talks fail.

[s58] Linus Torvalds posts his first AI-assisted patch to the Linux kernel, synthetic test clocks 23x performance leap
(Tom's Hardware, 2026-10-16T10:30Z, topic selfhosting) https://www.tomshardware.com/software/linux/linus-torvalds-posts-his-first-llm-assisted-patch-to-the-linux-kernel-after-issuing-clear-pro-ai-directives-the-bossman-makes-use-of-ai-tooling-himself
Linus Torvalds posts his first LLM-assisted patch to the Linux kernel — after issuing clear pro-AI directives, the bossman makes use of AI tooling himself

[s10] Germany, France agree on deal to support Europe's struggling car industry
(DW, 2026-10-16T12:45Z, topic world) https://www.dw.com/en/germany-france-agree-on-deal-to-support-europe-s-struggling-car-industry/a-79678595?maca=en-rss-en-all-1573-rdf
The two countries said the agreement aimed to safeguard Europe's automotive industry, encouraging development and research. Automakers in Europe have so far struggled to compete with Chinese electric car companies.

[s105] Trump just effectively killed a popular solar energy program for rural America
(Grist, 2026-10-16T08:15Z, topic climate) https://grist.org/food-and-agriculture/solar-panels-farms-trump-reap-rural-energy-for-america-program-changes/
Solar panels can be an economic lifeline for farmers. Now they're going to be a lot harder to build.

== MAIN STORY 1 ==
Angle: Linus Torvalds committing his first AI-assisted patch marks a pragmatic cultural turning point for open-source systems programming.
[s58] Linus Torvalds posts his first AI-assisted patch to the Linux kernel, synthetic test clocks 23x performance leap
(Tom's Hardware, 2026-10-16T10:30Z, topic selfhosting) https://www.tomshardware.com/software/linux/linus-torvalds-posts-his-first-llm-assisted-patch-to-the-linux-kernel-after-issuing-clear-pro-ai-directives-the-bossman-makes-use-of-ai-tooling-himself
Linus Torvalds posts his first LLM-assisted patch to the Linux kernel — after issuing clear pro-AI directives, the bossman makes use of AI tooling himself

Article excerpt:
(Image credit: Getty Images)
Copy link
Facebook
X
Whatsapp
Reddit
Pinterest
Flipboard
Email
Share this article
0
Join the conversation
Follow us
Add us as a preferred source on Google
Newsletter
Subscribe to our newsletter
After a few revisions of his position on AI-assisted contributions to the Linux kernel, Linus Torvalds has posted his own first LLM-assisted patch. The development branch purports to fix an old issue with massive cache contention when many CPUs are reading the same file &mdash; a scenario potentially encountered when using shared libraries, databases, and web servers. Several developers had already made attempts over the years at fixing the issue, all with varied results, none quite ideal as an all-encompassing solution.
Go deeper with TH Premium: AI and data centers
(Image credit: Microsoft)
The data center cooling state of play
The custom AI ASIC state of play
America&rsquo;s AI chip rules keep changing &mdash; and the rest of the world is paying the price
GTC 2026: Ian Buck press Q&A transcript &mdash; VP of Hyperscale and HPC speaks out on shelving CPX and shipping LPU decode this year
Demand for data center CPUs has surged, and AI agents are responsible
Torvalds posted his own draft for solving the problem in early 2024 , and has used it on his own laptop since that time. However, he recently took the plunge and decided to "try to actually solve this thing using an LLM." He's now posted his solution in a development branch, and claims that he's seen a 23x performance improvement in a dedicated synthetic benchmark, though he notes that actual real-world impact will be far less significant, as "no real load" will witness those figures. If we had to guess, this improvement would benefit server workloads far more than desktop machines.
Over time, Torvalds has broadly taken a pro-AI stance on LLM tooling, at least within the purview of the tightly controlled, review-heavy environment of the Linux kernel code. Last July, he stated he's "willing to absolutely put [his] foot down" on AI haters, pointing out that an automated code review tool the kernel team uses outperforms humans, and that it caught basic programming mistakes that shouldn't have been submitted in the first place.
Latest Videos From Tom's Hardware
Watch full video here:
The team is even changing its policy to no longer require that patch authors disclose they used an AI tool when generating their code. Torvalds once again took an assertive stance, reiterating that users sho

Research notes:
(Written without web search; treat as background only.)
Here is the research breakdown for your podcast segment based strictly on the provided reporting.

1. What Happened, Precisely

On October 16, 2026, Tom's Hardware reported that Linux creator Linus Torvalds posted his first LLM-assisted patch to a Linux kernel development branch.

The patch targets a long-standing issue involving heavy CPU cache contention when multiple processors read the same file at the same time—a bottleneck common in web servers, databases, and shared libraries.

Torvalds reported that the patch produced a 23-times performance improvement in a dedicated synthetic benchmark. However, Torvalds explicitly qualified this claim, stating that the real-world impact will be far smaller because "no real load" will experience conditions matching that synthetic benchmark. 


2. Background and Context

Multiple developers had attempted to fix this cache contention issue over several years without finding an ideal, all-encompassing solution. Torvalds had previously drafted his own workaround in early 2024 and ran it on his personal laptop. He recently turned to an LLM to attempt a more complete solution.

This development follows an evolving stance on AI inside the Linux kernel project:
- In July (the article does not specify the year, though context suggests 2026), Torvalds stated he was "willing to absolutely put [his] foot down" against anti-AI sentiment in kernel development. He argued that automated review tools used by the team were outperforming humans at catching basic coding mistakes.
- The kernel team is actively updating its policies to eliminate the requirement that contributors disclose whether an AI tool was used to generate their code.


3. Arguments and Reactions

Pro-AI Tooling View (Linus Torvalds and maintainer perspective):
- Torvalds views LLMs simply as practical development tools, directly comparing them to code editors or compilers. 
- His stated standard is pragmatic: the kernel team does not need disclosures as long as contributors "do their best" and genuinely "understand what they are doing."
- Tom's Hardware contributor Bruno Ferreira argues that seasoned kernel maintainers using LLMs to eliminate tedious, repetitive tasks is fundamentally different from inexperienced developers blindly generating code they do not understand.

Concerns and Friction Points:
- Automated AI scanning has created severe administrative strain. Earlier in the year, AI agents hunting for security vulnerabilities flooded the Linux security mailing list, making it "unmanageable."
- The kernel has been addressing roughly 2,000 CVEs per release cycle due to automated scanning.
- To cope with the flood of automated vulnerability reports, the kernel team has been forced to drop older hardware drivers that have tiny user bases simply to reduce reporting overhead.


4. What Is Still Unknown or Disputed

- The specific model used: The report does not name which AI model, vendor, or tool Torvalds used, noting only that he used "an LLM."
- Mainline integration: It is not yet known if or when this patch will be merged from the development branch into the stable, mainline Linux kernel.
- Real-world performance: While the synthetic benchmark reached a 23x speedup, measurable gains in live production environments remain unverified. Tom's Hardware speculated that server workloads would benefit more than desktop environments, but this is an unverified guess.
- Timeline of the policy rollout: The exact timeline and text for the updated patch disclosure policy are not specified.


5. What to Watch Next

- Review and merge status: Watch whether the patch passes review on the Linux kernel mailing list and whether Torvalds merges it into the mainline tree.
- Production benchmarking: Look for independent tests on production database and web server workloads to measure the actual performance impact beyond synthetic benchmarks.
- Policy fallout: Monitor how maintainers handle incoming pull requests once disclosure requirements are officially dropped, particularly alongside the ongoing strain of AI-generated security reports.

Sources: https://www.tomshardware.com/software/linux/linus-torvalds-posts-his-first-llm-assisted-patch-to-the-linux-kernel-after-issuing-clear-pro-ai-directives-the-bossman-makes-use-of-ai-tooling-himself

== MAIN STORY 2 ==
Angle: Estonia’s push to permanently halt Russian gas transit tests Baltic coordination and forces Europe to close its remaining energy loopholes.
[s41] Estonia wants to block Russian gas transit through Baltics for good
(ERR News, 2026-10-16T11:05Z, topic estonia) https://news.err.ee/1610168398/estonia-wants-to-block-russian-gas-transit-through-baltics-for-good
Energy minister Erkki Keldo (Reform) wants to work with Latvia to permanently stop Russian gas transit through the Baltics, with other options on the table if talks fail.

Article excerpt:
News
Maria-Ann Rohemäe
{{1792148700000 | amCalendar}} kopeeri link -->
share Facebook X (Twitter) Messenger --> e-mail
Erkki Keldo. Source: Ken Mürk/ERR
News
Energy minister Erkki Keldo (Reform) wants to work with Latvia to permanently stop Russian gas transit through the Baltics, with other options on the table if talks fail.
Speaking to ERR, the Estonian energy and environment minister said he plans to meet his Latvian counterpart as soon as Latvia's new government is in place.
"The valve, so to speak, that we can physically control on the Estonian side is closed, so nothing can flow through there," Keldo explained, referring to a natural gas pipeline that runs through Southeastern Estonia. "But the other physical pipe and valve are on the Latvian side, and we need to discuss this with the Latvians and Lithuanians."
He noted that the section of pipeline belongs to state-owned grid operator Elering and is used solely for transit, stressing that no gas from it can enter Estonia's domestic network.
Keldo declined to speculate before the two ministers met on whether Latvia would agree to shut off the supply, but he made his own position clear.
"We'll look at what intervention options and solutions are available," he said. "Since, unfortunately, [the pipeline] is operated by a Latvian state-owned operator, this is also a matter for negotiations with our neighbors and allies. But I can certainly say that I don't think this is right."
The minister said sanctions or other measures should be considered only after talks with Latvia.
The two countries have both advocated raising the cost of Russia's continued aggression in Ukraine through sanctions and additional tariffs, Keldo noted.
In light of this, while no Russian gas has flowed through the pipeline for more than two years already, he hoped his Latvian counterpart would help find a way to ensure it won't resume in the future either.
"I believe and hope we can reach an agreement with the Latvians," the minister said. "But if we can't, we'll have to look at what other options are available."
Sector politicians unaware
Earlier this week, Eesti Ekspress reported that Estonia is maintaining a natural gas pipeline running through V&otilde;ru County that Russia can use to supply its exclave of Kaliningrad Oblast.
The paper noted that none of the Estonian politicians responsible for overseeing the sector in recent years were aware of the Russian gas pipeline arrangement.
Kaliningrad relies on Russian gas to fuel its p

Research notes:
(Written without web search; treat as background only.)
WHAT HAPPENED

On October 16, 2026, Estonian public broadcaster ERR reported that Estonia's Minister of Energy and the Environment, Erkki Keldo (Reform Party), wants to reach an agreement with Latvia to permanently shut down Russian natural gas transit through the Baltic states. 

The issue involves a transit pipeline running through Võru County in southeastern Estonia. According to Keldo:
- The Estonian section of the pipeline is owned by Estonia's state-owned grid operator, Elering. 
- It is used solely for transit, and no gas from it can enter Estonia’s domestic grid.
- The physical valve controlled by Estonia is currently closed, meaning no gas is flowing through the Estonian side.
- No Russian gas has flowed through this specific pipeline for more than two years.
- However, another connected pipe and valve sit on the Latvian side and are run by a Latvian state-owned operator.

Keldo stated that he plans to meet with his Latvian counterpart as soon as a new Latvian government is formed to negotiate a permanent closure. If Latvia does not agree, Keldo stated Estonia will consider other options, including potential sanctions or unilateral interventions.

This followed an investigation published earlier that week by the newspaper Eesti Ekspress, which revealed that Estonia has been maintaining this pipeline, which Russia can use to transit gas to its Baltic exclave of Kaliningrad. Eesti Ekspress reported that none of the Estonian politicians responsible for overseeing the energy sector in recent years were aware the pipeline arrangement was still in place.


BACKGROUND AND CONTEXT

Kaliningrad Oblast is a Russian exclave sandwiched between Lithuania and Poland, physically cut off from mainland Russia. It relies heavily on natural gas to run its domestic power plants.

Historically, the Baltic states were deeply integrated into Russian energy infrastructure, including gas transit routes and the Soviet-era BRELL electricity grid. In February 2025, Estonia, Latvia, and Lithuania completed their long-planned disconnection from the Russian-controlled power grid to synchronize with continental Europe. That decoupling left Kaliningrad operating as an electrically isolated system, increasing the strategic sensitivity of its remaining energy links, including gas transit routes through Baltic territory.


REACTIONS AND ARGUMENTS

Estonian Government (Minister Erkki Keldo):
- The core argument is moral and strategic consistency. Keldo argued that both Estonia and Latvia have actively pushed to raise the costs of Russia's war in Ukraine via international sanctions and tariffs. Allowing infrastructure that could supply Russia's Kaliningrad exclave to remain operational contradicts that policy.
- Keldo stressed that while the pipeline currently carries no gas, keeping it ready for future transit is unacceptable: "I certainly say that I don't think this is right."

Estonian Political Oversight (as reported by Eesti Ekspress):
- Political figures responsible for the energy sector in recent years told Eesti Ekspress they were completely unaware that the state grid operator was maintaining this Kaliningrad-linked transit pipeline.

Latvian Position:
- Latvia's position is not yet known. Keldo declined to speculate on whether Latvian officials will agree to permanently close the transit link, noting that talks can only occur once Latvia's incoming government is formally seated.


WHAT IS UNKNOWN OR DISPUTED

- Latvian stance: It is entirely unclear whether the incoming Latvian government will support a permanent shutdown, what legal or commercial obligations their state-owned operator holds, or what economic impact a permanent closure would have on Latvia.
- "Other options": Keldo did not specify what exact measures Estonia would take if bilateral talks fail, beyond mentioning that sanctions or intervention options would be evaluated.
- Legal and technical mechanisms: It is unclear under what contracts or legal frameworks Elering and the Latvian operator maintained this transit arrangement, or what contractual penalties, if any, could arise from a unilateral permanent shutdown.
- Lithuania's role: Keldo noted the matter also requires discussions with Lithuania, but Lithuania's formal stance on this specific pipeline section is not detailed in the report.


WHAT TO WATCH NEXT

- Formation of Latvia's new government: Formal bilateral discussions cannot begin until the incoming Latvian administration takes office and an energy minister is appointed.
- Bilateral and trilateral Baltic talks: Watch for a scheduled meeting between Keldo and his Latvian counterpart, as well as outreach to Lithuanian energy officials.
- Estonian domestic fallout: Look for potential parliamentary or ministerial inquiries into state grid operator Elering, specifically examining why sector ministers were unaware that the transit pipeline was being actively maintained.
- Escalation to unilateral steps: If Latvia resists a negotiated shutdown, watch whether Estonia attempts to impose domestic sanctions or regulatory bans to permanently decommission its section of the infrastructure.

Sources: https://news.err.ee/1610168398/estonia-wants-to-block-russian-gas-transit-through-baltics-for-good

== SEGMENT: Prediction check and weekend picks ==
No predictions are waiting to be graded. Say so in one line and spend the time on weekend picks.

Weekend pick candidates:
[s78] Jailbroken PS5s can now run local AI models at over 100+ tokens per second
(Tom's Hardware, 2026-10-16T10:00Z, topic selfhosting) https://www.tomshardware.com/video-games/playstation/jailbroken-ps5s-can-now-run-local-ai-models-at-over-100-tokens-per-second-fork-of-ps5lm-goes-native-and-accesses-gpu-and-more-ram
PS5LM gets a fork, allowing it to run natively and use the GPU and more RAM to run larger LLMs, even running Qwen3.8-27B at 20 tokens per second.

[s79] How to be a (Roman) man
(Aeon, 2026-10-16T10:00Z, topic culture) https://aeon.co/essays/the-politics-of-masculinity-at-the-end-of-the-roman-republic
Cicero’s ideal of manly virtue stressed the performance of self-control and bravery, not boastful egotism and domination - by Catharine Edwards Read on Aeon

[s197] After almost three years of early access, Enshrouded has hit 1.0 with a complete story, bigger map, and way too much more to mention
(Rock Paper Shotgun, 2026-10-15T17:01Z, topic gaming) https://www.rockpapershotgun.com/after-almost-three-years-of-early-access-enshrouded-has-hit-10-with-a-complete-story-bigger-map-and-way-too-much-more-to-mention
The increasing number of early access games always throws me off, because one day you're seeing an announcement of a game releasing, and then a while (normally years) later, you see another announcement for said game releasing. Feels like I'm in a constant Groundhog Day situation, probably not good for my sense of the passage of time. Anyway! Existentialism aside, after launching into early access almost three years ago, Enshrouded is now out in 1.0. Read more

This week's stories:


== QUICK HITS ==
[s103] Sega and Creative Assembly remove Total War: Shogun 2 remaster from sale as it "falls short of both your expectations and our own standards"
(GamesIndustry.biz, 2026-10-16T08:22Z, topic gaming) https://www.gamesindustry.biz/sega-and-creative-assembly-remove-total-war-shogun-2-remaster-from-sale-as-it-falls-short-of-both-your-expectations-and-our-own-standards
Sega and Creative Assembly have temporarily withdrawn Total War: Shogun 2 – Complete Edition from sale in response to concerns about AI upscaling and other performance issues. Read more

[s86] Here are the key things Fed Chairman Kevin Warsh said — and didn’t say — while Americans were sleeping Thursday night
(MarketWatch, 2026-10-16T09:16Z, topic markets) https://www.marketwatch.com/story/here-are-the-key-things-fed-chairman-kevin-warsh-said-and-didnt-say-while-americans-were-sleeping-thursday-night-b82238a1?mod=mw_rss_topstories
Federal Reserve Chairman Kevin Warsh had the opportunity Thursday night to shape expectations before the central bank’s interest-rate-setting meeting in two weeks — and in keeping with his practice of leaving markets guessing, he chose not to.

[s146] PhD students who write dissertation with AI less likely to stay in academia
(Nature News, 2026-10-16T00:00Z, topic science) https://www.nature.com/articles/d41586-026-03253-2


[s158] KDE turns 30 with Plasma 6.8, remote upgrades, and an X11 farewell
(Ars Technica, 2026-10-15T22:21Z, topic ai_software) https://arstechnica.com/gadgets/2026/10/kde-turns-30-with-plasma-6-8-remote-upgrades-and-an-x11-farewell/
KDE celebrates 30 years with a new Plasma release, a farewell to X11, and a movie.

== MARKET TABLE (only source for market numbers) ==
S&P 500: latest close 7744.06 USD on 2026-10-15; day 0.33%; 5 sessions -0.27%
Nasdaq 100: latest close 29935.60 USD on 2026-10-15; day -0.05%; 5 sessions -2.57%
DAX: latest close 25382.62 EUR on 2026-10-15; day 0.33%; 5 sessions 2.32%
EUR/USD: latest close 1.1195 USD on 2026-10-15; day -0.08%; 5 sessions -0.06%
Bitcoin: latest close 82141.46 USD on 2026-10-15; day 0.71%; 5 sessions -0.93%
Gold: latest close 4170.10 USD on 2026-10-15; day 1.51%; 5 sessions 0.32%
Brent oil: latest close 105.92 USD on 2026-10-15; day -0.13%; 5 sessions 1.57%