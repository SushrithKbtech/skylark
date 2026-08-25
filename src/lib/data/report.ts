import { getAllDatasets } from "./store";
import type { Dataset } from "./dataset";
import { aggregateMetrics, formatValue, type AggregateResult } from "./query";
import { auditConsistency, type AuditReport } from "./audit";

/**
 * Board report, computed entirely server-side.
 *
 * Charts are rendered from these numbers rather than from anything the model
 * wrote, for the same reason the model does no arithmetic: a chart that
 * disagrees with the data is worse than no chart. The model's role in the
 * report is the narrative around it, never the figures.
 */

export type Series = {
  title: string;
  subtitle?: string;
  unit: "currency" | "count";
  total: number;
  totalDisplay: string;
  points: { label: string; value: number; display: string; count: number }[];
  caveat?: string;
};

export type Stat = {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
};

export type BoardReport = {
  generatedAt: string;
  boards: { name: string; rows: number; fields: number; completeness: number }[];
  headline: Stat[];
  series: Series[];
  audit: AuditReport[];
  caveats: string[];
};

/** Finds a field by matching its title, so a renamed board still reports. */
function field(d: Dataset, re: RegExp, exclude?: RegExp) {
  return d.fields.find((f) => re.test(f.title) && (!exclude || !exclude.test(f.title)));
}

function toSeries(
  result: AggregateResult,
  title: string,
  unit: Series["unit"],
  subtitle?: string,
  limit = 8,
): Series {
  const points = result.groups
    .filter((g) => g.value > 0)
    .slice(0, limit)
    .map((g) => ({
      label: g.group,
      value: g.value,
      display: g.display,
      count: g.count,
    }));

  return {
    title,
    subtitle,
    unit,
    total: result.overall ?? 0,
    totalDisplay: result.overall_display ?? "0",
    points,
    caveat:
      result.excludedForMissingMetric > 0
        ? `${result.excludedForMissingMetric} of ${result.matched} rows excluded for a blank value.`
        : undefined,
  };
}

export async function buildReport(): Promise<BoardReport> {
  const datasets = await getAllDatasets();
  const deals = datasets.find((d) => d.slug.includes("deal"));
  const work = datasets.find((d) => !d.slug.includes("deal"));

  const series: Series[] = [];
  const headline: Stat[] = [];
  const caveats: string[] = [];

  if (deals) {
    const value = field(deals, /deal value/i);
    const stage = field(deals, /stage/i);
    const sector = field(deals, /sector/i);
    const status = field(deals, /status/i);

    if (value && sector) {
      const bySector = aggregateMetrics(deals, {
        aggregation: "sum",
        metric: value.key,
        groupBy: sector.key,
        filters: status ? [{ field: status.key, op: "eq", value: "Open" }] : [],
      });
      series.push(
        toSeries(bySector, "Open pipeline by sector", "currency", "Deals board, open status"),
      );
      headline.push({
        label: "Open pipeline",
        value: bySector.overall_display ?? "0",
        note: `${bySector.matched} open deals`,
      });
      if (bySector.uncertainty) {
        caveats.push(
          `Open pipeline excludes ${bySector.uncertainty.excluded_rows} deals with no value. Projected at the median, the total would be about ${formatValue(bySector.uncertainty.projected_total, "currency")}.`,
        );
      }
    }

    if (value && stage) {
      const byStage = aggregateMetrics(deals, {
        aggregation: "sum",
        metric: value.key,
        groupBy: stage.key,
        filters: status ? [{ field: status.key, op: "eq", value: "Open" }] : [],
        limit: 20,
      });
      // Stage labels are alphabetically prefixed, so sorting them gives funnel order.
      byStage.groups.sort((a, b) => a.group.localeCompare(b.group));
      series.push(
        toSeries(byStage, "Open pipeline by stage", "currency", "Funnel order", 20),
      );
    }
  }

  if (work) {
    const ordered = field(work, /^amount in rupees.*incl/i);
    const billed = field(work, /^billed value.*incl/i);
    const collected = field(work, /^collected/i);
    const receivable = field(work, /receivable/i);
    const execStatus = field(work, /execution status/i);
    const sector = field(work, /sector/i);

    const sumOf = (f?: { key: string }) =>
      f
        ? aggregateMetrics(work, { aggregation: "sum", metric: f.key })
        : undefined;

    const o = sumOf(ordered);
    const b = sumOf(billed);
    const c = sumOf(collected);
    const r = sumOf(receivable);

    if (o && b && c) {
      series.push({
        title: "Where the money is",
        subtitle: "Work orders board, cash chain",
        unit: "currency",
        total: o.overall ?? 0,
        totalDisplay: o.overall_display ?? "0",
        points: [
          { label: "Ordered", value: o.overall ?? 0, display: o.overall_display ?? "0", count: o.matched },
          { label: "Billed", value: b.overall ?? 0, display: b.overall_display ?? "0", count: b.matched },
          { label: "Collected", value: c.overall ?? 0, display: c.overall_display ?? "0", count: c.matched },
        ],
        caveat: c.uncertainty
          ? `Collected counts only the ${c.matched - c.uncertainty.excluded_rows} work orders carrying a value.`
          : undefined,
      });

      headline.push({ label: "Billed", value: b.overall_display ?? "0" });
      headline.push({
        label: "Collected",
        value: c.overall_display ?? "0",
        note: `${Math.round(((c.overall ?? 0) / (b.overall || 1)) * 100)}% of billed`,
        tone: (c.overall ?? 0) / (b.overall || 1) < 0.7 ? "warn" : "good",
      });
      if (r?.overall != null) {
        headline.push({ label: "Receivable", value: r.overall_display ?? "0", tone: "warn" });
      }
    }

    if (execStatus) {
      const byStatus = aggregateMetrics(work, {
        aggregation: "count",
        groupBy: execStatus.key,
      });
      series.push(toSeries(byStatus, "Work orders by execution status", "count"));
    }

    if (billed && sector) {
      const bySector = aggregateMetrics(work, {
        aggregation: "sum",
        metric: billed.key,
        groupBy: sector.key,
      });
      series.push(toSeries(bySector, "Billed value by sector", "currency", "Work orders board"));
    }
  }

  const audit = datasets.map(auditConsistency).filter((a) => a.checks_run > 0);
  for (const a of audit) {
    for (const f of a.findings) {
      caveats.push(`${f.violations} row(s) on ${a.board} break the rule: ${f.rule.toLowerCase()}.`);
    }
  }

  for (const d of datasets) {
    const pct = Math.round(d.quality.completeness * 100);
    if (pct < 80) {
      caveats.push(`The ${d.boardName} board is ${pct}% populated, so some totals exclude rows.`);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    boards: datasets.map((d) => ({
      name: d.boardName,
      rows: d.rowCount,
      fields: d.fields.length,
      completeness: Math.round(d.quality.completeness * 100),
    })),
    headline,
    series,
    audit,
    caveats,
  };
}
