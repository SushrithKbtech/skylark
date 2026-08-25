# Decision Log — Skylark BI Agent

## Key assumptions

**Fiscal calendar.** "This quarter" means the Indian financial year quarter (April–March).
Calendar quarters remain available as a separate grouping, and the agent must state which
window it used, so a wrong guess is visible rather than silent.

**Dates resolve day-first.** `03/04/2025` is 3 April unless a component exceeds 12. The
source is Indian-format. This is the assumption most likely to be wrong, so it is
documented rather than buried.

**"Revenue" is not one number.** The work orders board carries order value, billed value
and collected value as separate columns. The agent names which measure it used and reports
the others when the gap matters. Billed minus collected is treated as receivables.

**Closure probability is banded, so weighting is an explicit assumption.** The field holds
High/Medium/Low, often blank. Weighted pipeline uses 0.75/0.45/0.20 — a stated convention,
not company policy. Blank-probability rows are reported separately, never assumed zero.

**Masked identifiers are not unique keys.** Deal names repeat: six rows are named
"Tanjiro" with different values, stages and sectors. Client codes differ in format between
boards (`COMPANY089` vs `WOCOMPANY_002`), so cross-board matching is reported as indicative
coverage, never an exact join.

**Missing data is reported, not imputed.** Nothing is filled in or defaulted to zero. Every
aggregation returns the count of rows dropped for a blank metric. A total that quietly
excludes 40% of rows is the failure mode this design exists to prevent.

---

## Trade-offs

**Tool-calling agent over text-to-SQL.** The model chooses tools; the server computes. This
costs flexibility — a question the tools do not cover cannot be answered by improvising a
query — and buys reproducibility. For numbers that reach a leadership deck, that trade is
worth making.

**The server formats figures too, not just computes them.** Not the original design.
Testing showed the model reliably slipping a decimal converting rupees to crore, once
reporting ₹531.96 Cr where the truth was ₹53.20 Cr. Aggregations now return a rendered
`display` string to quote verbatim. If the model does no arithmetic, it should do no unit
conversion either.

**Enforcement in the tool layer, not the prompt.** Two constraints were stated in the
system prompt and ignored by the model. Duplicate names are now flagged by
`query_records` itself, and every figure in a finished answer is matched back against the
values the tools returned. A constraint that matters belongs in the data the model
receives, not only in its instructions.

**Schema discovery over a hardcoded data model.** Writing the column names into the code
would have been faster. Instead the schema is read live and types inferred from monday's
type, the column title and the actual values. This survives the reviewer importing the
boards differently from me, which is likely, since the brief leaves board setup to the
candidate.

**Next.js over Streamlit.** Streamlit reaches a chat box faster. Next.js gives one
deployable unit where keys stay server-side, streaming is native, and the result does not
look like a data-science demo.

**No agent framework.** The loop is roughly 150 lines and is the interesting part of this
problem. LangChain or CrewAI would add a large dependency to wrap it and would have made
the tool-error self-correction and grounding check harder to build and to explain.
Multi-agent orchestration solves a problem this does not have.

**A 60-second cache.** Long enough that one answer needing five tool calls does not
re-paginate a board five times; short enough that no answer reasons over stale data.

---

## How I interpreted "leadership updates"

As the artefact a founder would otherwise ask an analyst to assemble before a meeting —
not a scheduled report or a document export.

Asking for one produces a structured brief: headline, pipeline (total and weighted,
movement by stage, concentration), execution (status mix, delivery risk), cash (billed vs
collected vs receivable), risks, and — deliberately required rather than optional — the
data caveats that would change the numbers. It closes with what the agent would ask
leadership to decide. Any answer also exports as a standalone markdown brief carrying the
queries behind it, its confidence rating and its verification result.

The reasoning: the hard part is not formatting, it is knowing which numbers matter and
being honest about which are shaky. "Pipeline is ₹X, but 31% of deals have no close date"
is more useful than a cleaner number hiding the same problem. Making caveats a required
section is the whole interpretation.

---

## What I would do differently with more time

**Assert on values, not just shape.** `scripts/e2e.mjs` drives the real endpoint and
asserts which tools ran and what the answer contained; `scripts/verify-integrity.mjs`
confirms nothing was lost between workbook and board. Neither checks a figure against an
independently computed expected value. That is the next step, and would catch a normaliser
regression that still produces a plausible number.

**Entity resolution.** Cross-board matching normalises a string key. Fuzzy matching on
client code plus sector plus value proximity would raise coverage, and would need its own
confidence exposed in the answer.

**Persist the audit trail.** The query trail is visible per answer but not stored. For a
tool feeding leadership decisions, reopening a number three weeks later and seeing exactly
which query produced it matters more than most features I did build.

**Charts.** Pipeline-by-stage and billed-vs-collected are shape questions. I skipped
visualisation because a wrong chart is worse than a right table and verification time was
scarce.

**Tune the clarifying-question threshold.** The agent asks only when the answer would
differ materially, otherwise states its assumption and continues. That threshold is my
guess at founder behaviour, not something I validated.
