import { fetchBoard, type RawBoard } from "@/lib/monday/boards";
import {
  categoryKey,
  cleanText,
  fiscalQuarterOf,
  inferKind,
  isBlank,
  parseDate,
  parseNumber,
  prettyCategory,
  quarterOf,
  type FieldKind,
} from "./normalize";

export type FieldSpec = {
  key: string;
  title: string;
  kind: FieldKind;
  mondayType: string;
  filled: number;
  missing: number;
  /** Present for categorical fields: canonical value -> display label + count. */
  categories?: { value: string; label: string; count: number }[];
  /** Present for numeric fields. */
  stats?: { min: number; max: number; sum: number; mean: number };
  /** Present for date fields. */
  range?: { earliest: string; latest: string };
  /** Values that could not be coerced to the inferred kind. */
  unparsed: number;
};

export type Row = {
  id: string;
  name: string;
  values: Record<string, string | number | null>;
  /** Canonical grouping keys for categorical fields. */
  keys: Record<string, string | null>;
  /** Derived calendar + fiscal quarter per date field. */
  derived: Record<string, string>;
};

export type Dataset = {
  boardId: string;
  boardName: string;
  slug: string;
  rowCount: number;
  fields: FieldSpec[];
  rows: Row[];
  quality: QualityReport;
  fetchedAt: string;
};

export type QualityReport = {
  rowCount: number;
  completeness: number;
  duplicateNames: number;
  emptyRows: number;
  issues: { field: string; issue: string; count: number; severity: "high" | "medium" | "low" }[];
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Field key is derived from the human title so the LLM can reference it naturally. */
function fieldKey(title: string, used: Set<string>) {
  const base = slugify(title) || "field";
  let key = base;
  let n = 2;
  while (used.has(key)) key = `${base}_${n++}`;
  used.add(key);
  return key;
}

export function buildDataset(raw: RawBoard): Dataset {
  const used = new Set<string>(["item_name"]);
  const columnMeta = raw.columns
    .filter((c) => !["subtasks", "file", "doc", "button"].includes(c.type))
    .map((c) => ({ ...c, key: fieldKey(c.title, used) }));

  const rawByColumn = new Map<string, (string | null)[]>();
  for (const col of columnMeta) rawByColumn.set(col.id, []);

  for (const item of raw.items) {
    for (const cv of item.column_values) {
      const bucket = rawByColumn.get(cv.id);
      if (bucket) bucket.push(cleanText(cv.text));
    }
  }

  const fields: FieldSpec[] = columnMeta.map((col) => {
    const values = rawByColumn.get(col.id) ?? [];
    const kind = inferKind(col.title, col.type, values.slice(0, 200));
    return {
      key: col.key,
      title: col.title,
      kind,
      mondayType: col.type,
      filled: 0,
      missing: 0,
      unparsed: 0,
    };
  });

  const fieldByColumnId = new Map(columnMeta.map((c, i) => [c.id, fields[i]]));
  const kindByKey = new Map(fields.map((f) => [f.key, f.kind]));

  const categoryCounts = new Map<string, Map<string, { label: string; count: number }>>();
  const numeric = new Map<string, number[]>();
  const dates = new Map<string, string[]>();

  const rows: Row[] = raw.items.map((item) => {
    const values: Row["values"] = {};
    const keys: Row["keys"] = {};
    const derived: Row["derived"] = {};

    for (const cv of item.column_values) {
      const field = fieldByColumnId.get(cv.id);
      if (!field) continue;

      let text = cleanText(cv.text);

      // Header-leak artifact: a status/dropdown value identical to its own
      // column title (e.g. a "Deal Stage" value literally reading "Deal
      // Stage") is an import defect, not a real business value.
      if (
        field.kind === "category" &&
        text &&
        categoryKey(text) === categoryKey(field.title)
      ) {
        text = null;
      }

      if (isBlank(text)) {
        field.missing++;
        values[field.key] = null;
        if (field.kind === "category") keys[field.key] = null;
        continue;
      }
      field.filled++;

      switch (field.kind) {
        case "date": {
          const iso = parseDate(text);
          if (!iso) {
            field.unparsed++;
            values[field.key] = null;
            break;
          }
          values[field.key] = iso;
          derived[`${field.key}__quarter`] = quarterOf(iso);
          derived[`${field.key}__fiscal_quarter`] = fiscalQuarterOf(iso);
          derived[`${field.key}__year`] = iso.slice(0, 4);
          derived[`${field.key}__month`] = iso.slice(0, 7);
          if (!dates.has(field.key)) dates.set(field.key, []);
          dates.get(field.key)!.push(iso);
          break;
        }
        case "number":
        case "currency": {
          const n = parseNumber(text);
          if (n === null) {
            field.unparsed++;
            values[field.key] = null;
            break;
          }
          values[field.key] = n;
          if (!numeric.has(field.key)) numeric.set(field.key, []);
          numeric.get(field.key)!.push(n);
          break;
        }
        case "category": {
          const key = categoryKey(text);
          values[field.key] = text;
          keys[field.key] = key;
          if (key) {
            if (!categoryCounts.has(field.key)) categoryCounts.set(field.key, new Map());
            const bucket = categoryCounts.get(field.key)!;
            const existing = bucket.get(key);
            if (existing) existing.count++;
            else bucket.set(key, { label: prettyCategory(key), count: 1 });
          }
          break;
        }
        default:
          values[field.key] = text;
      }
    }

    // Columns absent from column_values still need an explicit null.
    for (const field of fields) {
      if (!(field.key in values)) {
        values[field.key] = null;
        field.missing++;
      }
    }

    return { id: item.id, name: cleanText(item.name) ?? `Item ${item.id}`, values, keys, derived };
  });

  for (const field of fields) {
    if (field.kind === "category") {
      const bucket = categoryCounts.get(field.key);
      field.categories = bucket
        ? [...bucket.entries()]
            .map(([value, v]) => ({ value, label: v.label, count: v.count }))
            .sort((a, b) => b.count - a.count)
        : [];
    }
    if (field.kind === "number" || field.kind === "currency") {
      const nums = numeric.get(field.key) ?? [];
      if (nums.length) {
        const sum = nums.reduce((a, b) => a + b, 0);
        field.stats = {
          min: Math.min(...nums),
          max: Math.max(...nums),
          sum,
          mean: sum / nums.length,
        };
      }
    }
    if (field.kind === "date") {
      const ds = (dates.get(field.key) ?? []).sort();
      if (ds.length) field.range = { earliest: ds[0], latest: ds[ds.length - 1] };
    }
  }

  void kindByKey;

  return {
    boardId: raw.id,
    boardName: raw.name,
    slug: slugify(raw.name),
    rowCount: rows.length,
    fields,
    rows,
    quality: buildQuality(rows, fields),
    fetchedAt: new Date().toISOString(),
  };
}

function buildQuality(rows: Row[], fields: FieldSpec[]): QualityReport {
  const cells = rows.length * fields.length;
  const filled = fields.reduce((a, f) => a + f.filled, 0);

  const nameCounts = new Map<string, number>();
  for (const r of rows) {
    const k = categoryKey(r.name) ?? r.name;
    nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
  }
  const duplicateNames = [...nameCounts.values()].filter((c) => c > 1).length;

  const emptyRows = rows.filter((r) =>
    Object.values(r.values).every((v) => v === null || v === ""),
  ).length;

  const issues: QualityReport["issues"] = [];
  for (const f of fields) {
    if (!rows.length) break;
    const missingPct = f.missing / rows.length;
    if (missingPct >= 0.5) {
      issues.push({
        field: f.title,
        issue: `${Math.round(missingPct * 100)}% of rows have no value`,
        count: f.missing,
        severity: "high",
      });
    } else if (missingPct >= 0.15) {
      issues.push({
        field: f.title,
        issue: `${Math.round(missingPct * 100)}% of rows have no value`,
        count: f.missing,
        severity: "medium",
      });
    }
    if (f.unparsed > 0) {
      issues.push({
        field: f.title,
        issue: `${f.unparsed} value(s) could not be read as ${f.kind}`,
        count: f.unparsed,
        severity: f.unparsed / Math.max(1, rows.length) > 0.1 ? "high" : "low",
      });
    }
    if (f.kind === "category" && f.categories) {
      const singletons = f.categories.filter((c) => c.count === 1).length;
      if (f.categories.length > 6 && singletons / f.categories.length > 0.5) {
        issues.push({
          field: f.title,
          issue: `${singletons} labels appear only once — likely free-text or typos`,
          count: singletons,
          severity: "medium",
        });
      }
    }
  }

  return {
    rowCount: rows.length,
    completeness: cells ? filled / cells : 0,
    duplicateNames,
    emptyRows,
    issues: issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
  };
}

const severityRank = (s: "high" | "medium" | "low") =>
  s === "high" ? 3 : s === "medium" ? 2 : 1;

export async function loadDataset(boardId: string): Promise<Dataset> {
  return buildDataset(await fetchBoard(boardId));
}
