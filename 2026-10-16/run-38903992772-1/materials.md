== HEADLINES ==
[s48] Zelensky rallies EU support as Trump says Ukraine leader 'more difficult to deal with than Putin'
(BBC World, 2026-10-16T10:37Z, topic world) https://www.bbc.co.uk/news/articles/c58jz174w89ro?at_medium=RSS&at_campaign=rss
The US president launches a new wave of blistering criticism at Volodymyr Zelensky ahead of a meeting of EU leaders in Brussels.

[s51] Linus Torvalds posts his first AI-assisted patch to the Linux kernel, synthetic test clocks 23x performance leap
(Tom's Hardware, 2026-10-16T10:30Z, topic selfhosting) https://www.tomshardware.com/software/linux/linus-torvalds-posts-his-first-llm-assisted-patch-to-the-linux-kernel-after-issuing-clear-pro-ai-directives-the-bossman-makes-use-of-ai-tooling-himself
Linus Torvalds posts his first LLM-assisted patch to the Linux kernel — after issuing clear pro-AI directives, the bossman makes use of AI tooling himself

[s34] Estonia wants to block Russian gas transit through Baltics for good
(ERR News, 2026-10-16T11:05Z, topic estonia) https://news.err.ee/1610168398/estonia-wants-to-block-russian-gas-transit-through-baltics-for-good
Energy minister Erkki Keldo (Reform) wants to work with Latvia to permanently stop Russian gas transit through the Baltics, with other options on the table if talks fail.

[s96] Sega and Creative Assembly remove Total War: Shogun 2 remaster from sale as it "falls short of both your expectations and our own standards"
(GamesIndustry.biz, 2026-10-16T08:22Z, topic gaming) https://www.gamesindustry.biz/sega-and-creative-assembly-remove-total-war-shogun-2-remaster-from-sale-as-it-falls-short-of-both-your-expectations-and-our-own-standards
Sega and Creative Assembly have temporarily withdrawn Total War: Shogun 2 – Complete Edition from sale in response to concerns about AI upscaling and other performance issues. Read more

[s98] Trump just effectively killed a popular solar energy program for rural America
(Grist, 2026-10-16T08:15Z, topic climate) https://grist.org/food-and-agriculture/solar-panels-farms-trump-reap-rural-energy-for-america-program-changes/
Solar panels can be an economic lifeline for farmers. Now they're going to be a lot harder to build.

== MAIN STORY 1 ==
Angle: Linus Torvalds personally authoring and merging an LLM-assisted patch to the Linux kernel represents a massive symbolic tipping point for AI adoption in critical open-source software.
[s51] Linus Torvalds posts his first AI-assisted patch to the Linux kernel, synthetic test clocks 23x performance leap
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
Here is the research brief for your podcast segment.

1. What Happened, Precisely

On October 16, 2026, Tom's Hardware reported that Linux creator Linus Torvalds posted his first LLM-assisted (large language model) patch to a Linux kernel development branch. 

The patch addresses a long-standing kernel problem: severe cache contention when multiple CPUs read the same file simultaneously, a bottleneck common in web servers, databases, and shared libraries.

Key numbers and claims:
- Torvalds claims the patch achieved a 23-fold (23x) performance leap, though he specifically noted this was in a dedicated synthetic benchmark test.
- Torvalds cautioned that real-world workloads will see much smaller gains, stating that "no real load" will witness those 23x figures.
- Important correction to the planned angle: The article states Torvalds posted the patch to a development branch; it does not state that it has been merged into the stable/mainline Linux kernel.

2. Background and How We Got Here

- Torvalds originally drafted a solution to this cache contention problem in early 2024 and had been running that version on his personal laptop. Several other developers had also attempted fixes over the years without producing a complete, ideal solution. Torvalds recently decided to use an LLM to try to solve it definitively.
- Over time, Torvalds shifted toward an openly pro-AI stance regarding kernel development. According to the report, "last July" (likely July 2026), he declared he was willing to "put [his] foot down" against anti-AI sentiment.
- Torvalds pointed out that an automated code review tool used by the kernel team outperformed human reviewers by catching basic programming errors before submission.
- Following this shift, the Linux kernel team decided to drop the requirement that contributors disclose whether they used AI tools to generate code. Torvalds has argued that LLMs should be treated like standard development tools, such as text editors or compilers, provided developers understand their code and do their best work.

3. Reactions and Strongest Arguments

Pro-AI arguments (Torvalds and kernel leadership):
- Productivity: Experienced developers can use LLMs to accelerate tedious tasks and solve difficult edge cases.
- Practicality: Torvalds argues that what matters is the quality and comprehension of the submitted code, not the specific tool used to write it.
- Tooling parity: Code review tools powered by automation can outperform humans at catching basic syntax and logic flaws.

Critical and cautionary arguments (from kernel maintainers and industry reporting):
- Administrative and security overload: Tom's Hardware notes that earlier in the year, AI agents hunting for vulnerability patterns caused the Linux security mailing list to become "unmanageable." 
- Churn and abandoned code: The kernel has been patching CVEs at a rapid rate of roughly 2,000 per release, forcing maintainers to drop support for older hardware drivers simply because automated reports flag them constantly, despite tiny real-world user bases.
- Novice vs. expert risk: Tom's Hardware author Bruno Ferreira pointed out the vast difference between an expert like Torvalds using an LLM to speed up complex work and inexperienced contributors blindly submitting AI-generated code ("make linux faster plz no mistakes").

4. What Is Still Unknown or Disputed

- Model and prompt details: The article does not name which LLM Torvalds used, what tool or harness he ran, or what specific prompts he provided.
- Merge status: It is not clear when, or if, this patch will be merged from the development branch into the mainline kernel.
- Real-world performance: The actual real-world benefit remains unmeasured. Tom's Hardware speculates it will help server workloads far more than desktop systems, but real-world benchmarks have not been published.
- Long-term code maintainability: It is unclear whether the LLM-generated code introduces subtle corner-case bugs that synthetic benchmarks missed.

5. What to Watch Next

- Kernel mailing list review: Watch the Linux Kernel Mailing List (LKML) for feedback, criticisms, or requested revisions from fellow kernel maintainers on Torvalds' development branch.
- Mainline merge decision: Track upcoming kernel release candidate windows to see if Torvalds officially merges the patch into mainline Linux.
- Downstream testing: Watch for enterprise server distributions (such as Red Hat Enterprise Linux or SUSE) to test the code against real-world database and web-server workloads to verify if performance gains materialize outside synthetic benchmarks.
- Broader open-source policy ripple effects: Watch whether other major open-source projects follow Linux's lead in removing AI disclosure requirements for patches.

Sources: https://www.tomshardware.com/software/linux/linus-torvalds-posts-his-first-llm-assisted-patch-to-the-linux-kernel-after-issuing-clear-pro-ai-directives-the-bossman-makes-use-of-ai-tooling-himself

== MAIN STORY 2 ==
Angle: Estonia's push to permanently eliminate Russian gas transit through the Baltics underscores a growing rift in European energy strategy as regional allies weigh sanctions against energy security.
[s34] Estonia wants to block Russian gas transit through Baltics for good
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
1. What Happened, Precisely

On October 16, 2026, Estonian Energy and Environment Minister Erkki Keldo (Reform Party) told public broadcaster ERR that Estonia wants to reach an agreement with Latvia to permanently shut down Russian natural gas transit infrastructure running through the Baltic states. 

The announcement followed an investigative report published earlier that week by the Estonian newspaper Eesti Ekspress. The paper revealed that Estonia continues to maintain a natural gas pipeline in Võru County (southeastern Estonia) that could technically be used to supply the Russian exclave of Kaliningrad Oblast.

Key operational details:
* The Estonian section of the pipeline is owned by Estonia’s state-owned transmission system operator, Elering. 
* Minister Keldo stated that the Estonian section is used strictly for transit and cannot feed gas into Estonia's domestic network.
* Keldo confirmed that the physical valve controlled by Estonia is closed and that no Russian gas has flowed through this pipeline for more than two years.
* However, connected pipeline segments and valves are operated by a Latvian state-owned operator. Keldo stated that shutting the transit corridor permanently requires coordinated action with Latvia and Lithuania.
* Keldo announced plans to meet with his incoming Latvian counterpart as soon as Latvia's new government takes office. He stated that if Latvia does not agree to close the transit route permanently, Estonia will evaluate other measures, including sanctions.


2. Background and Context

* Baltic Grid Desynchronization: In February 2025, Estonia, Latvia, and Lithuania disconnected from the Russian-controlled electricity grid. This separation left Russia's Kaliningrad Oblast as an isolated energy island, making the exclave heavily reliant on gas-fired thermal plants to sustain its local power grid.
* Domestic Awareness in Estonia: According to Eesti Ekspress, Estonian politicians who oversaw the energy sector in recent years were unaware that the state was maintaining a pipeline arrangement capable of facilitating gas transit to Kaliningrad.
* Broader Regional Policy: Both Estonia and Latvia have publicly advocated for ratcheting up costs on Russia over its war in Ukraine through European Union sanctions and trade tariffs.


3. Perspectives and Arguments

* Estonian Energy Ministry (Erkki Keldo): Keldo argues that keeping Russian transit infrastructure operational—even conditionally—is fundamentally wrong. His argument is that even though gas flows stopped more than two years ago, the Baltics must legally and physically eliminate the possibility of Russian transit ever resuming. He advocates direct neighbor-to-neighbor negotiations first, while keeping unilateral or alternative interventions on the table.
* Estonian Sector Oversight: According to Eesti Ekspress, past political leaders responsible for the portfolio argue, in effect, that they were unaware of the pipeline's operational maintenance and the arrangement tied to Kaliningrad.
* Latvia's Stance: Not yet represented. Keldo explicitly declined to speculate on what position Latvia would take during the upcoming talks. 

Note on the planned podcast angle: The prompt's draft framing suggests a "growing rift" between regional allies over sanctions versus energy security. Based strictly on the reporting, this is speculative. Keldo emphasized shared Baltic opposition to Russian aggression, and Latvia has not yet stated its position or pushed back. 


4. What Is Still Unknown or Disputed

* Latvia’s Official Position: It is entirely unconfirmed whether Latvia views maintaining the transit route as necessary or if they will readily agree to close it.
* Identity of the Pipeline Operator: The report mentions only an unnamed "Latvian state-owned operator" without identifying the specific company or its contractual obligations.
* Alternative Measures: Keldo mentioned looking at "other options" and "sanctions" if talks fail, but he did not specify what legal or operational powers Estonia has to restrict infrastructure controlled across the border.
* Institutional Responsibility: It remains unclear why Estonian political leaders were unaware of Elering's maintenance of the Kaliningrad transit corridor until the press investigation.


5. What to Watch Next

* The formation and confirmation of the new Latvian government.
* The scheduling and outcome of the ministerial meeting between Keldo, his Latvian counterpart, and Lithuanian representatives.
* Official statements from the Latvian Ministry of Climate and Energy and its state pipeline operator regarding the feasibility and legality of a permanent shutdown.
* Any follow-up statements from Estonian grid operator Elering regarding the maintenance costs, contractual terms, or operational purpose of the Võru County pipeline section.

Sources: https://news.err.ee/1610168398/estonia-wants-to-block-russian-gas-transit-through-baltics-for-good

== SEGMENT: Prediction check and weekend picks ==
No predictions are waiting to be graded. Say so in one line and spend the time on weekend picks.

Weekend pick candidates:
[s236] How Do Fungi Keep the Planet Healthy?
(Quanta Magazine, 2026-10-15T13:40Z, topic science) https://www.quantamagazine.org/how-do-fungi-keep-the-planet-healthy-20261015/
Evolutionary biologist Toby Kiers explains how fungal networks in soil trade nutrients with plants, help keep carbon underground, and strike bargains without having a brain. The post How Do Fungi Keep the Planet Healthy? first appeared on Quanta Magazine

[s126] Another Wireless Chip has a Hidden SDR Revealed
(Hackaday, 2026-10-16T05:00Z, topic selfhosting) https://hackaday.com/2026/10/15/another-wireless-chip-has-a-hidden-sdr-revealed/
The news of the past couple of weeks has seen the ESP32 turned into an software-defined radio (SDR) thanks to a hidden baseband mode, an exciting development by anyone’s standards. …read more

This week's stories:


== QUICK HITS ==
[s71] Jailbroken PS5s can now run local AI models at over 100+ tokens per second
(Tom's Hardware, 2026-10-16T10:00Z, topic selfhosting) https://www.tomshardware.com/video-games/playstation/jailbroken-ps5s-can-now-run-local-ai-models-at-over-100-tokens-per-second-fork-of-ps5lm-goes-native-and-accesses-gpu-and-more-ram
PS5LM gets a fork, allowing it to run natively and use the GPU and more RAM to run larger LLMs, even running Qwen3.8-27B at 20 tokens per second.

[s93] Estonia gets €32m EU funding for 'free world's first line of defense' surveillance
(ERR News, 2026-10-16T08:31Z, topic estonia) https://news.err.ee/1610168431/estonia-gets-32m-eu-funding-for-free-world-s-first-line-of-defense-surveillance
The European Commission has given preliminary approval for nearly €32 million toward Estonia's eastern border drone surveillance system, a project already partly built.

[s163] Ahead of Call of Duty: Modern Warfare 4's launch next week, unionised Activision testers have voted to authorise a strike
(Rock Paper Shotgun, 2026-10-15T20:27Z, topic gaming) https://www.rockpapershotgun.com/ahead-of-call-of-duty-modern-warfare-4s-launch-next-week-unionised-activision-testers-have-voted-to-authorise-a-strike
Call of Duty testers have voted to authorise a union strike. The union, formed back in March of 2024, is made up of almost 600 quality assurance workers at Activision, and plan to strike if conditions at the publisher don't change. Read more

[s89] Long after the Maui fires, toxic metals linger in residents’ bodies
(Grist, 2026-10-16T08:45Z, topic climate) https://grist.org/indigenous/long-after-the-maui-fires-toxic-metals-linger-in-residents-bodies/
The toxic exposures didn’t begin with the flames. Researchers are examining how fires impacted a community already harmed by plantation agriculture, development, and colonialism.

== MARKET TABLE (only source for market numbers) ==
S&P 500: latest close 7744.06 USD on 2026-10-15; day 0.33%; 5 sessions -0.27%
Nasdaq 100: latest close 29935.60 USD on 2026-10-15; day -0.05%; 5 sessions -2.57%
DAX: latest close 25382.62 EUR on 2026-10-15; day 0.33%; 5 sessions 2.32%
EUR/USD: latest close 1.1195 USD on 2026-10-15; day -0.08%; 5 sessions -0.06%
Bitcoin: latest close 82141.46 USD on 2026-10-15; day 0.71%; 5 sessions -0.93%
Gold: latest close 4170.10 USD on 2026-10-15; day 1.51%; 5 sessions 0.32%
Brent oil: latest close 105.92 USD on 2026-10-15; day -0.13%; 5 sessions 1.57%