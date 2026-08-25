import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { Nav } from "@/components/site/Nav";
import { Reveal } from "@/components/site/Reveal";
import { DemoConsole } from "@/components/site/DemoConsole";
import { HeroVisual } from "@/components/site/HeroVisual";
import { GuideToConsole } from "@/components/Tour";
import { NeuralBackground } from "@/components/site/NeuralBackground";

const DIFFERENTIATORS = [
  {
    title: "Every answer carries a confidence rating",
    body: "Computed from the completeness of the exact fields the answer used, not a vibe. A number built on a 42%-filled column says so, in the answer.",
  },
  {
    title: "Show the working",
    body: "The trail of monday.com queries behind each answer stays attached to it. Any figure can be traced back to the query that produced it.",
  },
  {
    title: "Survives a restructured board",
    body: "No column names in the code. Rename a field or change a column type in monday.com and the next question still answers correctly.",
  },
  {
    title: "Briefs leave as text, not screenshots",
    body: "Any answer copies out as clean markdown, so a leadership update goes straight into a doc or a message without reformatting.",
  },
];

/** Real questions the agent handles, shown as a marquee instead of a list. */
const ASKABLE = [
  "How is our pipeline looking for the mining sector this quarter?",
  "How much have we billed but not collected?",
  "Which sector is performing best for us?",
  "How many work orders are still ongoing?",
  "Where is the gap between deals won and work executed?",
  "Prepare a leadership update for the board meeting.",
  "How trustworthy is the deals data?",
  "Which accounts are concentrating our revenue risk?",
];

const DATA_GROUPS = [
  {
    heading: "Dates",
    rows: [
      ["Four formats in one column", "ISO, day-first, textual, Excel serial"],
      ["Ambiguous day and month", "Resolved day-first, documented as an assumption"],
      ["Blank close dates", "Excluded from quarter splits, and the count is reported"],
    ],
  },
  {
    heading: "Numbers",
    rows: [
      ["Currency shapes", "₹1,20,000 and 1.2 Cr and (500) all parse"],
      ["Units inside values", "5360 HA reads as 5360"],
      ["Three columns named revenue", "Order, billed and collected stay separate"],
    ],
  },
  {
    heading: "Text",
    rows: [
      ["Twelve spellings of empty", "N/A, TBD, nil, dash, hash-N/A collapse to null"],
      ["Label drift", "Energy and energy and ENERGY_SECTOR group as one"],
      ["Masked repeated names", "Never treated as a unique key"],
    ],
  },
];

export default function Landing() {
  return (
    <div className="relative z-[1]">
      <NeuralBackground />
      <Nav />

      {/* Hero: asymmetric split. Eyebrow 1 of 2. */}
      <section className="mx-auto w-full max-w-[1180px] px-5 pt-10 pb-20 sm:pt-16 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:gap-14">
          <div>
            <div className="animate-fade-up">
              <span className="kicker">monday.com intelligence agent</span>
            </div>

            <h1
              className="display animate-fade-up mt-5 max-w-[24ch]"
              style={{ animationDelay: "90ms" }}
            >
              Founder questions,{" "}
              <span className="grad">answered from live data.</span>
            </h1>

            <p
              className="sub animate-fade-up mt-5 max-w-[46ch]"
              style={{ animationDelay: "180ms" }}
            >
              Ask about pipeline, sectors or cash. Every number is computed from monday.com at
              the moment you ask.
            </p>

            <div
              className="animate-fade-up mt-8 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "270ms" }}
            >
              <Link href="/console" data-tour="hero-cta" className="btn">
                Open the console
                <ArrowRightIcon size={15} weight="bold" />
              </Link>
              <GuideToConsole />
            </div>
          </div>

          <div className="animate-fade-up lg:pl-4" style={{ animationDelay: "330ms" }}>
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* How it works: stepped preview. No eyebrow. */}
      <section id="how" className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-5 py-20">
        <Reveal>
          <h2 data-tour="how" className="h2 max-w-[19ch]">
            One question in. Four things happen before a number comes out.
          </h2>
          <p className="sub mt-4 max-w-[56ch]">
            The model never adds up rows itself. It chooses a tool, the server computes the
            figure, and the same question returns the same answer every time.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-12">
          <DemoConsole />
        </Reveal>
      </section>

      {/* Differentiators: asymmetric bento, mixed cell sizes. Eyebrow 2 of 2. */}
      <section id="trust" className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-5 py-20">
        <Reveal>
          <span className="kicker">Beyond answering the question</span>
          <h2 data-tour="trust" className="h2 mt-4 max-w-[21ch]">
            The hard part is knowing when the number is worth trusting.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {DIFFERENTIATORS.map((d, i) => (
            <Reveal key={d.title} delay={i * 100}>
              <article className="tile h-full p-6">
                <span className="tile-index text-4xl">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="h3 mt-5 text-[1.05rem]">{d.title}</h3>
                <p className="mt-2.5 text-[13.6px] leading-relaxed text-[var(--muted)]">{d.body}</p>
              </article>
            </Reveal>
          ))}
        </div>

        {/* The three ratings the first pillar refers to, shown rather than described. */}
        <Reveal delay={200}>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            {[
              ["High", "var(--success)", "every field used was well populated"],
              ["Medium", "var(--warning)", "one field around 60% populated"],
              ["Low", "var(--danger)", "a key field under 40% populated"],
            ].map(([label, color, note]) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
                style={{
                  borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
                  background: `color-mix(in srgb, ${color} 7%, transparent)`,
                }}
              >
                <span className="text-[11.5px] font-semibold" style={{ color }}>
                  {label}
                </span>
                <span className="text-[11.5px] text-[var(--faint)]">{note}</span>
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Messy data: grouped columns, not a card grid. No eyebrow. */}
      <section id="data" className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-5 py-20">
        <Reveal>
          <h2 className="h2 max-w-[23ch]">
            Real board data is broken in ordinary ways.
          </h2>
          <p className="sub mt-4 max-w-[58ch]">
            Nothing is imputed and nothing is silently dropped. Every total reports how many rows
            it excluded for a blank value, because a number without its caveat is worse than no
            number.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-x-10 gap-y-10 md:grid-cols-3">
          {DATA_GROUPS.map((group, gi) => (
            <Reveal key={group.heading} delay={gi * 90}>
              <h3
                className="border-b pb-3 text-[13px] font-semibold"
                style={{ borderColor: "var(--line-2)" }}
              >
                {group.heading}
              </h3>
              <dl className="mt-4 flex flex-col gap-4">
                {group.rows.map(([term, def]) => (
                  <div key={term}>
                    <dt className="text-[13.5px] font-medium">{term}</dt>
                    <dd className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{def}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Architecture: split with code. No eyebrow. */}
      <section className="mx-auto w-full max-w-[1180px] px-5 py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
          <Reveal>
            <h2 className="h2">A tool-calling agent, not a text-to-SQL layer.</h2>
            <p className="sub mt-4">
              The model picks tools. The server owns the arithmetic. That costs some flexibility
              and buys reproducibility, which is the right trade for numbers that end up in a
              leadership deck.
            </p>
            <ul className="mt-8 flex flex-col gap-4">
              {[
                ["Schema discovered at runtime", "No column names in the code, so a restructured board keeps working."],
                ["Read-only by construction", "There is no monday.com mutation anywhere in the codebase."],
                ["Self-correcting tool errors", "A bad field name returns the valid keys, so the next turn fixes itself."],
                ["Keys never reach the browser", "Every credential stays inside the Next.js route handler."],
              ].map(([t, b]) => (
                <li key={t} className="flex gap-3">
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                  <span>
                    <span className="block text-[14px] font-semibold">{t}</span>
                    <span className="block text-[13.3px] leading-relaxed text-[var(--muted)]">
                      {b}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120}>
            <div className="glass glow p-6">
              <pre className="mono overflow-x-auto text-[11.5px] leading-[1.85] text-[var(--muted)]">
{`Browser  chat UI
   |
   |  POST /api/chat     SSE: text, tool_start, tool_end
   v
Next.js route handler
   |
   v
Agent loop              OpenAI + function calling
   |
   |  tool call
   v
Tool layer
   describe_boards
   aggregate_metrics
   query_records
   data_quality_report
   join_boards
   |
   v
Dataset layer
   normalise, type-infer, aggregate
   60s request-scoped cache
   |
   v
monday.com client
   GraphQL, retry with backoff, pagination
   |
   v
monday.com API v2       read-only`}
              </pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Question marquee: shows the range of questions without a list. */}
      <section className="marquee-mask overflow-hidden border-y border-[var(--line)] py-6">
        <div className="marquee-track gap-3.5">
          {[...ASKABLE, ...ASKABLE].map((q, i) => (
            <span
              key={i}
              className="serif whitespace-nowrap rounded-[3px] border border-[var(--line-2)] px-5 py-2 text-[15px] italic text-[var(--muted)]"
            >
              {"“"}
              {q}
              {"”"}
            </span>
          ))}
        </div>
      </section>

      {/* CTA: full-bleed gradient. No eyebrow. */}
      <section className="relative overflow-hidden px-5 py-28 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 420px at 50% 0%, color-mix(in srgb, var(--accent) 17%, transparent), transparent 72%)",
          }}
        />
        <Reveal>
          <div className="relative">
            <h2 className="display mx-auto max-w-[16ch] text-center">
              Ask it something{" "}
              <span className="grad">a founder would ask.</span>
            </h2>
            <p className="sub mx-auto mt-5 max-w-[44ch]">
              The console shows every monday.com query it ran to reach the answer.
            </p>
            <Link href="/console" className="btn mt-8">
              Open the console
              <ArrowRightIcon size={15} weight="bold" />
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-7 text-[12.5px] text-[var(--faint)]">
          <span>Skylark BI, a monday.com intelligence agent</span>
          <span className="mono ml-auto">read-only access, live queries, no bundled data</span>
        </div>
      </footer>
    </div>
  );
}
