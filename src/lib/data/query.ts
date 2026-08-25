import { categoryKey, parseDate, parseNumber } from "./normalize";
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

function cellOf(row: Row, key: string): string | number | null {
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
};

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
  };
}

export type Confidence = {
  level: "high" | "medium" | "low";
  score: number;
  basis: string[];
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
  groups: { group: string; value: number; count: number; missingMetric: number }[];
  confidence: Confidence;
};

/**
 * Rates how much weight an answer can carry, from the fill rate of the exact
 * fields it touched. Deliberately pessimistic: the weakest field sets the tone,
 * because one sparse column is enough to make a total misleading.
 */
export function rateConfidence(
  dataset: Dataset,
  fieldNames: (string | undefined)[],
  matchedRows: number,
  excludedRows: number,
): Confidence {
  const basis: string[] = [];
  let worst = 1;

  for (const name of fieldNames) {
    if (!name) continue;
    let resolved;
    try {
      resolved = resolveField(dataset, name);
    } catch {
      continue;
    }
    const field = dataset.fields.find((f) => f.key === resolved.key.split("__")[0]);
    if (!field) continue;

    const total = field.filled + field.missing;
    if (!total) continue;
    const fill = field.filled / total;
    worst = Math.min(worst, fill);
    basis.push(`${field.title} ${Math.round(fill * 100)}% populated`);

    if (field.unparsed > 0) {
      basis.push(`${field.unparsed} value(s) in ${field.title} could not be read`);
    }
  }

  if (matchedRows > 0 && excludedRows > 0) {
    const share = excludedRows / matchedRows;
    worst = Math.min(worst, 1 - share);
    basis.push(`${excludedRows} of ${matchedRows} matching rows excluded for a blank value`);
  }

  if (matchedRows > 0 && matchedRows < 5) {
    worst = Math.min(worst, 0.5);
    basis.push(`only ${matchedRows} row(s) matched, so the figure is thin`);
  }

  const score = Math.round(worst * 100);
  const level = score >= 85 ? "high" : score >= 60 ? "medium" : "low";
  return { level, score, basis: basis.length ? basis : ["all fields used are fully populated"] };
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
    .map(([group, b]) => ({
      group,
      value: round(reduce(b)),
      count: b.count,
      missingMetric: b.missing,
    }))
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
    groups,
    confidence: rateConfidence(
      dataset,
      [
        opts.metric,
        opts.groupBy,
        ...(opts.filters ?? []).map((f) => f.field),
      ],
      rows.length,
      all.missing,
    ),
  };
}

const round = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);
