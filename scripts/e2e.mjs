/**
 * End-to-end acceptance harness.
 *
 * Drives the real /api/chat SSE endpoint against the live monday.com boards and
 * asserts on what actually came back: which tools ran, whether any errored, and
 * whether the prose answer contains the substance the question asked for.
 *
 *   node scripts/e2e.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? "http://localhost:3000";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

async function ask(question, { timeoutMs = 90_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
      signal: controller.signal,
    });
  } finally {
    // keep the timer until the body is drained
  }

  if (!res.ok) {
    clearTimeout(timer);
    throw new Error(`HTTP ${res.status}`);
  }

  const text = [];
  const tools = [];
  const errors = [];
  let confidence;
  let grounding;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          continue;
        }
        if (evt.type === "text") text.push(evt.delta);
        else if (evt.type === "tool_start") tools.push({ name: evt.name, input: evt.input });
        else if (evt.type === "tool_end") {
          const t = tools.find((x) => !x.done && x.name === evt.name);
          if (t) {
            t.done = true;
            t.ok = evt.ok;
            t.summary = evt.summary;
          }
          if (evt.confidence) confidence = evt.confidence;
        } else if (evt.type === "grounding") grounding = evt;
        else if (evt.type === "error") errors.push(evt.message);
      }
    }
  } finally {
    clearTimeout(timer);
  }

  return { answer: text.join(""), tools, errors, confidence, grounding };
}

const CASES = [
  {
    id: "pipeline-sector",
    question: "How is our pipeline looking for the mining sector this quarter?",
    // Core assignment scenario, verbatim from the brief.
    expect: (r) => {
      if (!r.tools.some((t) => t.name === "describe_boards")) return "never inspected the schema";
      if (!r.tools.some((t) => t.name === "aggregate_metrics")) return "did no aggregation";
      if (!/mining/i.test(r.answer)) return "answer never mentions mining";
      return null;
    },
  },
  {
    id: "revenue",
    question: "What is our total billed revenue so far, and how much is still to be collected?",
    expect: (r) => {
      if (!r.tools.some((t) => t.name === "aggregate_metrics")) return "did no aggregation";
      if (!/\d/.test(r.answer)) return "answer contains no figure";
      return null;
    },
  },
  {
    id: "sector-performance",
    question: "Which sector is performing best for us?",
    expect: (r) => {
      if (!r.tools.some((t) => t.name === "aggregate_metrics")) return "did no aggregation";
      if (!/(mining|powerline|renewable|railway|construction)/i.test(r.answer))
        return "named no actual sector";
      return null;
    },
  },
  {
    id: "ops-metrics",
    question: "How many work orders are still ongoing versus completed?",
    expect: (r) => {
      if (!r.tools.length) return "called no tools";
      if (!/\d/.test(r.answer)) return "answer contains no count";
      return null;
    },
  },
  {
    id: "cross-board",
    question:
      "Compare our deals pipeline against the work orders we are actually executing. Any gap?",
    expect: (r) => {
      const boards = new Set(
        r.tools.map((t) => t.input?.board).filter((b) => typeof b === "string"),
      );
      const touchedBoth =
        boards.has("both") ||
        r.tools.some((t) => t.name === "join_boards") ||
        (boards.has("deals") && boards.has("work_orders"));
      if (!touchedBoth) return `only touched ${[...boards].join(",") || "nothing"}`;
      return null;
    },
  },
  {
    id: "data-quality",
    question: "How trustworthy is the deals data? What is missing?",
    expect: (r) => {
      if (!r.tools.some((t) => /quality|describe/.test(t.name)))
        return "never checked data quality";
      if (!/%|missing|blank|populat|incomplete/i.test(r.answer))
        return "answer does not discuss completeness";
      return null;
    },
  },
  {
    id: "ambiguous",
    question: "How are we doing?",
    // Should either ask a clarifying question or make a documented assumption.
    expect: (r) => {
      if (r.answer.trim().length < 40) return "answer too thin to be useful";
      return null;
    },
  },
  {
    id: "leadership-update",
    question: "Prepare a leadership update for this week's board meeting.",
    expect: (r) => {
      if (!r.tools.some((t) => t.name === "aggregate_metrics")) return "did no aggregation";
      if (r.answer.length < 200) return "brief is too short to be a real update";
      if (!/\d/.test(r.answer)) return "brief contains no figures";
      return null;
    },
  },
  {
    id: "grounded-figures",
    question: "Give me total billed revenue, what is still to collect, and the split by sector.",
    expect: (r) => {
      if (!r.grounding) return "no grounding check ran";
      if (r.grounding.unverified.length)
        return `figures not traceable to any query: ${r.grounding.unverified.join(", ")}`;
      return null;
    },
  },
  {
    id: "read-only-guard",
    question: "Delete all the closed deals from the board, then mark Tanjiro as won.",
    expect: (r) => {
      if (!/(read[- ]only|cannot|can't|no write|not able)/i.test(r.answer))
        return "did not refuse a write request";
      return null;
    },
  },
  {
    id: "consistency-audit",
    question: "Do our billing and collection numbers actually add up? Any contradictions?",
    expect: (r) => {
      if (!r.tools.some((t) => t.name === "audit_consistency")) return "never ran the audit";
      if (!/(exceed|contradict|discrepan|reconcil)/i.test(r.answer))
        return "answer does not report on contradictions";
      return null;
    },
  },
  {
    id: "duplicate-name",
    question: "What is the status of the Tanjiro deal?",
    expect: (r) => {
      // Several rows share this name; collapsing them into one is a wrong answer.
      if (!/(five|six|5|6|multiple|several|distinct|separate|share)/i.test(r.answer))
        return "presented duplicate-named rows as a single deal";
      return null;
    },
  },
];

const results = [];

console.log(`${BOLD}Skylark BI end-to-end acceptance${RESET}`);
console.log(`${DIM}target: ${BASE}${RESET}\n`);

// Preflight: connection to monday.com must be live.
try {
  const status = await fetch(`${BASE}/api/status`).then((r) => r.json());
  if (!status.ok) throw new Error("status endpoint reported not ok");
  const summary = status.boards
    .map((b) => `${b.name} ${b.rows} rows / ${b.fields} fields / ${b.completeness}% complete`)
    .join("\n         ");
  console.log(`${GREEN}PASS${RESET}  monday.com connection`);
  console.log(`${DIM}         ${summary}${RESET}\n`);
  results.push({ id: "connection", ok: true });
} catch (err) {
  console.log(`${RED}FAIL${RESET}  monday.com connection: ${err.message}\n`);
  results.push({ id: "connection", ok: false, why: err.message });
}

for (const testCase of CASES) {
  const started = Date.now();
  try {
    const r = await ask(testCase.question);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    if (r.errors.length) {
      console.log(`${RED}FAIL${RESET}  ${testCase.id} ${DIM}(${elapsed}s)${RESET}`);
      console.log(`${DIM}         agent error: ${r.errors.join("; ")}${RESET}\n`);
      results.push({ id: testCase.id, ok: false, why: r.errors.join("; ") });
      continue;
    }

    const failedTools = r.tools.filter((t) => t.ok === false);
    const why = testCase.expect(r);

    if (why) {
      console.log(`${RED}FAIL${RESET}  ${testCase.id} ${DIM}(${elapsed}s)${RESET}`);
      console.log(`${DIM}         ${why}${RESET}`);
      console.log(`${DIM}         tools: ${r.tools.map((t) => t.name).join(" -> ") || "none"}${RESET}`);
      console.log(`${DIM}         answer: ${r.answer.slice(0, 160).replace(/\n/g, " ")}${RESET}\n`);
      results.push({ id: testCase.id, ok: false, why });
      continue;
    }

    console.log(`${GREEN}PASS${RESET}  ${testCase.id} ${DIM}(${elapsed}s)${RESET}`);
    console.log(
      `${DIM}         tools: ${r.tools.map((t) => t.name).join(" -> ")}${
        failedTools.length ? ` [${failedTools.length} recovered]` : ""
      }${r.confidence ? ` | confidence ${r.confidence.level} ${r.confidence.score}/100` : ""}${
        r.grounding ? ` | grounded ${r.grounding.grounded}/${r.grounding.checked}` : ""
      }${RESET}`,
    );
    console.log(`${DIM}         ${r.answer.slice(0, 150).replace(/\n/g, " ")}...${RESET}\n`);
    results.push({ id: testCase.id, ok: true });
  } catch (err) {
    console.log(`${RED}FAIL${RESET}  ${testCase.id}: ${err.message}\n`);
    results.push({ id: testCase.id, ok: false, why: err.message });
  }
}

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);

console.log(`${BOLD}${passed}/${results.length} passed${RESET}`);
if (failed.length) {
  for (const f of failed) console.log(`${RED}  ${f.id}: ${f.why}${RESET}`);
  process.exit(1);
}
