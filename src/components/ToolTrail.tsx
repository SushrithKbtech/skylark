"use client";

import { useState } from "react";
import type { ToolStep } from "@/lib/chat-types";

const LABELS: Record<string, string> = {
  describe_boards: "Reading board schemas",
  aggregate_metrics: "Aggregating",
  query_records: "Fetching records",
  data_quality_report: "Checking data quality",
  join_boards: "Matching across boards",
};

function StatusDot({ status }: { status: ToolStep["status"] }) {
  const color =
    status === "failed"
      ? "var(--danger)"
      : status === "running"
        ? "var(--accent)"
        : "var(--success)";
  return (
    <span
      className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${status === "running" ? "animate-dot" : ""}`}
      style={{ background: color }}
    />
  );
}

/** Compact one-line rendering of the arguments the model chose. */
function describeInput(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const parts: string[] = [];
  if (o.board) parts.push(String(o.board).replace(/_/g, " "));
  if (o.aggregation) parts.push(`${o.aggregation}${o.metric ? ` · ${o.metric}` : ""}`);
  if (o.group_by) parts.push(`by ${o.group_by}`);
  if (Array.isArray(o.filters) && o.filters.length) {
    parts.push(`${o.filters.length} filter${o.filters.length === 1 ? "" : "s"}`);
  }
  if (o.deals_key && o.work_orders_key) parts.push(`${o.deals_key} ↔ ${o.work_orders_key}`);
  return parts.length ? parts.join("  ·  ") : null;
}

export function ToolTrail({ steps }: { steps: ToolStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;

  const running = steps.some((s) => s.status === "running");
  const failed = steps.filter((s) => s.status === "failed").length;

  return (
    <div className="animate-fade-in mb-4 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--surface)]"
        style={{ transitionTimingFunction: "var(--ease)" }}
      >
        <StatusDot status={running ? "running" : failed ? "failed" : "ok"} />
        <span className={`text-[12px] ${running ? "shimmer" : "text-[var(--muted)]"}`}>
          {running
            ? (LABELS[steps[steps.length - 1].name] ?? "Querying monday.com")
            : `${steps.length} monday.com ${steps.length === 1 ? "query" : "queries"}`}
          {!running && failed > 0 && ` · ${failed} retried`}
        </span>
        <svg
          viewBox="0 0 12 12"
          className={`ml-auto h-3 w-3 text-[var(--faint)] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          style={{ transitionTimingFunction: "var(--ease)" }}
          aria-hidden
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-[350ms]"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transitionTimingFunction: "var(--ease)" }}
      >
        <div className="overflow-hidden">
          <ol className="border-t border-[var(--line)] px-4 py-3">
            {steps.map((step) => {
              const args = describeInput(step.input);
              return (
                <li key={step.id} className="flex gap-2.5 py-1.5">
                  <StatusDot status={step.status} />
                  <div className="min-w-0 flex-1">
                    <p className="mono text-[11.5px] text-[var(--text)]">{step.name}</p>
                    {args && (
                      <p className="mt-0.5 truncate text-[11px] text-[var(--faint)]" title={args}>
                        {args}
                      </p>
                    )}
                    {step.summary && (
                      <p
                        className="mt-0.5 text-[11px]"
                        style={{
                          color: step.status === "failed" ? "var(--danger)" : "var(--muted)",
                        }}
                      >
                        {step.summary}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
