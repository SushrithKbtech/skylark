import Link from "next/link";
import {
  ArrowRightIcon,
  PathIcon,
  SealCheckIcon,
  ShieldWarningIcon,
  ClipboardTextIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Nav } from "@/components/site/Nav";
import { Reveal } from "@/components/site/Reveal";
import { DemoConsole } from "@/components/site/DemoConsole";
import { StageChart } from "@/components/site/StageChart";
import { NeuralBackground } from "@/components/site/NeuralBackground";

const DIFFERENTIATORS = [
  {
    Icon: SealCheckIcon,
    title: "Every answer carries a confidence rating",
    body: "Computed from the completeness of the exact fields the answer used, not a vibe. A number built on a 42%-filled column says so, in the answer.",
  },
  {
    Icon: PathIcon,
    title: "Show the working",
    body: "The trail of monday.com queries behind each answer stays attached to it. Any figure can be traced back to the query that produced it.",
  },
  {
    Icon: ShieldWarningIcon,
    title: "Survives a restructured board",
    body: "No column names in the code. Rename a field or change a column type in monday.com and the next question still answers correctly.",
  },
  {
    Icon: ClipboardTextIcon,
    title: "Briefs leave as text, not screenshots",
    body: "Any answer copies out as clean markdown, so a leadership update goes straight into a doc or a message without reformatting.",
  },
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
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div>
            <div className="animate-fade-up">
              <span className="kicker">monday.com intelligence agent</span>
            </div>

            <h1
              className="display animate-fade-up mt-5 max-w-[17ch]"
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
              <Link href="/console" className="btn">
                Open the console
                <ArrowRightIcon size={15} weight="bold" />
              </Link>
              <a href="#how" className="btn-ghost">
                See how it works
              </a>
            </div>
          </div>

          <div className="animate-fade-up lg:pl-4" style={{ animationDelay: "330ms" }}>
            <StageChart />
          </div>
        </div>
      </section>

      {/* How it works: stepped preview. No eyebrow. */}
      <section id="how" className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-5 py-20">
        <Reveal>
          <h2 className="h2 max-w-[19ch]">
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
          <h2 className="h2 mt-4 max-w-[21ch]">
            The hard part is knowing when the number is worth trusting.
          </h2>
        </Reveal>

        <div className="mt-11 grid gap-3.5 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <article
              className="glass glass-lift flex h-full flex-col justify-between gap-6 p-7"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--accent) 9%, var(--surface-solid)), var(--surface-solid))",
              }}
            >
              <div>
                <SealCheckIcon size={26} weight="duotone" style={{ color: "var(--accent)" }} />
                <h3 className="h3 mt-4 text-[1.15rem]">
                  {DIFFERENTIATORS[0].title}
                </h3>
                <p className="mt-2.5 max-w-[48ch] text-[14px] leading-relaxed text-[var(--muted)]">
                  {DIFFERENTIATORS[0].body}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {[
                  ["High", "var(--success)", "94% of fields used were populated"],
                  ["Medium", "var(--warning)", "one field 61% populated"],
                  ["Low", "var(--danger)", "key field under 40%"],
                ].map(([label, color, note]) => (
                  <span
                    key={label as string}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
                    style={{
                      borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
                      background: `color-mix(in srgb, ${color} 7%, transparent)`,
                    }}
                    title={note as string}
                  >
                    <span className="text-[11.5px] font-semibold" style={{ color: color as string }}>
                      {label}
                    </span>
                    <span className="mono text-[10.5px] text-[var(--faint)]">confidence</span>
                  </span>
                ))}
              </div>
            </article>
          </Reveal>

          {DIFFERENTIATORS.slice(1).map((d, i) => (
            <Reveal key={d.title} delay={(i + 1) * 80} className={i === 0 ? "" : "lg:col-span-1"}>
              <article className="glass glass-lift h-full p-6">
                <d.Icon size={22} weight="duotone" style={{ color: "var(--accent)" }} />
                <h3 className="h3 mt-3.5">{d.title}</h3>
                <p className="mt-2 text-[13.6px] leading-relaxed text-[var(--muted)]">{d.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
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

      {/* CTA: centered panel. No eyebrow. */}
      <section className="mx-auto w-full max-w-[1180px] px-5 pt-8 pb-24">
        <Reveal>
          <div className="glass glow relative overflow-hidden px-8 py-14 text-center sm:px-14">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(620px 300px at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%)",
              }}
            />
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
