import type OpenAI from "openai";
import { getDataset, resolveBoardId } from "@/lib/data/store";
import {
  aggregateMetrics,
  applyFilters,
  queryRecords,
  QueryError,
  type Aggregation,
  type Filter,
} from "@/lib/data/query";
import { categoryKey } from "@/lib/data/normalize";
import type { Dataset } from "@/lib/data/dataset";

const boardProp = {
  type: "string" as const,
  enum: ["work_orders", "deals"],
  description: "Which monday.com board to read.",
};

const filtersProp = {
  type: "array" as const,
  description:
    "Filters combined with AND. Category matching is case- and punctuation-insensitive.",
  items: {
    type: "object" as const,
    properties: {
      field: { type: "string", description: "Field key from describe_boards." },
      op: {
        type: "string",
        enum: ["eq", "neq", "contains", "in", "gt", "gte", "lt", "lte", "between", "is_empty", "not_empty"],
      },
      value: {
        description:
          "Scalar for most operators; array for 'in' and for 'between' ([min, max]). Dates are ISO yyyy-mm-dd.",
      },
    },
    required: ["field", "op"],
  },
};

const fn = (
  name: string,
  description: string,
  parameters: Record<string, unknown>,
): OpenAI.Chat.Completions.ChatCompletionTool => ({
  type: "function",
  function: { name, description, parameters },
});

export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  fn(
    "describe_boards",
    "Read the live schema of the monday.com boards: every field, its inferred type, how complete it is, the distinct values of categorical fields with counts, numeric ranges, and date ranges. ALWAYS call this before any other tool so you use real field keys and real category spellings rather than guessing.",
    {
      type: "object",
      properties: {
        board: {
          type: "string",
          enum: ["work_orders", "deals", "both"],
          description: "Defaults to both.",
        },
      },
    },
  ),
  fn(
    "aggregate_metrics",
    "Compute a total, average, count, min or max over one board, optionally grouped by a field. This is the primary analysis tool — prefer it over pulling records. Date fields expose derived groupings: append __quarter (calendar), __fiscal_quarter (Apr-Mar Indian FY), __year or __month to a date field key.",
    {
      type: "object",
      properties: {
        board: boardProp,
        aggregation: {
          type: "string",
          enum: ["sum", "avg", "count", "count_distinct", "min", "max"],
        },
        metric: {
          type: "string",
          description: "Numeric field to aggregate. Omit only when aggregation is 'count'.",
        },
        group_by: { type: "string", description: "Field key to group by." },
        filters: filtersProp,
        limit: { type: "number", description: "Max groups returned (default 25)." },
      },
      required: ["board", "aggregation"],
    },
  ),
  fn(
    "query_records",
    "Return individual rows. Use for 'show me / list / which ones' questions or to sanity-check outliers — never to compute totals yourself.",
    {
      type: "object",
      properties: {
        board: boardProp,
        filters: filtersProp,
        fields: { type: "array", items: { type: "string" }, description: "Field keys to return." },
        sort_by: { type: "string" },
        sort_dir: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "number", description: "Max 100, default 25." },
      },
      required: ["board"],
    },
  ),
  fn(
    "data_quality_report",
    "Completeness, unparseable values, duplicate names and per-field data issues for a board. Call this when a number looks suspicious, when the user asks how reliable something is, or before a leadership brief.",
    {
      type: "object",
      properties: {
        board: { type: "string", enum: ["work_orders", "deals", "both"] },
      },
    },
  ),
  fn(
    "join_boards",
    "Match rows across the two boards on a shared key (for example deal name, client code or owner code) and report coverage: how many deals have work orders, and optionally a metric summed on each side. Use for questions that span pipeline and execution.",
    {
      type: "object",
      properties: {
        deals_key: { type: "string", description: "Field key on the deals board." },
        work_orders_key: { type: "string", description: "Field key on the work orders board." },
        deals_metric: { type: "string", description: "Optional numeric field to sum on deals." },
        work_orders_metric: { type: "string", description: "Optional numeric field to sum on work orders." },
        deals_filters: filtersProp,
        work_orders_filters: filtersProp,
        limit: { type: "number", description: "Max matched keys listed (default 20)." },
      },
      required: ["deals_key", "work_orders_key"],
    },
  ),
];

type ToolInput = Record<string, unknown>;

/** A real example value for a derived field, so the model filters on the actual string shape rather than guessing. */
function sampleDerived(d: Dataset, derivedKey: string): string | undefined {
  for (const row of d.rows) {
    const v = row.derived[derivedKey];
    if (v) return v;
  }
  return undefined;
}

function describeDataset(d: Dataset) {
  return {
    board: d.slug,
    board_name: d.boardName,
    monday_board_id: d.boardId,
    row_count: d.rowCount,
    fetched_at: d.fetchedAt,
    completeness: `${Math.round(d.quality.completeness * 100)}%`,
    fields: d.fields.map((f) => ({
      key: f.key,
      label: f.title,
      type: f.kind,
      filled: f.filled,
      missing: f.missing,
      unreadable: f.unparsed || undefined,
      values: f.categories?.slice(0, 25).map((c) => `${c.label} (${c.count})`),
      distinct_values: f.categories && f.categories.length > 25 ? f.categories.length : undefined,
      range: f.range ? `${f.range.earliest} to ${f.range.latest}` : undefined,
      numeric: f.stats
        ? { min: f.stats.min, max: f.stats.max, total: f.stats.sum, mean: Math.round(f.stats.mean) }
        : undefined,
      derived_groupings:
        f.kind === "date"
          ? (["quarter", "fiscal_quarter", "year", "month"] as const).map((suffix) => {
              const key = `${f.key}__${suffix}`;
              const sample = sampleDerived(d, key);
              return sample ? `${key} (e.g. "${sample}")` : key;
            })
          : undefined,
    })),
  };
}

async function datasetsFor(ref: unknown): Promise<Dataset[]> {
  const value = typeof ref === "string" ? ref : "both";
  if (value === "both") {
    const { getAllDatasets } = await import("@/lib/data/store");
    return getAllDatasets();
  }
  return [await getDataset(resolveBoardId(value))];
}

export async function runTool(name: string, input: ToolInput): Promise<unknown> {
  try {
    switch (name) {
      case "describe_boards": {
        const datasets = await datasetsFor(input.board);
        return { boards: datasets.map(describeDataset) };
      }

      case "aggregate_metrics": {
        const dataset = await getDataset(resolveBoardId(String(input.board)));
        return aggregateMetrics(dataset, {
          aggregation: input.aggregation as Aggregation,
          metric: input.metric as string | undefined,
          groupBy: input.group_by as string | undefined,
          filters: (input.filters as Filter[]) ?? [],
          limit: input.limit as number | undefined,
        });
      }

      case "query_records": {
        const dataset = await getDataset(resolveBoardId(String(input.board)));
        return queryRecords(dataset, {
          filters: (input.filters as Filter[]) ?? [],
          fields: input.fields as string[] | undefined,
          sortBy: input.sort_by as string | undefined,
          sortDir: input.sort_dir as "asc" | "desc" | undefined,
          limit: input.limit as number | undefined,
        });
      }

      case "data_quality_report": {
        const datasets = await datasetsFor(input.board);
        return {
          boards: datasets.map((d) => ({
            board: d.slug,
            board_name: d.boardName,
            rows: d.quality.rowCount,
            completeness: `${Math.round(d.quality.completeness * 100)}%`,
            duplicate_names: d.quality.duplicateNames,
            empty_rows: d.quality.emptyRows,
            issues: d.quality.issues.slice(0, 20),
          })),
        };
      }

      case "join_boards":
        return joinBoards(input);

      default:
        return { error: `Unknown tool "${name}".` };
    }
  } catch (err) {
    if (err instanceof QueryError) return { error: err.message, recoverable: true };
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, recoverable: true };
  }
}

async function joinBoards(input: ToolInput) {
  const { getAllDatasets } = await import("@/lib/data/store");
  const [workOrders, deals] = await getAllDatasets();

  const dealRows = applyFilters(deals, (input.deals_filters as Filter[]) ?? []);
  const woRows = applyFilters(workOrders, (input.work_orders_filters as Filter[]) ?? []);

  const dealsKey = String(input.deals_key);
  const woKey = String(input.work_orders_key);
  const dealsMetric = input.deals_metric as string | undefined;
  const woMetric = input.work_orders_metric as string | undefined;

  const keyOf = (row: { name: string; values: Record<string, string | number | null> }, field: string) => {
    const raw = field === "item_name" || field === "name" ? row.name : row.values[field];
    return raw === null || raw === undefined ? null : categoryKey(String(raw));
  };

  const numberOf = (row: { values: Record<string, string | number | null> }, field?: string) => {
    if (!field) return 0;
    const v = row.values[field];
    return typeof v === "number" ? v : 0;
  };

  const woIndex = new Map<string, { count: number; metric: number }>();
  let woUnkeyed = 0;
  for (const row of woRows) {
    const k = keyOf(row, woKey);
    if (!k) { woUnkeyed++; continue; }
    const entry = woIndex.get(k) ?? { count: 0, metric: 0 };
    entry.count++;
    entry.metric += numberOf(row, woMetric);
    woIndex.set(k, entry);
  }

  const matched: { key: string; deals: number; work_orders: number; deals_metric: number; work_orders_metric: number }[] = [];
  const dealIndex = new Map<string, { count: number; metric: number }>();
  let dealUnkeyed = 0;

  for (const row of dealRows) {
    const k = keyOf(row, dealsKey);
    if (!k) { dealUnkeyed++; continue; }
    const entry = dealIndex.get(k) ?? { count: 0, metric: 0 };
    entry.count++;
    entry.metric += numberOf(row, dealsMetric);
    dealIndex.set(k, entry);
  }

  for (const [k, d] of dealIndex) {
    const w = woIndex.get(k);
    if (!w) continue;
    matched.push({
      key: k,
      deals: d.count,
      work_orders: w.count,
      deals_metric: Math.round(d.metric),
      work_orders_metric: Math.round(w.metric),
    });
  }

  matched.sort((a, b) => b.work_orders_metric - a.work_orders_metric || b.deals - a.deals);

  const dealsOnly = [...dealIndex.keys()].filter((k) => !woIndex.has(k)).length;
  const woOnly = [...woIndex.keys()].filter((k) => !dealIndex.has(k)).length;

  return {
    joined_on: { deals: dealsKey, work_orders: woKey },
    deals_rows: dealRows.length,
    work_order_rows: woRows.length,
    distinct_deal_keys: dealIndex.size,
    distinct_work_order_keys: woIndex.size,
    matched_keys: matched.length,
    deals_without_work_orders: dealsOnly,
    work_orders_without_deals: woOnly,
    rows_with_blank_key: { deals: dealUnkeyed, work_orders: woUnkeyed },
    caveat:
      "Keys are masked identifiers, so a single key can cover several distinct real-world records. Treat coverage as indicative, not exact.",
    top_matches: matched.slice(0, (input.limit as number) ?? 20),
  };
}
