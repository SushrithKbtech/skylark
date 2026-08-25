# Skylark BI — monday.com Business Intelligence Agent

A conversational agent that answers founder-level business questions by querying two
monday.com boards live: **Deals** (sales pipeline) and **Work Orders** (project execution
and billing).

No board data is bundled with the application. Every figure in every answer comes from a
monday.com API read performed at request time.

---

## Architecture

```
Browser (React chat UI)
      │  POST /api/chat        Server-Sent Events: text · tool_start · tool_end · error
      ▼
Next.js route handler  ──────────────────────────────────────────┐
      │                                                          │
      ▼                                                          ▼
Agent loop (src/lib/agent/run.ts)                    Status probe (/api/status)
  OpenAI chat completions + function calling
      │
      │  tool call
      ▼
Tool layer (src/lib/agent/tools.ts)
  describe_boards · aggregate_metrics · query_records
  data_quality_report · join_boards
      │
      ▼
Dataset layer (src/lib/data/)
  store.ts     60s request-scoped cache, de-duplicates concurrent reads
  dataset.ts   raw board  ->  typed fields + normalised rows + quality report
  normalize.ts date / number / category / null coercion
  query.ts     filtering and aggregation engine
      │
      ▼
monday.com client (src/lib/monday/)
  client.ts    GraphQL transport, auth, retry with backoff, typed errors
  boards.ts    schema discovery + cursor pagination
      │
      ▼
monday.com GraphQL API v2  (read-only)
```

### Why this shape

**The agent is a tool-calling loop, not a text-to-SQL layer.** The model never sees raw
board rows in bulk and never does arithmetic itself. It picks a tool, the server computes
the number deterministically, and the model explains the result. Totals are therefore
reproducible and cannot drift with model sampling.

**Schema is discovered, never hardcoded.** `describe_boards` reads the live column list,
infers each field's type from its monday type, its title and its actual values, and reports
the real spellings of every categorical value with counts. The agent is told to call it
before anything else, so it filters on `Mining` because the data says `Mining` — not
because a prompt guessed it. This also means the app keeps working if you restructure the
boards or rename a column.

**Cleaning happens server-side, once per read.** Dates, currency, quantities-with-units and
null-like strings are normalised in `normalize.ts` before the agent ever sees them, so the
model is not asked to interpret `"5360 HA"` or `"N/A"` on the fly.

---

## Data resilience

The supplied data is genuinely messy. The normaliser handles:

| Problem | Handling |
| --- | --- |
| Null-like strings | `""`, `-`, `N/A`, `TBD`, `NIL`, `unknown`, `?`, `#N/A` and friends all collapse to a real null |
| Mixed date formats | ISO, `15/03/2024`, `3-15-24`, `15 Mar 2024`, `March 15, 2024`, Excel serial numbers |
| Ambiguous D/M vs M/D | Resolved day-first unless a component exceeds 12 (source data is Indian-format) |
| Currency | `₹1,20,000`, `$45k`, `1.2 Cr`, `(500)` for negatives, `Rs.` prefixes |
| Units inside numbers | `5360 HA`, `12 nos`, `40kms` parse to the bare number |
| Inconsistent labels | `Energy`, `energy `, `ENERGY_SECTOR` collapse to one grouping bucket |
| Unparseable values | Counted per field and surfaced, never silently coerced to zero |
| Header row not on row 1 | Detected by the import script (`scripts/prepare-import.mjs`) |

Every aggregation reports `excludedForMissingMetric` — the number of matching rows dropped
because the metric was blank. The system prompt requires the agent to state that count
rather than present a total as complete. `data_quality_report` exposes per-field
completeness, unparseable counts, duplicate names and suspected free-text categories.

## Error handling

- **monday.com**: typed errors for auth, rate limit, network and GraphQL failures.
  Transient failures (429, 5xx, complexity-budget exhaustion) retry with exponential
  backoff up to four attempts; auth and config failures fail fast with a fix-it message.
- **Tool errors** are returned to the model as a tool result rather than thrown, and error
  messages list the valid field keys — so a bad field name is self-correcting on the next
  turn instead of ending the conversation.
- **The UI** surfaces the failure and the remedy, and the connection panel tells you which
  environment variable is missing before you ever send a message.

---

## Setup

### 1. Import the boards

The two supplied workbooks need light preparation — the work order sheet has a blank first
row that breaks monday's importer, and its real header sits on row 2.

```bash
npm install
node scripts/prepare-import.mjs
```

This writes `excel/import-ready/deals.csv` (346 rows) and
`excel/import-ready/work-orders.csv` (176 rows).

In monday.com, for each file: **Add board → Import from file → CSV**. Let monday
auto-detect column types; the agent re-infers types itself, so the exact choices are not
critical. Import them as **two separate boards**.

### 2. Get credentials

- **monday.com token** — avatar → **Developers** → **My access tokens**. Read scope is
  enough; the agent never writes.
- **Board IDs** — the numeric segment of each board URL:
  `https://<account>.monday.com/boards/1234567890` → `1234567890`
- **OpenAI key** — any key with access to a tool-calling model.

### 3. Configure and run

```bash
cp .env.example .env.local
```

Fill in:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
MONDAY_API_TOKEN=eyJhbGciOi...
MONDAY_BOARD_DEALS=1234567890
MONDAY_BOARD_WORK_ORDERS=1234567891
```

```bash
npm run dev
```

Open http://localhost:3000. The left panel confirms both boards are reachable and shows
their row counts and completeness. `GET /api/status` is the same check as JSON.

### 4. Deploy

Push to a Git remote and import the repository into Vercel, setting the same five
environment variables in the project settings. No other configuration is required — the
API routes run on the Node.js runtime and there is no database.

---

## Project layout

```
src/
  app/
    api/chat/route.ts       SSE endpoint, request validation
    api/status/route.ts     connection + board health probe
    page.tsx                layout shell
  components/
    Chat.tsx                conversation state, SSE parsing, composer
    BoardPanel.tsx          live board status sidebar
    ToolTrail.tsx           per-answer trail of monday.com queries
    Answer.tsx              markdown rendering
  lib/
    agent/                  system prompt, tool schemas, agent loop
    data/                   normalisation, dataset build, query engine, cache
    monday/                 GraphQL client and board fetching
scripts/
  prepare-import.mjs        workbook -> monday-importable CSV (setup only)
```

## Notes and limits

- Board reads are capped at 10,000 rows per board (40 pages of 250). Both supplied boards
  are far below this.
- The 60-second cache is deliberately short: it stops a single multi-tool answer from
  re-paginating the same board five times, without ever serving stale data across a
  conversation.
- Cross-board matching uses masked identifiers, so one key can cover several real records.
  `join_boards` returns that caveat with every result and the agent is instructed to repeat
  it.
- The agent has read access only. There is no monday.com mutation anywhere in the codebase.
