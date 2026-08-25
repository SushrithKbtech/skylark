"use client";

import { useEffect, useState } from "react";
import type { StatusResponse } from "@/lib/chat-types";

function Meter({ value }: { value: number }) {
  const tone =
    value >= 80 ? "var(--success)" : value >= 55 ? "var(--warning)" : "var(--danger)";
  return (
    <div
      className="h-[3px] w-full overflow-hidden rounded-full"
      style={{ background: "var(--track)" }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-[900ms]"
        style={{
          width: `${Math.max(3, value)}%`,
          background: tone,
          transitionTimingFunction: "var(--ease)",
        }}
      />
    </div>
  );
}

export function BoardPanel() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const data = (await res.json()) as StatusResponse;
        if (alive) setStatus(data);
      } catch {
        if (alive) {
          setStatus({ ok: false, stage: "network", message: "Could not reach the server." });
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[276px]">
      <div className="flex items-baseline justify-between">
        <h2 className="kicker">Connected boards</h2>
        {status?.ok && (
          <span className="flex items-center gap-1.5 text-[10.5px] text-[var(--faint)]">
            <span
              className="animate-dot h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--success)" }}
            />
            live
          </span>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="glass h-[116px] animate-pulse" />
          ))}
        </div>
      )}

      {!loading && status && !status.ok && (
        <div
          className="glass animate-fade-in p-4"
          style={{ borderColor: "color-mix(in srgb, var(--danger) 28%, transparent)" }}
        >
          <p className="kicker" style={{ color: "var(--danger)", letterSpacing: "0.14em" }}>
            Not connected
          </p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--muted)]">{status.message}</p>
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--faint)]">
            Set <code className="mono text-[11px] text-[var(--text)]">MONDAY_API_TOKEN</code>,{" "}
            <code className="mono text-[11px] text-[var(--text)]">MONDAY_BOARD_DEALS</code> and{" "}
            <code className="mono text-[11px] text-[var(--text)]">MONDAY_BOARD_WORK_ORDERS</code>,
            then reload.
          </p>
        </div>
      )}

      {!loading && status?.ok && (
        <div className="space-y-3">
          {status.boards.map((board, i) => (
            <article
              key={board.id}
              className="glass glass-lift animate-fade-up p-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <p
                className="kicker"
                style={{ color: "var(--accent)", letterSpacing: "0.15em", fontSize: "10.5px" }}
              >
                {board.slug.replace(/_/g, " ")}
              </p>
              <h3
                className="mt-1.5 truncate text-[14px] font-semibold tracking-[-0.01em]"
                title={board.name}
              >
                {board.name}
              </h3>

              <div className="mt-3.5 flex items-baseline gap-6">
                <div>
                  <p className="tabular font-display text-[22px] leading-none tracking-[-0.02em]">
                    {board.rows}
                  </p>
                  <p className="kicker mt-1.5" style={{ fontSize: "9.5px" }}>
                    rows
                  </p>
                </div>
                <div>
                  <p className="tabular font-display text-[22px] leading-none tracking-[-0.02em]">
                    {board.fields}
                  </p>
                  <p className="kicker mt-1.5" style={{ fontSize: "9.5px" }}>
                    fields
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <Meter value={board.completeness} />
                <div className="flex justify-between text-[11px] text-[var(--faint)]">
                  <span className="tabular">{board.completeness}% complete</span>
                  {board.issues > 0 && (
                    <span style={{ color: "var(--warning)" }}>
                      {board.issues} note{board.issues === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="mt-auto hidden text-[11.5px] leading-relaxed text-[var(--faint)] lg:block">
        Every answer is computed from a live monday.com read. Nothing is cached beyond a
        60-second window, and no board data ships with the app.
      </p>
    </aside>
  );
}
