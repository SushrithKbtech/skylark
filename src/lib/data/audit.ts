import type { Dataset, Row } from "./dataset";
import { cellOf } from "./query";

/**
 * Cross-column consistency auditing.
 *
 * Completeness only tells you what is missing. It says nothing about whether
 * the values that ARE present contradict each other. The work orders board
 * carries a money chain (ordered -> billed -> collected -> receivable) and a
 * quantity chain, and those obey arithmetic that must hold:
 *
 *   billed    <= ordered      you cannot invoice more than was ordered
 *   collected <= billed       you cannot bank more than you invoiced
 *   receivable = billed - collected
 *   to-be-billed = ordered - billed
 *   balance qty = ordered qty - billed qty
 *
 * A row that breaks one of these is either a data-entry error or real revenue
 * leakage, and either way a founder wants it surfaced before the number reaches
 * a board deck. Columns are located by meaning rather than by hardcoded name so
 * this survives the board being renamed or restructured.
 */

export type AuditFinding = {
  rule: string;
  explanation: string;
  violations: number;
  rows_checked: number;
  net_discrepancy: number;
  examples: { row: string; detail: string }[];
};

export type AuditReport = {
  board: string;
  rows: number;
  checks_run: number;
  findings: AuditFinding[];
  clean: string[];
  note: string;
};

/** Locates a numeric column by required and forbidden title fragments. */
function findField(dataset: Dataset, must: RegExp, mustNot?: RegExp) {
  return dataset.fields.find(
    (f) =>
      (f.kind === "number" || f.kind === "currency") &&
      must.test(f.title) &&
      (!mustNot || !mustNot.test(f.title)),
  );
}

const num = (row: Row, key: string): number | null => {
  const v = cellOf(row, key);
  return typeof v === "number" ? v : null;
};

/** Money columns are masked, so compare with a small relative tolerance. */
const TOLERANCE = 0.01;

function comparison(
  dataset: Dataset,
  rows: Row[],
  cfg: {
    rule: string;
    explanation: string;
    left?: { key: string; title: string };
    right?: { key: string; title: string };
    /** "lte": left must not exceed right. "equals": left must equal right. */
    mode: "lte" | "equals";
    expected?: (row: Row) => number | null;
    /** Quantities are counts, not rupees, and must not be formatted as money. */
    money?: boolean;
  },
): AuditFinding | null {
  const fmt = cfg.money === false ? fmtQty : fmtMoney;
  if (!cfg.left) return null;
  if (cfg.mode === "lte" && !cfg.right) return null;

  const examples: AuditFinding["examples"] = [];
  let violations = 0;
  let checked = 0;
  let net = 0;

  for (const row of rows) {
    const left = num(row, cfg.left.key);
    if (left === null) continue;

    const right =
      cfg.mode === "lte" ? num(row, cfg.right!.key) : (cfg.expected?.(row) ?? null);
    if (right === null) continue;

    checked++;
    const scale = Math.max(Math.abs(left), Math.abs(right), 1);
    const diff = left - right;

    const bad =
      cfg.mode === "lte" ? diff > scale * TOLERANCE : Math.abs(diff) > scale * TOLERANCE;
    if (!bad) continue;

    violations++;
    net += diff;
    if (examples.length < 5) {
      examples.push({
        row: row.name,
        detail:
          cfg.mode === "lte"
            ? `${cfg.left.title} ${fmt(left)} exceeds ${cfg.right!.title} ${fmt(right)} by ${fmt(diff)}`
            : `${cfg.left.title} is ${fmt(left)} but the chain implies ${fmt(right)}, a gap of ${fmt(diff)}`,
      });
    }
  }

  if (!checked) return null;

  return {
    rule: cfg.rule,
    explanation: cfg.explanation,
    violations,
    rows_checked: checked,
    net_discrepancy: Math.round(net),
    examples,
  };
}

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};

const fmtQty = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toFixed(2);

export function auditConsistency(dataset: Dataset): AuditReport {
  const rows = dataset.rows;

  // Prefer the inclusive-of-GST columns so the chain is compared like for like.
  const ordered = findField(dataset, /^amount in rupees.*incl/i);
  const billed = findField(dataset, /^billed value.*incl/i);
  const collected = findField(dataset, /^collected/i);
  const receivable = findField(dataset, /receivable/i);
  const toBill = findField(dataset, /to be billed.*incl/i);

  const qtyOrdered = findField(dataset, /quantity by ops/i);
  const qtyBilled = findField(dataset, /quantity billed/i);
  const qtyBalance = findField(dataset, /balance in quantity/i);

  const candidates: (AuditFinding | null)[] = [
    comparison(dataset, rows, {
      rule: "Billed cannot exceed the order value",
      explanation:
        "A work order invoiced for more than the purchase order it sits under is either an over-invoice or a mis-keyed figure.",
      left: billed && { key: billed.key, title: billed.title },
      right: ordered && { key: ordered.key, title: ordered.title },
      mode: "lte",
    }),
    comparison(dataset, rows, {
      rule: "Collected cannot exceed billed",
      explanation:
        "Cash banked against a work order should never be more than what was invoiced for it.",
      left: collected && { key: collected.key, title: collected.title },
      right: billed && { key: billed.key, title: billed.title },
      mode: "lte",
    }),
    receivable && billed && collected
      ? comparison(dataset, rows, {
          rule: "Receivable should equal billed minus collected",
          explanation:
            "Receivables are a derived figure. Where it disagrees with the chain, one of the three columns is stale.",
          left: { key: receivable.key, title: receivable.title },
          mode: "equals",
          expected: (row) => {
            const b = num(row, billed.key);
            const c = num(row, collected.key);
            return b === null || c === null ? null : b - c;
          },
        })
      : null,
    toBill && ordered && billed
      ? comparison(dataset, rows, {
          rule: "Amount still to bill should equal ordered minus billed",
          explanation:
            "The remaining billable value is derived from the order and what has been invoiced so far.",
          left: { key: toBill.key, title: toBill.title },
          mode: "equals",
          expected: (row) => {
            const o = num(row, ordered.key);
            const b = num(row, billed.key);
            return o === null || b === null ? null : o - b;
          },
        })
      : null,
    qtyBalance && qtyOrdered && qtyBilled
      ? comparison(dataset, rows, {
          rule: "Balance quantity should equal ordered minus billed quantity",
          explanation:
            "The quantity chain should reconcile the same way the money chain does.",
          left: { key: qtyBalance.key, title: qtyBalance.title },
          mode: "equals",
          money: false,
          expected: (row) => {
            const o = num(row, qtyOrdered.key);
            const b = num(row, qtyBilled.key);
            return o === null || b === null ? null : o - b;
          },
        })
      : null,
  ];

  const run = candidates.filter((c): c is AuditFinding => c !== null);
  const findings = run.filter((f) => f.violations > 0).sort((a, b) => b.violations - a.violations);
  const clean = run.filter((f) => f.violations === 0).map((f) => f.rule);

  return {
    board: dataset.boardName,
    rows: rows.length,
    checks_run: run.length,
    findings,
    clean,
    note: run.length
      ? "Each check only counts rows where both sides are populated, so a violation is a genuine contradiction between values that are present, not a missing-data artifact."
      : "This board does not carry the paired numeric columns these checks reconcile, so nothing could be verified.",
  };
}
