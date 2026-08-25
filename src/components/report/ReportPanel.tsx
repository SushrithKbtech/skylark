"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  XIcon,
  PrinterIcon,
  ArrowClockwiseIcon,
  WarningIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { BoardReport } from "@/lib/data/report";
import { BarSeries, CashChain, Donut } from "./Charts";

/**
 * Slide-over board report.
 *
 * Every figure is computed server-side and rendered from those values, so the
 * charts cannot disagree with the answers the console gives. Printing uses the
 * browser's own PDF export rather than a PDF library: the layout is already
 * paginated by the print stylesheet, and shipping a renderer to produce a
 * document the browser can already produce would be weight for its own sake.
 */
export function ReportPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [report, setReport] = useState<BoardReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Guards the fetch without going through render state, so opening the panel
  // twice quickly cannot start two builds.
  const started = useRef(false);

  const load = useCallback(async () => {
    started.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/report");
      const body = await res.json();
      if (!body.ok) throw new Error(body.message ?? "Could not build the report.");
      setReport(body.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the fetch is not dispatched synchronously during render.
    if (!open || started.current) return;
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-[90] transition-opacity duration-400 print:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ background: "rgba(9, 11, 20, 0.5)", transitionTimingFunction: "var(--ease)" }}
      />

      <aside
        role="dialog"
        aria-label="Board report"
        aria-hidden={!open}
        className={`fixed top-0 right-0 z-[95] flex h-dvh w-full max-w-[720px] flex-col border-l border-[var(--line)] transition-transform duration-500 print:static print:h-auto print:max-w-none print:border-0 print:transform-none ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          background: "var(--bg-2)",
          transitionTimingFunction: "var(--ease)",
        }}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-6 py-4 print:hidden">
          <div>
            <h2 className="h3 text-[1.02rem]">Board report</h2>
            <p className="text-[12px] text-[var(--faint)]">
              Computed live from both monday.com boards
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="btn-ghost !px-3 !py-2 !text-[13px]"
              title="Rebuild from a fresh read"
            >
              <ArrowClockwiseIcon size={14} weight="bold" className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={() => window.print()}
              disabled={!report}
              className="btn !px-3.5 !py-2 !text-[13px]"
            >
              <PrinterIcon size={14} weight="bold" />
              Save as PDF
            </button>
            <button
              onClick={onClose}
              aria-label="Close the report"
              className="rounded-lg p-2 text-[var(--faint)] transition-colors hover:text-[var(--text)]"
            >
              <XIcon size={16} weight="bold" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 print:overflow-visible print:px-0">
          {loading && !report && <Skeleton />}

          {error && (
            <div
              className="rounded-xl border px-4 py-3"
              style={{
                borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)",
                background: "color-mix(in srgb, var(--danger) 6%, transparent)",
              }}
            >
              <p className="text-[13px]" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            </div>
          )}

          {report && <ReportBody report={report} />}
        </div>
      </aside>
    </>
  );
}

function ReportBody({ report }: { report: BoardReport }) {
  const when = new Date(report.generatedAt);

  return (
    <article className="report flex flex-col gap-9">
      {/* Print-only masthead */}
      <header className="hidden print:block">
        <h1 className="display text-[2rem]">Skylark BI board report</h1>
        <p className="mt-1 text-[12px] text-[var(--faint)]">
          Generated {when.toLocaleString()} from live monday.com boards
        </p>
      </header>

      <section>
        <p className="text-[12px] text-[var(--faint)] print:hidden">
          Generated {when.toLocaleString()}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.headline.map((s) => (
            <div key={s.label} className="glass p-4 print:border print:shadow-none">
              <p className="text-[11px] tracking-[0.14em] text-[var(--faint)] uppercase">
                {s.label}
              </p>
              <p className="stat mt-1.5 text-[1.5rem]">{s.value}</p>
              {s.note && (
                <p
                  className="mt-1 text-[11.5px]"
                  style={{
                    color:
                      s.tone === "warn"
                        ? "var(--warning)"
                        : s.tone === "good"
                          ? "var(--success)"
                          : "var(--faint)",
                  }}
                >
                  {s.note}
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-[12px] text-[var(--faint)]">
          {report.boards
            .map((b) => `${b.name}: ${b.rows} rows, ${b.completeness}% populated`)
            .join("   ·   ")}
        </p>
      </section>

      {report.series.map((s) => (
        <section key={s.title} className="break-inside-avoid">
          <h3 className="h3 text-[1rem]">{s.title}</h3>
          {s.subtitle && (
            <p className="mt-0.5 text-[12px] text-[var(--faint)]">{s.subtitle}</p>
          )}

          <div className="mt-4">
            {s.title.startsWith("Where the money") ? (
              <CashChain series={s} />
            ) : s.unit === "count" ? (
              <Donut series={s} />
            ) : (
              <BarSeries series={s} />
            )}
          </div>

          {s.caveat && (
            <p className="mt-3 text-[11.5px]" style={{ color: "var(--warning)" }}>
              {s.caveat}
            </p>
          )}
        </section>
      ))}

      {report.audit.map((a) => (
        <section key={a.board} className="break-inside-avoid">
          <h3 className="h3 text-[1rem]">Consistency checks on {a.board}</h3>
          <p className="mt-0.5 text-[12px] text-[var(--faint)]">
            {a.checks_run} arithmetic rules reconciled across related columns
          </p>

          <ul className="mt-4 flex flex-col gap-2.5">
            {a.findings.map((f) => (
              <li
                key={f.rule}
                className="flex gap-2.5 rounded-xl border px-3.5 py-3"
                style={{
                  borderColor: "color-mix(in srgb, var(--warning) 28%, transparent)",
                  background: "color-mix(in srgb, var(--warning) 5%, transparent)",
                }}
              >
                <WarningIcon
                  size={15}
                  weight="fill"
                  style={{ color: "var(--warning)", marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <p className="text-[13px] font-semibold">{f.rule}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                    {f.violations} of {f.rows_checked} checked rows disagree. {f.explanation}
                  </p>
                  {f.examples.slice(0, 2).map((e) => (
                    <p key={e.row} className="mono mt-1 text-[11px] text-[var(--faint)]">
                      {e.row}: {e.detail}
                    </p>
                  ))}
                </div>
              </li>
            ))}

            {a.clean.map((rule) => (
              <li key={rule} className="flex items-center gap-2.5 px-1 text-[12.5px]">
                <ShieldCheckIcon size={14} weight="fill" style={{ color: "var(--success)" }} />
                <span className="text-[var(--muted)]">{rule}</span>
                <span className="ml-auto text-[11.5px]" style={{ color: "var(--success)" }}>
                  reconciles
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {report.caveats.length > 0 && (
        <section className="break-inside-avoid">
          <h3 className="h3 text-[1rem]">Read these with the numbers</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {report.caveats.map((c) => (
              <li key={c} className="flex gap-2.5 text-[12.5px] leading-relaxed">
                <span
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--warning)" }}
                />
                <span className="text-[var(--muted)]">{c}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-[var(--line)] pt-4 text-[11.5px] text-[var(--faint)]">
        Every figure is computed from a live read of the monday.com deals and work orders
        boards. No board data is stored in the application.
      </footer>
    </article>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass h-[92px] animate-pulse" />
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="h-4 w-40 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-[120px] animate-pulse rounded-xl bg-[var(--surface-2)]" />
        </div>
      ))}
    </div>
  );
}
