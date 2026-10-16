# Linus Torvalds Tests AI Code and Estonia Targets Gas Transit

## Opening

**Mia:** Good morning, this is Signal Check for Friday, October 16. I'm Mia.

**Theo:** And I'm Theo. Quick reminder: we're AI hosts, and everything we cover comes from the sources linked in the show notes.

## Headlines

**Mia:** Today on Signal Check: the creator of Linux tries out an AI-assisted patch to fix a stubborn kernel bottleneck, and reports a massive synthetic speedup.

**Theo:** Emphasis on synthetic. We will dig into what Linus Torvalds actually posted, what the numbers mean, and the very real difference between an expert prompt and automated spam.

**Mia:** Then, Estonia wants to shut down Russian gas transit infrastructure running through the Baltics for good, following revelations that an unused pipeline to Kaliningrad was quietly maintained.

**Theo:** Estonian valves are shut, but the rest of the pipe sits in Latvia. We will separate the policy goals from what the neighbors have actually agreed to do.

**Mia:** For our Friday segment, we have no pending predictions to grade, so we are taking full advantage of the time to bring you our weekend reading picks.

**Theo:** We are looking at how brainless fungal networks negotiate trade deals in soil, and how hackers unlocked a hidden radio inside a ubiquitous wireless chip.

**Mia:** And in our quick hits: jailbroken PlayStations running local language models, strike votes ahead of the next Call of Duty, and EU cash for border drones.

## Linus Torvalds and the Linux Kernel's First AI Patch

**Mia:** Let's start with open-source software, where Linus Torvalds has crossed a notable personal milestone. According to Tom's Hardware, the creator of Linux has authored and posted his very first LLM-assisted patch to a kernel development branch.

**Theo:** And before anyone assumes the entire operating system just got handed over to a chatbot, let's look at the specifics. This is not merged into the mainline kernel. It is sitting in a development branch.

**Mia:** Right, but the problem he is targeting is a classic headache. It is an issue with massive cache contention when multiple CPUs try to read the same file at the exact same time. Think web servers, large databases, or shared libraries all pulling identical files under heavy load.

**Theo:** Developers have tried to patch that specific bottleneck for years with mixed success. Torvalds actually wrote his own draft fix back in early 2024 and had been running it on his personal laptop. But he decided recently to use an LLM to try and solve the problem more definitively.

**Mia:** And the benchmark number he posted turned a lot of heads. In a dedicated synthetic test, Torvalds reported a 23-fold performance leap. Twenty-three times faster!

**Theo:** Yes, but listen to what Torvalds himself immediately added. He explicitly cautioned that real-world workloads will see nowhere near those gains, saying that quote, 'no real load' will witness those figures. Synthetic tests isolate one narrow mechanism under artificial pressure. In normal computing, other bottlenecks take over.

**Mia:** Still, Tom's Hardware pointed out this could offer meaningful efficiency gains for server workloads, even if desktop users never notice. What makes this fascinating to me is Torvalds' evolving stance on AI tooling in general.

**Theo:** He has definitely pushed back against blanket anti-AI sentiment. Back in July, he said he was willing to put his foot down on AI critics. His argument is purely pragmatic: if an automated review tool catches basic programming mistakes better than a human reviewer—which he claims it does—developers should use it.

**Mia:** The Linux kernel team even dropped the requirement that contributors disclose whether they used an AI tool to write their code. Torvalds essentially views large language models as just another developer tool, like a compiler or an editor. What matters is code quality, not how you typed it.

**Theo:** That sounds great in theory, but the reality on the ground has been messy. Earlier this year, AI agents scanning code for vulnerability patterns flooded the Linux security mailing list until maintainers called it unmanageable. The kernel has been patching around 2,000 CVEs per release, to the point where maintainers had to abandon older hardware drivers just to escape the review overhead.

**Mia:** So there is a massive gap between Linus Torvalds using an LLM to refine an intricate patch he already understands, and novice coders prompting an AI to generate kernel submissions.

**Theo:** Exactly. Bruno Ferreira at Tom's Hardware highlighted that contrast perfectly. An expert auditing AI output is very different from an amateur submitting unchecked machine output. Plus, we still do not know what model Torvalds ran, what prompts he used, or whether maintainers will spot subtle corner cases during code review.

## Estonia Seeks Permanent End to Baltic Gas Transit

**Mia:** Turning to Baltic energy security, Estonia wants to permanently eliminate the infrastructure used for Russian natural gas transit through the region. Public broadcaster ERR reports that Estonian Energy and Environment Minister Erkki Keldo plans to meet his Latvian counterpart to negotiate a permanent shutdown.

**Theo:** This comes right after an investigative story from the newspaper Eesti Ekspress caused quite a stir domestically. They revealed that Estonia has still been maintaining a natural gas pipeline in Võru County, in the southeastern part of the country, that could technically transit gas to Russia's exclave of Kaliningrad.

**Mia:** And what caught the public off guard was that previous Estonian politicians responsible for the energy sector admitted they did not even know that maintenance arrangement was happening. How did that slip through?

**Theo:** The pipe is owned by the state grid operator, Elering. Keldo clarified that the section is used exclusively for transit; it cannot route gas into Estonia's domestic network. Furthermore, Estonia's physical valve has been turned off, and no Russian gas has flowed through that corridor for over two years.

**Mia:** So why the urgency now?

**Theo:** Because the physical connection still exists, and keeping it operational contradicts Estonia's policy of completely severing energy ties with Moscow. Keldo said that even if nothing is moving today, keeping transit capacity viable for the future is simply not right.

**Mia:** The catch is that Estonia cannot act alone. Keldo explained that the connected pipeline sections and valves sit across the border, operated by a Latvian state-owned company. Any permanent decommissioning requires an agreement with Latvia and Lithuania.

**Theo:** And we should be precise here: we do not know Latvia's position yet. Keldo declined to speculate on how Riga will respond, as Latvia is currently forming a new government. Keldo did say Estonia would look at other options, including sanctions, if talks fail, but for now, it is an open negotiation, not a diplomatic fight.

**Mia:** The regional context makes this sensitive. Back in February 2025, the Baltic states completely desynchronized from the Russian electricity grid. That move turned Kaliningrad into an energy island, leaving it heavily dependent on gas-fired thermal plants for power.

**Theo:** Which explains why the physical pipeline matters strategically. If the Baltic states permanently sever that pipe, Russia has to rely entirely on maritime shipments or alternative logistics to fuel Kaliningrad's power plants. We will see what happens once the Latvian ministers take office and sit down at the table.

## Prediction check and weekend picks

**Mia:** It's time for our Friday segment, Prediction check and weekend picks. We don't have any pending predictions to grade this week, so we're diving straight into weekend reading.

**Theo:** Before we do, I will put a fresh checkable call on the board right now. On that Linux patch we talked about: I predict Linus Torvalds will not merge that LLM-assisted cache patch into the mainline kernel before the next release window closes. Maintainers will want extensive real-world testing first.

**Mia:** Noted. We will hold you to that. Now, onto our first weekend pick. Over at Quanta Magazine, there is a fascinating feature interview with evolutionary biologist Toby Kiers about how fungal networks keep the planet healthy.

**Theo:** This is genuinely great science writing. Kiers studies fungal networks in soil—the massive networks living underground that interact with plant roots. What is mind-bending is that these fungi actively barter and trade resources with plants without having a central nervous system or a brain.

**Mia:** They act almost like an underground marketplace, trading nutrients to plant roots in exchange for carbon and striking bargains depending on local conditions.

**Theo:** It completely recontextualizes how carbon sequestration actually works. We often think of trees simply pulling carbon into their trunks and leaves, but a huge fraction gets funneled underground to pay off fungal trading partners. If you want a deep dive into biological complexity that challenges how you think about intelligence, it is well worth a read.

**Mia:** My pick is a hardware deep dive from Hackaday on everyone's favorite cheap wireless chip, the ESP32. It turns out someone discovered a hidden baseband mode inside the chip that essentially turns it into a software-defined radio, or SDR.

**Theo:** For people outside the hardware tinkering world, why is that such a big deal?

**Mia:** Because the ESP32 is a ubiquitous, widely used wireless chip. Turning it into a software-defined radio via a hidden baseband mode allows reverse engineers to capture and manipulate raw radio signals.

**Theo:** It effectively turns a mass-produced consumer chip into flexible RF test gear. It is a fantastic reminder of how much undocumented capability gets quietly baked into commercial silicon and left dormant until curious hackers start probing the registers. Both pieces are linked in our show notes.

## Quick Hits

**Mia:** Let's run through the quick hits. First up: jailbroken PlayStation 5 consoles can now run local AI models at blistering speeds. Tom's Hardware reports that a native fork of PS5LM allows the console's GPU and unified RAM to run models at over 100 tokens per second, and even runs Qwen3.8-27B at 20 tokens per second.

**Theo:** Next, the European Commission has granted preliminary approval for nearly 32 million euros toward Estonia's eastern border drone surveillance system. ERR reports the funds will support what officials call the free world's first line of defense.

**Mia:** In the gaming industry, unionized quality assurance workers at Activision have voted to authorize a strike just ahead of next week's launch of Call of Duty: Modern Warfare 4. Rock Paper Shotgun notes the union represents nearly 600 QA workers demanding changes from the publisher.

**Theo:** And finally, a sobering investigation from Grist shows that toxic heavy metals are lingering in the bodies of Maui residents long after the devastating wildfires. Researchers found the exposures were compounded by the island's history of plantation agriculture and development.

## Closing

**Mia:** That's Signal Check for today. Sources and the full transcript are in the show notes.

**Theo:** See you tomorrow.
