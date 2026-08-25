# Decision Log — Skylark BI Agent

## Key assumptions

**Fiscal calendar.** "This quarter" is interpreted as the Indian financial year quarter
(April–March), since Skylark is an Indian company reporting in rupees. Calendar quarters
are still available as a separate grouping. The agent is required to state which window it
used, so a wrong guess is visible rather than silent.

**Date ambiguity resolves day-first.** `03/04/2025` is 3 April, not 4 March, unless a
component exceeds 12. The source data is Indian-format and the deals board uses ISO
elsewhere, which supports this reading. This is the single assumption most likely to be
wrong, so it is documented in the README rather than buried.

**"Revenue" is not one number.** The work orders board carries order value, billed value
and collected value as separate columns. Rather than pick one and call it revenue, the
agent names which measure it used and reports the others when the gap matters. The
billed-to-collected gap is treated as receivables and is a first-class answer, not a
footnote.

**Closure probability is banded, so weighting is an explicit assumption.** The field holds
High / Medium / Low (often blank), not a percentage. Weighted pipeline uses High 0.75,
Medium 0.45, Low 0.20 — a stated convention, not company policy. The agent must show the
weights and report the blank-probability bucket separately instead of silently assuming
zero or excluding it.

**Masked identifiers are not unique keys.** Deal names repeat across unrelated rows and
client codes are formatted differently on each board (`COMPANY089` vs `WOCOMPANY_002`).
Cross-board matching is therefore reported as indicative coverage with that caveat
attached to every result, never as an exact join.

Instructing the model about this was not sufficient. Asked about a named deal it would
answer with one row's values as though that were the whole entity — six rows share the
name "Tanjiro" with different values, stages and sectors. The rule is now enforced in the
tool layer: `query_records` returns an `ambiguous_name_warning` whenever the rows it
returns share names, so the model cannot miss it. A constraint that matters belongs in
the data the model receives, not only in its instructions.

**Missing data is reported, not imputed.** Nothing is filled in, inferred, or defaulted to
zero. Every aggregation returns the count of rows dropped for a blank metric, and the
agent is instructed to state it. A total that quietly excludes 40% of rows is the failure
mode this design exists to prevent.

---

## Trade-offs

**Tool-calling agent over text-to-SQL.** The model chooses tools; the server computes the
numbers. This costs some flexibility — a question the tools do not cover cannot be answered
by improvising a query — but it buys reproducibility. The same question returns the same
figure every time, and there is no path by which a sampled token becomes a wrong total. For
a tool whose output goes into leadership decisions, that trade is worth making.

**Schema discovery over a hardcoded data model.** It would have been faster to write the
column names into the code. Instead `describe_boards` reads the live schema and infers
types from monday's type, the column title and the actual values. This survives the
grader restructuring the boards, renaming a column, or importing with different column
types than mine — all of which are likely, since the assignment explicitly leaves board
setup to the candidate.

**Next.js over Streamlit.** Streamlit would have been faster to a working chat box. Next.js
gives a single deployable unit where the API keys stay server-side, streaming is native,
and the interface is not visibly a data-science demo. The API routes are the backend; there
is no second service to host.

**A 60-second cache, not a longer one.** Long enough that one answer requiring five tool
calls does not re-paginate the same board five times; short enough that the agent is never
reasoning over stale data within a conversation. The assignment requires dynamic querying,
so caching aggressively would have undercut the point.

**One agent, not several.** A planner/analyst/writer split would look more sophisticated and
would have been slower, harder to debug, and no more accurate on questions this size. The
single loop with five well-specified tools was the better use of the time budget.

**A preparation script, not a data pipeline.** The work order workbook has a blank first row
and its header on row 2, which breaks monday's importer. `scripts/prepare-import.mjs` fixes
that once, at setup. It is not part of the runtime and the agent never reads those files —
the requirement not to hardcode CSV data is respected.

---

## How I interpreted "leadership updates"

I read this as: *the agent should produce the artefact a founder would otherwise ask an
analyst to assemble before a leadership meeting* — not a scheduled report, and not a
document export.

Concretely, asking for a leadership update produces a structured brief rather than prose:
a one-line headline, then pipeline (total and weighted, movement by stage, concentration
by sector and owner), execution (work order status mix and delivery risk), cash (billed vs
collected vs receivable, largest gaps), risks and watch items, and — deliberately included
rather than hidden — the data caveats that would change the numbers. It closes with what
the agent would ask leadership to decide.

The reasoning: the hard part of a leadership update is not formatting, it is knowing which
numbers matter and being honest about which ones are shaky. A brief that says "pipeline is
₹X, but 31% of deals have no close date so the quarterly split is unreliable" is more
useful to a founder than a cleaner-looking number that hides the same problem. Making
caveats a required section rather than an optional flourish is the whole interpretation.

Every figure is pulled from the tools before the brief is written; the agent is instructed
to run a data quality report first.

---

## What I would do differently with more time

**Verify against the boards under load.** The largest untested surface is monday's
behaviour with a wide board — the work orders board has 38 columns, and complexity-budget
throttling is handled by retry but has not been exercised against a genuinely rate-limited
account.

**Assert on values, not just shape.** `scripts/e2e.mjs` now drives the real endpoint
against the live boards and asserts which tools ran and what the answer contained, and
`scripts/verify-integrity.mjs` confirms nothing was lost between the workbooks and the
boards (346 and 176 rows, all columns, no value drift). What neither does is check a
figure against an independently computed expected value. That is the next step: compute
totals directly from the workbooks and diff them against the agent's answers, which would
catch a normaliser regression that still produces a plausible-looking number.

**Charts, not just tables.** Pipeline-by-stage and billed-vs-collected are shape questions,
and a sparkline or funnel would communicate them faster than a markdown table. I skipped
this because a wrong chart is worse than a right table, and verification time was scarce.

**A real entity resolution pass.** Matching deals to work orders currently normalises a
string key. Fuzzy matching on client code plus sector plus value proximity would raise
coverage, and it would need a confidence score exposed in the answer rather than a silent
improvement.

**Persist conversations and expose an audit trail.** The tool trail is visible in the UI
per answer but is not stored. For a tool feeding leadership decisions, being able to
reopen a number three weeks later and see exactly which query produced it matters more
than most features I did build.

**Clarifying questions are currently conservative.** The agent asks only when the answer
would differ materially, and otherwise states its assumption and proceeds. With more time I
would tune that threshold against real founder questions rather than my guess at them.
