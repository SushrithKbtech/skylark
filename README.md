# Skylark BI - monday.com Business Intelligence Agent

A conversational agent that answers founder-level business questions by reading two
monday.com boards live: **Deals** (sales pipeline) and **Work Orders** (project execution
and billing).

No board data is bundled with the application. Every figure in every answer comes from a
monday.com API read performed at the moment the question is asked.

---

## Using the hosted app

The prototype is deployed and needs no local setup. Open the link, click **Open the
console**, and ask a question in plain language.

**Live app:** _add your deployment URL here_

### What to ask

The agent is built for the way a founder actually phrases things, not for field names.
Questions that exercise the full system:

| Question | What it demonstrates |
| --- | --- |
| How is our pipeline looking for the mining sector this quarter? | Sector filter, fiscal-quarter handling, sparse-data caveats |
| What is our total billed revenue, and how much is still to be collected? | Multi-metric revenue reporting across billing columns |
| Which sector is performing best for us? | Grouped aggregation and ranking |
| How many work orders are ongoing versus completed? | Operational metrics from the second board |
| Compare our deals pipeline against the work orders we are executing. Any gap? | Cross-board reasoning |
| How trustworthy is the deals data? What is missing? | Explicit data-quality reporting |
| Prepare a leadership update for this week's board meeting. | The leadership-update interpretation |

### Reading an answer

Each answer carries three things beyond the prose:

- **Tool trail** - the exact monday.com queries the agent ran, expandable, so any number
  can be traced back to the query that produced it.
- **Confidence rating** - computed from the fill rate of the specific fields the answer
  used. Click it to see what drove the score. A total built on a 48%-populated column is
  labelled low, and the agent says so in the answer.
- **Copy for a brief** - copies the answer as clean markdown, ready to paste into a doc
  or a message.

The left panel shows both boards' live row counts, field counts and completeness, plus
the timestamp of the last read.

---

## Architecture

```
Browser (React chat UI)
      |  POST /api/chat     Server-Sent Events: text, tool_start, tool_end, error
      v
Next.js route handler
      |
      v
Agent loop (src/lib/agent/run.ts)
  OpenAI chat completions + function calling
      |
      |  tool call
      v
Tool layer (src/lib/agent/tools.ts)
  describe_boards, aggregate_metrics, query_records,
  data_quality_report, join_boards
      |
      v
Dataset layer (src/lib/data/)
  store.ts      60s request-scoped cache, de-duplicates concurrent reads
  dataset.ts    raw board -> typed fields + normalised rows + quality report
  normalize.ts  date / number / category / null coercion
  query.ts      filtering, aggregation, confidence rating
      |
      v
monday.com client (src/lib/monday/)
  client.ts     GraphQL transport, auth, retry with backoff, typed errors
  boards.ts     schema discovery + cursor pagination
      |
      v
monday.com API v2 (read-only)
```

### Design decisions worth calling out

**The model never does arithmetic.** It selects a tool and the server computes the figure.
This costs some flexibility and buys reproducibility: the same question returns the same
number every time, which matters when the number ends up in a leadership deck.

**No column names in the code.** Field keys, types and the real spellings of every
category are discovered at runtime from the board schema. Rename a column in monday.com
or change its type and the next question still answers correctly.

**Read-only by construction.** There is no monday.com mutation anywhere in the codebase.

**Tool errors are self-correcting.** An unknown field name returns the list of valid keys
rather than an exception, so the agent repairs its own call on the next turn instead of
surfacing a failure to the user.

**Credentials never reach the browser.** Every key stays inside the Next.js route handler.

---

## monday.com configuration

### 1. Import the boards

The two source spreadsheets are converted to import-ready CSVs:

```bash
node scripts/prepare-import.mjs
```

This writes `excel/import-ready/deals.csv` and `excel/import-ready/work-orders.csv`.

In monday.com, use **Add to workspace → More → Import data → Excel/CSV** and import each
file as its own board. Accept the auto-detected column types; the agent re-infers types
from the actual values, so the import mapping does not need to be perfect.

### 2. Get an API token

monday.com → your avatar → **Developers** → **My access tokens**. A read-only personal
token is sufficient.

### 3. Get the board IDs

Open each board and take the numeric segment of the URL:

```
https://<account>.monday.com/boards/5030844277
                                    ^^^^^^^^^^
```

### 4. Set the environment variables

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI key for the agent loop |
| `OPENAI_MODEL` | Any tool-calling model, e.g. `gpt-4o-mini` |
| `MONDAY_API_TOKEN` | monday.com personal access token |
| `MONDAY_BOARD_DEALS` | Board ID for the deals board |
| `MONDAY_BOARD_WORK_ORDERS` | Board ID for the work orders board |

On Vercel these go in **Project → Settings → Environment Variables**. Locally they go in
`.env.local`, which is gitignored.

---

## Handling messy data

Real board data is broken in ordinary ways. Nothing is imputed and nothing is silently
dropped: every total reports how many rows it excluded for a blank value.

**Dates** - four formats in one column (ISO, day-first, textual, Excel serial) all parse.
Ambiguous day-versus-month is resolved day-first, matching the Indian-format source, and
documented as an assumption. Blank close dates are excluded from quarter splits and the
excluded count is reported.

**Numbers** - `₹1,20,000`, `1.2 Cr`, `45k` and `(500)` all parse. Units baked into values
(`5360 HA`) resolve to the number. The several columns whose titles all contain "amount"
are kept distinct: ordered, billed, collected and receivable never merge.

**Text** - twelve spellings of empty (`N/A`, `TBD`, `nil`, `-`, `#N/A`) collapse to null.
Label drift (`Energy`, `energy `, `ENERGY_SECTOR`) groups as one category. Status values
that are identical to their own column title are treated as import artifacts, not values.

---

## Local development

Not required to evaluate the prototype; the hosted link needs no setup. For working on
the code:

```bash
npm install
cp .env.example .env.local   # then fill in the five variables above
npm run dev
```

### Tests

An end-to-end acceptance harness drives the real API against the live boards and asserts
on which tools ran and what the answers contained:

```bash
node scripts/e2e.mjs
```

It covers the eight question types in the table above plus the monday.com connection
probe, and exits non-zero on any failure.

---

## Tech stack

| Choice | Why |
| --- | --- |
| Next.js (App Router) | One deployable unit for UI and API; route handlers keep credentials server-side |
| TypeScript | The normalisation layer is the risky part of this system and benefits most from types |
| OpenAI function calling | Mature tool-calling; the agent picks tools while the server owns the maths |
| monday.com GraphQL API v2 | Direct control over pagination, retry and complexity budget |
| Tailwind v4 | Utility-first styling with no component-library weight |
| Server-Sent Events | Token streaming and live tool-progress over one connection, no WebSocket infrastructure |

See `DECISION_LOG.md` for assumptions, trade-offs, and what would change with more time.
