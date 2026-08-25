import { categoryKey, parseDate, parseNumber, type FieldKind } from "./normalize";
import type { Dataset, Row } from "./dataset";

export type Operator =
  | "eq" | "neq" | "contains" | "in"
  | "gt" | "gte" | "lt" | "lte" | "between"
  | "is_empty" | "not_empty";

export type Filter = {
  field: string;
  op: Operator;
  value?: string | number | (string | number)[];
};

export type Aggregation = "sum" | "avg" | "count" | "count_distinct" | "min" | "max";

export class QueryError extends Error {}

function resolveField(dataset: Dataset, name: string) {
  const wanted = name.toLowerCase().trim();

  const derived = wanted.match(/^(.*)__(quarter|fiscal_quarter|year|month)$/);
  if (derived) {
    const base = dataset.fields.find(
      (f) => f.key === derived[1] || f.title.toLowerCase() === derived[1],
    );
    if (base && base.kind === "date") {
      return { key: `${base.key}__${derived[2]}`, kind: "derived" as const, title: `${base.title} (${derived[2].replace("_", " ")})` };
    }
  }

  if (wanted === "item_name" || wanted === "name") {
    return { key: "item_name", kind: "name" as const, title: "Item name" };
  }

  const exact = dataset.fields.find(
    (f) => f.key === wanted || f.title.toLowerCase() === wanted,
  );
  if (exact) return { key: exact.key, kind: exact.kind, title: exact.title };

  const loose = dataset.fields.find(
    (f) =>
      f.key.replace(/_/g, "") === wanted.replace(/[_\s]/g, "") ||
      f.title.toLowerCase().replace(/\s/g, "") === wanted.replace(/[_\s]/g, ""),
  );
  if (loose) return { key: loose.key, kind: loose.kind, title: loose.title };

  throw new QueryError(
    `Field "${name}" does not exist on board "${dataset.boardName}". Available: ${dataset.fields
      .map((f) => f.key)
      .join(", ")}`,
  );
}

export function cellOf(row: Row, key: string): string | number | null {
  if (key === "item_name") return row.name;
  if (key in row.derived) return row.derived[key];
  return row.values[key] ?? null;
}

function matches(row: Row, filter: Filter, dataset: Dataset): boolean {
  const field = resolveField(dataset, filter.field);
  const raw = cellOf(row, field.key);

  if (filter.op === "is_empty") return raw === null || raw === "";
  if (filter.op === "not_empty") return raw !== null && raw !== "";
  if (raw === null || raw === "") return false;

  const isNumeric = field.kind === "number" || field.kind === "currency";
  const isDate = field.kind === "date";

  const asComparable = (v: string | number): string | number => {
    if (isNumeric) return typeof v === "number" ? v : (parseNumber(v) ?? NaN);
    if (isDate) return typeof v === "string" ? (parseDate(v) ?? v) : String(v);
    return String(v);
  };

  const left = asComparable(raw);

  switch (filter.op) {
    case "eq":
    case "neq": {
      const want = filter.value;
      if (want === undefined) throw new QueryError(`Filter on "${filter.field}" needs a value.`);
      const hit = isNumeric || isDate
        ? left === asComparable(want as string | number)
        : categoryKey(String(raw)) === categoryKey(String(want));
      return filter.op === "eq" ? hit : !hit;
    }
    case "contains": {
      const needle = String(filter.value ?? "").toLowerCase();
      return String(raw).toLowerCase().includes(needle);
    }
    case "in": {
      const list = Array.isArray(filter.value) ? filter.value : [filter.value ?? ""];
      if (isNumeric || isDate) return list.some((v) => asComparable(v as string | number) === left);
      const key = categoryKey(String(raw));
      return list.some((v) => categoryKey(String(v)) === key);
    }
    case "gt": case "gte": case "lt": case "lte": {
      if (filter.value === undefined) throw new QueryError(`Filter on "${filter.field}" needs a value.`);
      const right = asComparable(filter.value as string | number);
      if (filter.op === "gt") return left > right;
      if (filter.op === "gte") return left >= right;
      if (filter.op === "lt") return left < right;
      return left <= right;
    }
    case "between": {
      const list = Array.isArray(filter.value) ? filter.value : [];
      if (list.length !== 2) throw new QueryError(`"between" on "${filter.field}" needs [min, max].`);
      const lo = asComparable(list[0]);
      const hi = asComparable(list[1]);
      return left >= lo && left <= hi;
    }
    default:
      throw new QueryError(`Unsupported operator "${filter.op}".`);
  }
}

export function applyFilters(dataset: Dataset, filters: Filter[] = []): Row[] {
  if (!filters.length) return dataset.rows;
  return dataset.rows.filter((row) => filters.every((f) => matches(row, f, dataset)));
}

export type RecordsResult = {
  board: string;
  matched: number;
  returned: number;
  fields: string[];
  records: Record<string, string | number | null>[];
  note?: string;
  /**
   * Names repeat across unrelated rows in this data, so a name is never an
   * identifier. When the result set contains repeats, say so loudly here: the
   * model cannot then present one row as though it were the whole entity.
   */
  ambiguous_name_warning?: string;
};

/**
 * Flags repeated item names among the returned rows. Reads the underlying rows
 * rather than the projected records, so it still fires when the caller did not
 * select the name field.
 */
function duplicateNameWarning(rows: Row[]): string | undefined {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = row.name;
    if (typeof name !== "string" || !name.trim()) continue;
    const key = name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const repeated = [...counts.entries()].filter(([, n]) => n > 1);
  if (!repeated.length) return undefined;

  const detail = repeated
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => `"${name}" x${n}`)
    .join(", ");

  return `These rows are DISTINCT records that happen to share a name (${detail}). A name is not a unique identifier in this data. Do not describe them as one deal or merge their values. Report how many records share the name and either list them separately or aggregate them explicitly.`;
}

export function queryRecords(
  dataset: Dataset,
  opts: { filters?: Filter[]; fields?: string[]; sortBy?: string; sortDir?: "asc" | "desc"; limit?: number },
): RecordsResult {
  const rows = applyFilters(dataset, opts.filters);
  const limit = Math.min(opts.limit ?? 25, 100);

  const selected = opts.fields?.length
    ? opts.fields.map((f) => resolveField(dataset, f))
    : [{ key: "item_name", kind: "name" as const, title: "Item name" }, ...dataset.fields.slice(0, 8).map((f) => ({ key: f.key, kind: f.kind, title: f.title }))];

  let ordered = rows;
  if (opts.sortBy) {
    const sortField = resolveField(dataset, opts.sortBy);
    const dir = opts.sortDir === "asc" ? 1 : -1;
    ordered = [...rows].sort((a, b) => {
      const av = cellOf(a, sortField.key);
      const bv = cellOf(b, sortField.key);
      if (av === null) return 1;
      if (bv === null) return -1;
      return av > bv ? dir : av < bv ? -dir : 0;
    });
  }

  const records = ordered.slice(0, limit).map((row) => {
    const out: Record<string, string | number | null> = {};
    for (const f of selected) out[f.key] = cellOf(row, f.key);
    return out;
  });

  return {
    board: dataset.boardName,
    matched: rows.length,
    returned: records.length,
    fields: selected.map((f) => f.key),
    records,
    note:
      rows.length > records.length
        ? `${rows.length - records.length} more rows matched but were not returned. Use aggregate_metrics for totals rather than paging through records.`
        : undefined,
    ambiguous_name_warning: duplicateNameWarning(ordered.slice(0, limit)),
  };
}

export type Confidence = {
  level: "high" | "medium" | "low";
  score: number;
  basis: string[];
};

/**
 * What the total would be if the rows dropped for a blank metric were not
 * actually blank. Reporting "₹4.8 Cr, but 7 of 11 rows had no value" leaves the
 * reader unable to act; bounding the gap tells them whether the missing data
 * could change the decision. Explicitly an estimate, and labelled as one.
 */
export type Uncertainty = {
  reported: number;
  excluded_rows: number;
  typical_value: number;
  projected_total: number;
  projected_range: [number, number];
  method: string;
};

export type AggregateResult = {
  board: string;
  metric: string;
  aggregation: Aggregation;
  groupBy?: string;
  matched: number;
  /** Rows excluded from a numeric aggregation because the metric was missing. */
  excludedForMissingMetric: number;
  overall: number | null;
  groups: { group: string; value: number; display: string; count: number; missingMetric: number }[];
  /** Pre-rendered overall figure. Quote this rather than converting.  */
  overall_display: string | null;
  confidence: Confidence;
  uncertainty?: Uncertainty;
};

/**
 * Pre-renders a figure for display.
 *
 * The model reliably slips a decimal converting rupees to crore, producing
 * numbers ten times too large or small. Since the server already owns the
 * arithmetic, it owns the formatting too: the model is told to quote these
 * strings verbatim rather than convert anything itself.
 */
export function formatValue(n: number, kind: FieldKind | "count" | "derived" | "name"): string {
  if (kind === "count") return n.toLocaleString("en-IN");
  if (kind !== "currency") {
    return Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toFixed(2);
  }
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

const percentile = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
};

/**
 * Projects the excluded rows from the distribution of the populated ones. Uses
 * the median rather than the mean so a single outlier deal cannot inflate the
 * projection, and brackets it with the interquartile range.
 */
function estimateUncertainty(
  reported: number,
  knownValues: number[],
  excluded: number,
): Uncertainty | undefined {
  if (excluded <= 0 || knownValues.length < 3) return undefined;

  const sorted = [...knownValues].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);

  return {
    reported: round(reported),
    excluded_rows: excluded,
    typical_value: round(median),
    projected_total: round(reported + excluded * median),
    projected_range: [round(reported + excluded * p25), round(reported + excluded * p75)],
    method: `The reported figure counts only the ${knownValues.length} rows that have a value. The ${excluded} row(s) with none are projected here at the median of those rows, bracketed by their 25th and 75th percentiles. This is an estimate for sizing the gap, not data. Quote the reported figure as the number, and the projection only to say how much the missing rows could move it.`,
  };
}

/**
 * Rates how much weight an answer can carry.
 *
 * Scoped deliberately to the rows this answer actually used, not the board as a
 * whole: a column that is 48% populated board-wide is irrelevant if every row
 * that matched the filter has a value. Each field is also judged by the role it
 * played, because those roles carry different risk:
 *
 *   metric   - a blank drops the row from the total, so this drives the score
 *   groupBy  - a blank becomes a visible "(not set)" bucket, so it is reported
 *              and only mildly penalised
 *   filter   - a row that matched an equality filter necessarily has the value,
 *              so it carries no penalty at all
 */
export function rateConfidence(
  dataset: Dataset,
  rows: Row[],
  opts: { aggregation: Aggregation; metric?: string; groupBy?: string },
): Confidence {
  const matched = rows.length;
  if (!matched) {
    return { level: "low", score: 0, basis: ["no rows matched this filter"] };
  }

  const basis: string[] = [];
  let score = 100;

  const fieldFor = (name?: string) => {
    if (!name) return undefined;
    try {
      const resolved = resolveField(dataset, name);
      return dataset.fields.find((f) => f.key === resolved.key.split("__")[0]);
    } catch {
      return undefined;
    }
  };

  // Counting rows never reads the metric, so a sparse metric cannot hurt it.
  if (opts.aggregation !== "count" && opts.metric) {
    const field = fieldFor(opts.metric);
    if (field) {
      const filled = rows.filter((r) => cellOf(r, field.key) !== null).length;
      const fill = filled / matched;
      score = Math.min(score, Math.round(fill * 100));
      basis.push(
        filled === matched
          ? `${field.title} is populated on all ${matched} rows used here`
          : `${field.title} is missing on ${matched - filled} of the ${matched} rows used here, so they are excluded from the total`,
      );
      if (field.unparsed > 0) {
        basis.push(`${field.unparsed} value(s) in ${field.title} could not be read board-wide`);
      }
    }
  }

  if (opts.groupBy) {
    const field = fieldFor(opts.groupBy);
    if (field) {
      const blank = rows.filter((r) => cellOf(r, field.key) === null).length;
      if (blank) {
        // Reported as "(not set)" rather than dropped, so this is a caveat, not a loss.
        score = Math.min(score, 100 - Math.round((blank / matched) * 35));
        basis.push(
          `${blank} of ${matched} rows have no ${field.title} and are reported as "(not set)" rather than dropped`,
        );
      }
    }
  }

  // A handful of rows is a thin base for a claim regardless of completeness.
  if (matched < 5) {
    score = Math.min(score, 55);
    basis.push(`only ${matched} row${matched === 1 ? "" : "s"} matched, so the figure is thin`);
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 85 ? "high" : score >= 60 ? "medium" : "low";
  return {
    level,
    score,
    basis: basis.length ? basis : [`every field used is populated on all ${matched} rows`],
  };
}

export function aggregateMetrics(
  dataset: Dataset,
  opts: {
    metric?: string;
    aggregation: Aggregation;
    groupBy?: string;
    filters?: Filter[];
    limit?: number;
  },
): AggregateResult {
  const rows = applyFilters(dataset, opts.filters);
  const agg = opts.aggregation;

  const needsMetric = agg !== "count";
  if (needsMetric && !opts.metric) {
    throw new QueryError(`Aggregation "${agg}" requires a metric field.`);
  }

  const metricField = opts.metric ? resolveField(dataset, opts.metric) : null;
  if (metricField && ["sum", "avg", "min", "max"].includes(agg)) {
    if (metricField.kind !== "number" && metricField.kind !== "currency") {
      throw new QueryError(
        `"${metricField.title}" is a ${metricField.kind} field — ${agg} needs a numeric field.`,
      );
    }
  }

  const groupField = opts.groupBy ? resolveField(dataset, opts.groupBy) : null;

  const buckets = new Map<string, { values: number[]; distinct: Set<string>; count: number; missing: number }>();

  for (const row of rows) {
    let groupLabel = "All";
    if (groupField) {
      const raw = cellOf(row, groupField.key);
      groupLabel = raw === null || raw === "" ? "(not set)" : String(raw);
      if (groupField.kind === "category") {
        groupLabel = row.keys[groupField.key]
          ? String(cellOf(row, groupField.key))
          : "(not set)";
      }
    }

    if (!buckets.has(groupLabel)) {
      buckets.set(groupLabel, { values: [], distinct: new Set(), count: 0, missing: 0 });
    }
    const bucket = buckets.get(groupLabel)!;
    bucket.count++;

    if (metricField) {
      const raw = cellOf(row, metricField.key);
      if (raw === null || raw === "") bucket.missing++;
      else if (typeof raw === "number") bucket.values.push(raw);
      else {
        bucket.distinct.add(categoryKey(String(raw)) ?? String(raw));
        const n = parseNumber(raw);
        if (n !== null) bucket.values.push(n);
      }
    }
  }

  const reduce = (b: { values: number[]; distinct: Set<string>; count: number }): number => {
    switch (agg) {
      case "count": return b.count;
      case "count_distinct": return b.distinct.size || new Set(b.values).size;
      case "sum": return b.values.reduce((x, y) => x + y, 0);
      case "avg": return b.values.length ? b.values.reduce((x, y) => x + y, 0) / b.values.length : 0;
      case "min": return b.values.length ? Math.min(...b.values) : 0;
      case "max": return b.values.length ? Math.max(...b.values) : 0;
    }
  };

  const groups = [...buckets.entries()]
    .map(([group, b]) => {
      const v = round(reduce(b));
      return {
        group,
        value: v,
        display: formatValue(v, agg === "count" ? "count" : (metricField?.kind ?? "number")),
        count: b.count,
        missingMetric: b.missing,
      };
    })
    .sort((a, b) => (agg === "count" ? b.count - a.count : b.value - a.value))
    .slice(0, opts.limit ?? 25);

  const all = { values: [] as number[], distinct: new Set<string>(), count: rows.length, missing: 0 };
  for (const b of buckets.values()) {
    all.values.push(...b.values);
    for (const d of b.distinct) all.distinct.add(d);
    all.missing += b.missing;
  }

  return {
    board: dataset.boardName,
    metric: metricField?.title ?? "row count",
    aggregation: agg,
    groupBy: groupField?.title,
    matched: rows.length,
    excludedForMissingMetric: all.missing,
    overall: rows.length ? round(reduce(all)) : null,
    overall_display: rows.length
      ? formatValue(round(reduce(all)), agg === "count" ? "count" : (metricField?.kind ?? "number"))
      : null,
    groups,
    confidence: rateConfidence(dataset, rows, {
      aggregation: agg,
      metric: opts.metric,
      groupBy: opts.groupBy,
    }),
    // Only meaningful for a total: projecting an average or a min/max from the
    // rows that happen to be populated would not describe anything real.
    uncertainty:
      agg === "sum"
        ? estimateUncertainty(reduce(all) as number, all.values, all.missing)
        : undefined,
  };
}

const round = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);
