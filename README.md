# Skylark BI

A conversational business intelligence agent that answers founder-level questions by
reading two monday.com boards live: **Deals** (sales pipeline, 346 rows) and **Work
Orders** (project execution and billing, 176 rows).

No board data ships with the application. Every figure in every answer comes from a
monday.com API read performed at the moment the question is asked.

**Live app:** https://skylark-xi-eight.vercel.app

---

## Contents

- [What it does](#what-it-does)
- [Using it](#using-it)
- [Architecture](#architecture)
- [How an answer is produced](#how-an-answer-is-produced)
- [Guardrails](#guardrails)
- [Handling messy data](#handling-messy-data)
- [monday.com setup](#mondaycom-setup)
- [Running locally](#running-locally)
- [Testing](#testing)
- [Tech choices](#tech-choices)

---

## What it does

A founder asks a question in plain English. The agent reads the boards' live schema,
decides which queries to run, has the server compute the figures, and writes an answer
with the caveats attached.

Four things separate it from a chat window pointed at a spreadsheet:

**It shows its working.** Every answer carries the exact monday.com queries that produced
it, so any figure can be traced back to the query behind it.

**It rates its own confidence.** Each answer is scored on how complete the specific
fields it used actually were, on the rows it actually used. A total built on a
48%-populated column says so, in the answer.

**It verifies its own arithmetic.** After the answer is written, every figure in it is
matched back against the values the tools returned. Anything that cannot be traced is
reported to the user rather than quietly trusted. This is what catches a model slipping a
decimal.

**It finds contradictions, not just gaps.** Completeness tells you what is missing.
A separate audit reconciles the money chain (ordered → billed → collected → receivable)
and the quantity chain, and reports rows whose present values disagree with each other.

---

## Using it

Open the link, click **Open the console**, ask a question. A short guided tour runs on
first visit.

### Questions worth trying

| Question | What it exercises |
| --- | --- |
| How is our pipeline looking for the mining sector this quarter? | Sector filter, fiscal-quarter handling, sparse-data caveats |
| What is our total billed revenue, and how much is still to collect? | The three different revenue columns kept distinct |
| Which sector is performing best for us? | Grouped aggregation and ranking |
| How many work orders are ongoing versus completed? | Operational metrics from the second board |
| Compare our deals pipeline against the work orders we are executing. Any gap? | Cross-board reasoning |
| Do our billing and collection numbers actually add up? | Cross-column consistency audit |
| What is the status of the Tanjiro deal? | Duplicate-name handling (six rows share that name) |
| Prepare a leadership update for this week's board meeting. | The leadership-update interpretation |

### Reading an answer

Each answer carries four things beyond the prose:

- **Tool trail** — the monday.com queries that produced it, expandable.
- **Confidence rating** — with the reasoning behind the score.
- **Grounding check** — whether every figure traced back to a query.
- **Copy for a brief** — the answer as clean markdown.

The left panel shows both boards' live row counts, field counts, completeness, and when
they were last read.

---

## Architecture

```
                    Browser
              React chat UI (client)
                        |
                        |  POST /api/chat
                        |  Server-Sent Events:
                        |  text · tool_start · tool_end · grounding · error
                        v
        ┌───────────────────────────────────┐
        │      Next.js route handler        │   credentials never leave here
        └───────────────────────────────────┘
                        |
                        v
        ┌───────────────────────────────────┐
        │            Agent loop             │   OpenAI + function calling
        │      src/lib/agent/run.ts         │   max 8 turns, retries transient
        └───────────────────────────────────┘   failures, verifies grounding
                        |
                        |  tool call
                        v
        ┌───────────────────────────────────┐
        │            Tool layer             │
        │      src/lib/agent/tools.ts       │
        │                                   │
        │  describe_boards                  │  live schema + real value spellings
        │  aggregate_metrics                │  totals, groupings, confidence
        │  query_records                    │  specific rows
        │  data_quality_report              │  what is missing
        │  audit_consistency                │  what contradicts itself
        │  join_boards                      │  cross-board coverage
        └───────────────────────────────────┘
                        |
                        v
        ┌───────────────────────────────────┐
        │          Dataset layer            │
        │        src/lib/data/              │
        │                                   │
        │  store.ts      60s request cache  │
        │  dataset.ts    typed fields+rows  │
        │  normalize.ts  date/number/null   │
        │  query.ts      filter, aggregate  │
        │  audit.ts      cross-column rules │
        └───────────────────────────────────┘
                        |
                        v
        ┌───────────────────────────────────┐
        │        monday.com client          │
        │       src/lib/monday/             │
        │  GraphQL, auth, retry, pagination │
        └───────────────────────────────────┘
                        |
                        v
              monday.com API v2  (read only)
```

### Design decisions

**The model never does arithmetic.** It selects a tool; the server computes the figure.
This costs flexibility — a question the tools do not cover cannot be answered by
improvising a query — and buys reproducibility. The same question returns the same
number every time, and there is no path by which a sampled token becomes a wrong total.

**The model does not format figures either.** Aggregations return a pre-rendered
`display` string (`₹53.20 Cr`) alongside the raw value. This was not the original design:
testing showed the model reliably slipping a decimal converting rupees to crore, once
reporting a figure ten times too large. Since the server already owns the arithmetic, it
owns the rendering.

**No column names in the code.** Field keys, types and the real spellings of every
category are discovered at runtime from the board schema. Rename a column in monday.com,
change its type, or restructure the board, and the next question still answers correctly.

**Read-only by construction.** There is no monday.com mutation anywhere in the codebase.

**Tool errors are self-correcting.** An unknown field name returns the list of valid keys
rather than an exception, so the agent repairs its own call on the next turn instead of
surfacing a failure.

**Credentials never reach the browser.** Every key stays inside the route handler.

---

## How an answer is produced

1. **Schema discovery.** `describe_boards` reads the live columns, their types, how
   populated each is, and the actual spellings of every category value. The agent never
   guesses a field name.
2. **Normalisation.** Dates, numbers and nulls are coerced to typed values. Four date
   formats, currency shapes, and twelve spellings of empty all resolve here.
3. **Computation.** The server filters and aggregates, tracking how many rows were
   excluded for a blank metric, and rates confidence on the rows actually used.
4. **Writing.** The model composes the answer from tool output, quoting pre-formatted
   figures verbatim.
5. **Verification.** Every figure in the finished answer is matched back against the
   values the tools returned, and anything untraceable is reported.

---

## Guardrails

Anti-hallucination here is structural, not a request in a prompt.

| Guardrail | Mechanism |
| --- | --- |
| Numbers cannot be invented | The model has no arithmetic to do; the server computes every figure |
| Figures cannot be misquoted | Aggregations return pre-rendered display strings to quote verbatim |
| Fabrication is detected | Post-answer grounding check traces every figure to a tool result; untraceable figures are shown to the user |
| Unit slips are detected | Same check, with tolerance derived from the notation's own precision |
| Names are not identifiers | `query_records` returns a warning when returned rows share a name, so duplicates cannot be presented as one record |
| Sparse data cannot look solid | Confidence scored on the fields and rows actually used, surfaced in the answer |
| Missing data is bounded, not hidden | Totals report excluded rows and project what they would contribute, labelled as an estimate |
| Contradictions surface | `audit_consistency` reconciles related columns and reports rows that disagree |
| No writes | No mutation exists in the codebase; write requests are refused |
| No scope drift | The agent answers on these two boards and declines unrelated questions |
| Injected instructions ignored | Board values are treated as data; an instruction inside a text field is reported, never executed |
| Runaway loops | Capped at 8 tool-calling turns per question |

The grounding check earns its place. During development it caught the model reporting
`₹531.96 Cr` where the true figure was `₹53.20 Cr` — a ten-fold error that no other
check would have surfaced, and which prompted the display-string change above.

---

## Handling messy data

Nothing is imputed and nothing is silently dropped. Every total reports how many rows it
excluded for a blank value.

**Dates.** Four formats in one column (ISO, day-first, textual, Excel serial) all parse.
Ambiguous day-versus-month resolves day-first, matching the Indian-format source, and is
documented as an assumption. Blank close dates are excluded from quarter splits and the
excluded count is reported.

**Numbers.** `₹1,20,000`, `1.2 Cr`, `45k` and `(500)` all parse. Units baked into values
(`5360 HA`) resolve to the number. The several columns whose titles contain "amount" stay
distinct: ordered, billed, collected and receivable never merge.

**Text.** Twelve spellings of empty (`N/A`, `TBD`, `nil`, `-`, `#N/A`) collapse to null.
Label drift (`Energy`, `energy `, `ENERGY_SECTOR`) groups as one category. Status values
identical to their own column title are treated as import artifacts, not values.

**Identifiers.** Deal names repeat across unrelated rows — six deals are named "Tanjiro"
with different values, stages and sectors. Names are never treated as unique keys, and
the tool layer enforces it.

---

## monday.com setup

### 1. Prepare the files

```bash
node scripts/prepare-import.mjs
```

Writes `excel/import-ready/deals.csv` and `excel/import-ready/work-orders.csv`. This
fixes file structure only — the work order workbook has a blank first row that breaks
monday's importer. No values are cleaned; the agent handles the mess at query time,
which is the point.

### 2. Import as two boards

In monday.com: **Add to workspace → More → Import data → Excel/CSV**, once per file.
Accept the auto-detected column types. The agent re-infers types from the actual values,
so the import mapping does not need to be perfect.

### 3. Get an API token

monday.com → avatar → **Developers** → **My access tokens**. Read access is sufficient.

### 4. Get the board IDs

The numeric segment of each board's URL:

```
https://<account>.monday.com/boards/5030844277
                                    ^^^^^^^^^^
```

### 5. Configure

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI key for the agent loop |
| `OPENAI_MODEL` | Any tool-calling model. `gpt-4o` recommended; `gpt-4o-mini` works and costs less |
| `MONDAY_API_TOKEN` | monday.com personal access token |
| `MONDAY_BOARD_DEALS` | Board ID for the deals board |
| `MONDAY_BOARD_WORK_ORDERS` | Board ID for the work orders board |

On Vercel these go in **Project → Settings → Environment Variables**.

### Verifying the import

```bash
node scripts/verify-integrity.mjs
```

Diffs the original workbooks against the live boards and reports row counts, column
coverage and per-column value drift. Current state: 346/346 and 176/176 rows, all columns
present, no drift.

---

## Running locally

Not needed to evaluate the prototype; the hosted link requires no setup. To work on the
code:

```bash
npm install
cp .env.example .env.local   # fill in the five variables above
npm run dev
```

---

## Testing

```bash
node scripts/e2e.mjs                      # against localhost
node scripts/e2e.mjs https://skylark-xi-eight.vercel.app   # against production
```

Drives the real SSE endpoint against the live boards and asserts on which tools ran, what
the answer contained, and whether every figure was traceable. Thirteen cases covering the
question types above plus regressions for the duplicate-name and grounding bugs. Exits
non-zero on any failure.

Token usage is logged per question (`[usage]` in the server log). A question costs
roughly 12k–20k tokens, around 95% of it input.

---

## Tech choices

| Choice | Why |
| --- | --- |
| Next.js App Router | One deployable unit for UI and API; route handlers keep credentials server-side |
| TypeScript | The normalisation layer is the risky part of this system and benefits most from types |
| OpenAI function calling, no agent framework | The loop is ~150 lines and is the interesting part of this problem. LangChain or CrewAI would add a large dependency to wrap it, and would have made the tool-error self-correction and grounding verification harder to build and to explain. Multi-agent orchestration solves a problem this does not have |
| monday.com GraphQL API v2 | Direct control over pagination, retry and the complexity budget |
| Tailwind v4 | Utility-first styling without component-library weight |
| Server-Sent Events | Token streaming and live tool progress over one connection, no WebSocket infrastructure |

See [`DECISION_LOG.md`](./DECISION_LOG.md) for assumptions, trade-offs, and what would
change with more time.
