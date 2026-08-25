"use client";

import type { Series } from "@/lib/data/report";

/**
 * Charts drawn as inline SVG from server-computed values.
 *
 * No charting library: the shapes needed here are bars and a funnel, the values
 * are already computed, and inline SVG prints to PDF cleanly where a canvas
 * library would not. Every bar is labelled with its own figure, so the chart is
 * readable without reference to an axis.
 */

const ACCENT = "var(--accent)";

export function BarSeries({ series }: { series: Series }) {
  const max = Math.max(...series.points.map((p) => p.value), 1);

  if (!series.points.length) {
    return (
      <p className="text-[13px] text-[var(--faint)]">
        No rows carried a value for this breakdown.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {series.points.map((p, i) => (
        <div key={p.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-[12.5px] text-[var(--muted)]" title={p.label}>
              {p.label}
            </span>
            <span className="mono tabular shrink-0 text-[12px]">{p.display}</span>
          </div>
          <div
            className="h-[7px] w-full overflow-hidden rounded-full"
            style={{ background: "var(--track)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((p.value / max) * 100, 1.5)}%`,
                background: ACCENT,
                opacity: 1 - Math.min(i * 0.08, 0.55),
                animation: `growBar 0.8s var(--ease) ${i * 60}ms both`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The cash chain as nested proportions: ordered contains billed contains
 * collected. Showing them as one shape makes the shortfall the visible thing,
 * which is the point of the chart.
 */
export function CashChain({ series }: { series: Series }) {
  const base = series.points[0]?.value || 1;

  return (
    <div className="flex flex-col gap-4">
      {series.points.map((p, i) => {
        const pct = (p.value / base) * 100;
        return (
          <div key={p.label}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[12.5px] text-[var(--muted)]">{p.label}</span>
              <span className="mono tabular text-[12.5px]">{p.display}</span>
            </div>
            <div
              className="h-[13px] w-full overflow-hidden rounded-[4px]"
              style={{ background: "var(--track)" }}
            >
              <div
                className="h-full rounded-[4px]"
                style={{
                  width: `${Math.max(pct, 1)}%`,
                  background: ACCENT,
                  opacity: 1 - i * 0.22,
                  animation: `growBar 0.9s var(--ease) ${i * 110}ms both`,
                }}
              />
            </div>
            {i > 0 && (
              <p className="mt-1 text-[11px] text-[var(--faint)]">
                {pct.toFixed(0)}% of {series.points[0].label.toLowerCase()}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Share-of-total donut, for a count breakdown where proportion is the story. */
export function Donut({ series }: { series: Series }) {
  const total = series.points.reduce((n, p) => n + p.value, 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;

  // Each arc starts where the previous one ended. Built by reduction so nothing
  // is mutated during render.
  const arcs = series.points.reduce<{ label: string; dash: number; offset: number }[]>(
    (acc, p) => {
      const previous = acc[acc.length - 1];
      const offset = previous ? previous.offset + previous.dash : 0;
      return [...acc, { label: p.label, dash: (p.value / total) * C, offset }];
    },
    [],
  );

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 130 130" className="h-[130px] w-[130px] shrink-0 -rotate-90">
        <circle cx="65" cy="65" r={R} fill="none" stroke="var(--track)" strokeWidth="16" />
        {arcs.map((a, i) => (
          <circle
            key={a.label}
            cx="65"
            cy="65"
            r={R}
            fill="none"
            stroke={ACCENT}
            strokeWidth="16"
            strokeDasharray={`${a.dash} ${C - a.dash}`}
            strokeDashoffset={-a.offset}
            opacity={1 - Math.min(i * 0.13, 0.72)}
          />
        ))}
      </svg>

      <ul className="flex min-w-[160px] flex-1 flex-col gap-1.5">
        {series.points.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2 text-[12.5px]">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: ACCENT, opacity: 1 - Math.min(i * 0.13, 0.72) }}
            />
            <span className="flex-1 truncate text-[var(--muted)]">{p.label}</span>
            <span className="mono tabular">{p.display}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
