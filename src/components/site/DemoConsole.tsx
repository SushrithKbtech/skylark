"use client";

import { useEffect, useRef, useState } from "react";
import { ToolTrail } from "@/components/ToolTrail";
import { Answer } from "@/components/Answer";
import type { ToolStep } from "@/lib/chat-types";

/**
 * A real preview: this renders the same ToolTrail and Answer components the
 * console uses, driven by a fixed sample payload. Figures below are sample
 * values, not readings from any board.
 */

const STEPS = [
  {
    label: "Ask",
    title: "A founder asks in plain language",
    body: "No filters, no field names, no board picker. The question arrives exactly as it would be asked in a meeting.",
  },
  {
    label: "Discover",
    title: "The agent reads the live board schema",
    body: "Before any analysis it pulls the real columns, their types, and the actual spellings of every category, so it filters on what the data says rather than on a guess.",
  },
  {
    label: "Normalise",
    title: "Messy values are cleaned server-side",
    body: "Mixed date formats, currency strings, units baked into numbers, and a dozen spellings of empty all resolve before a single figure is computed.",
  },
  {
    label: "Answer",
    title: "Numbers are computed, then explained",
    body: "The server does the arithmetic, so totals are reproducible. The model explains the result and states what the data could not tell it.",
  },
];

const TRAIL: ToolStep[] = [
  {
    id: "d1",
    name: "describe_boards",
    input: { board: "both" },
    status: "ok",
    summary: "Deal tracker · 346 rows   ·   Work order tracker · 176 rows",
  },
  {
    id: "d2",
    name: "aggregate_metrics",
    input: {
      board: "deals",
      aggregation: "sum",
      metric: "masked_deal_value",
      group_by: "sector_service",
      filters: [1],
    },
    status: "ok",
    summary: "sum of Masked Deal value · 218 rows · 6 groups",
  },
  {
    id: "d3",
    name: "data_quality_report",
    input: { board: "deals" },
    status: "ok",
    summary: "Deal tracker 78% complete",
  },
];

const SAMPLE_ANSWER = `**Mining is the largest open sector this quarter at ₹4.81 Cr** across 38 deals, which is 31% of total open pipeline.

| Sector | Open value | Deals |
| --- | --- | --- |
| Mining | ₹4.81 Cr | 38 |
| Powerline | ₹3.02 Cr | 44 |
| Solar | ₹1.44 Cr | 19 |

Powerline carries more deals but a smaller average size, so mining is doing more with fewer opportunities. Worth watching: a single account is 41% of the mining figure.`;

const NORMALISED = [
  ['"15/03/25"', "2025-03-15"],
  ['"₹1.2 Cr"', "12000000"],
  ['"5360 HA"', "5360"],
  ['"N/A"', "null"],
];

export function DemoConsole() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => e.isIntersecting && setPlaying(true), {
      threshold: 0.3,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % STEPS.length), 3800);
    return () => clearInterval(timer);
  }, [playing]);

  const visibleSteps = TRAIL.slice(0, active === 0 ? 0 : active === 1 ? 1 : 3).map((s) =>
    active === 1 ? { ...s, status: "running" as const, summary: undefined } : s,
  );

  return (
    <div
      ref={ref}
      className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14"
    >
      <ol className="flex flex-col gap-1">
        {STEPS.map((step, i) => {
          const on = i === active;
          return (
            <li key={step.label}>
              <button
                onClick={() => setActive(i)}
                aria-current={on}
                className="relative w-full rounded-2xl px-4 py-4 text-left transition-all duration-500"
                style={{
                  transitionTimingFunction: "var(--ease)",
                  background: on ? "var(--surface)" : "transparent",
                  border: `1px solid ${on ? "color-mix(in srgb, var(--accent) 26%, transparent)" : "transparent"}`,
                  boxShadow: on ? "var(--shadow)" : "none",
                }}
              >
                <span
                  className="absolute top-4 bottom-4 left-0 w-[2px] rounded-full transition-opacity duration-500"
                  style={{
                    background: "var(--accent)",
                    opacity: on ? 1 : 0,
                    transitionTimingFunction: "var(--ease)",
                  }}
                />
                <span
                  className="block text-[13px] font-semibold tracking-[-0.005em]"
                  style={{ color: on ? "var(--accent)" : "var(--faint)" }}
                >
                  {step.label}
                </span>
                <span className="mt-1.5 block text-[15px] font-semibold tracking-[-0.012em]">
                  {step.title}
                </span>
                <span
                  className="grid transition-[grid-template-rows,opacity] duration-500"
                  style={{
                    gridTemplateRows: on ? "1fr" : "0fr",
                    opacity: on ? 1 : 0,
                    transitionTimingFunction: "var(--ease)",
                  }}
                >
                  <span className="overflow-hidden">
                    <span className="mt-1.5 block text-[13.5px] leading-relaxed text-[var(--muted)]">
                      {step.body}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="glass glow overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-3">
          <Mark />
          <span className="mono text-[11px] text-[var(--faint)]">console preview</span>
          <span className="mono ml-auto text-[10.5px] text-[var(--faint)]">sample data</span>
        </div>

        <div className="min-h-[440px] space-y-4 p-5">
          <div className="flex justify-end">
            <p
              className="max-w-[86%] rounded-2xl rounded-br-md border border-[var(--line)] px-3.5 py-2.5 text-[13.5px] leading-relaxed"
              style={{ background: "var(--accent-soft)" }}
            >
              How is our pipeline looking for the mining sector this quarter?
            </p>
          </div>

          {visibleSteps.length > 0 && <ToolTrail key={active} steps={visibleSteps} />}

          <div
            className="flex flex-wrap gap-1.5 transition-opacity duration-700"
            style={{
              opacity: active === 2 ? 1 : 0.25,
              transitionTimingFunction: "var(--ease)",
            }}
          >
            {NORMALISED.map(([from, to]) => (
              <span
                key={from}
                className="mono inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[10.5px]"
              >
                <span className="text-[var(--faint)]">{from}</span>
                <span style={{ color: "var(--accent)" }}>{"→"}</span>
                <span>{to}</span>
              </span>
            ))}
          </div>

          <div
            className="transition-all duration-700"
            style={{
              opacity: active === 3 ? 1 : 0.16,
              transform: active === 3 ? "none" : "translateY(6px)",
              transitionTimingFunction: "var(--ease)",
            }}
          >
            <Answer text={SAMPLE_ANSWER} />
            <div
              className="mt-3 rounded-xl border px-3.5 py-2.5"
              style={{
                borderColor: "color-mix(in srgb, var(--warning) 30%, transparent)",
                background: "color-mix(in srgb, var(--warning) 6%, transparent)",
              }}
            >
              <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--warning)" }}>
                11 mining deals have no close date, so the quarterly split excludes ₹62 L of open
                value.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <span
      className="h-2.5 w-2.5 rounded-[3px]"
      style={{ background: "var(--accent)", opacity: 0.5 }}
    />
  );
}
