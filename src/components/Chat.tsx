"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Answer } from "./Answer";
import { ToolTrail } from "./ToolTrail";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { GroundingBadge } from "./GroundingBadge";
import { CopyAnswer } from "./CopyAnswer";
import { DownloadBrief } from "./DownloadBrief";
import { FollowUps } from "./FollowUps";
import { ExportSession } from "./ExportSession";
import { weakestConfidence, type Turn } from "@/lib/chat-types";

const SUGGESTIONS = [
  {
    label: "Pipeline by sector",
    text: "How is our pipeline looking for the mining sector this quarter, and how does it compare with the other sectors?",
  },
  {
    label: "Cash gap",
    text: "What is the gap between what we have billed and what we have actually collected? Where is the money stuck?",
  },
  {
    label: "Stalled deals",
    text: "Which deal stages are stalling, and how much value is sitting in each one?",
  },
  {
    label: "Leadership brief",
    text: "Put together a leadership update covering pipeline, execution and cash, with the data caveats I should flag.",
  },
];

const uid = () => Math.random().toString(36).slice(2, 10);

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [turns.length, scrollToEnd]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 176)}px`;
  }, [input]);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;

      const userTurn: Turn = { id: uid(), role: "user", text: question, steps: [] };
      const replyId = uid();
      const replyTurn: Turn = {
        id: replyId,
        role: "assistant",
        text: "",
        steps: [],
        streaming: true,
      };

      const history = [...turns, userTurn]
        .filter((t) => t.text.trim().length > 0)
        .map((t) => ({ role: t.role, content: t.text }));

      setTurns((prev) => [...prev, userTurn, replyTurn]);
      setInput("");
      setBusy(true);

      const patch = (fn: (turn: Turn) => Turn) =>
        setTurns((prev) => prev.map((t) => (t.id === replyId ? fn(t) : t)));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? `Request failed (${res.status}).`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;

            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            switch (event.type) {
              case "text":
                patch((t) => ({ ...t, text: t.text + String(event.delta) }));
                break;
              case "tool_start":
                patch((t) => ({
                  ...t,
                  steps: [
                    ...t.steps,
                    {
                      id: String(event.id),
                      name: String(event.name),
                      input: event.input,
                      status: "running",
                    },
                  ],
                }));
                break;
              case "grounding":
                patch((t) => ({
                  ...t,
                  grounding: {
                    checked: event.checked as number,
                    grounded: event.grounded as number,
                    unverified: event.unverified as string[],
                  },
                }));
                break;

              case "tool_end":
                patch((t) => ({
                  ...t,
                  steps: t.steps.map((s) =>
                    s.id === event.id
                      ? {
                          ...s,
                          status: event.ok ? "ok" : "failed",
                          summary: String(event.summary),
                          confidence: event.confidence as Turn["steps"][number]["confidence"],
                        }
                      : s,
                  ),
                }));
                break;
              case "error":
                patch((t) => ({
                  ...t,
                  error: {
                    message: String(event.message),
                    hint: event.hint ? String(event.hint) : undefined,
                  },
                }));
                break;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          patch((t) => ({
            ...t,
            error: { message: err instanceof Error ? err.message : "Request failed." },
          }));
        }
      } finally {
        patch((t) => ({ ...t, streaming: false }));
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, turns],
  );

  const stop = () => abortRef.current?.abort();

  const empty = turns.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-1 pb-10">
          {empty ? (
            <div className="animate-fade-up pt-8 sm:pt-12">
              <span className="kicker">Console</span>
              <h1 className="h2 mt-4 max-w-[18ch]">
                Ask anything about pipeline or project execution.
              </h1>
              <p className="mt-4 max-w-[54ch] text-[14.5px] leading-relaxed text-[var(--muted)]">
                Questions are answered by querying the monday.com boards live — reading the
                schema, normalising the messy fields, then computing the numbers. Caveats come
                with the answer.
              </p>

              <p className="kicker mt-10">Try one of these</p>
              <div data-tour="suggestions" className="mt-4 grid gap-3 sm:grid-cols-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.label}
                    onClick={() => send(s.text)}
                    style={{ animationDelay: `${120 + i * 70}ms` }}
                    className="glass glass-lift animate-fade-up p-4 text-left"
                  >
                    <span
                      className="text-[12.5px] font-semibold"
                      style={{ color: "var(--accent)" }}
                    >
                      {s.label}
                    </span>
                    <span className="mt-1.5 block text-[13px] leading-snug text-[var(--muted)]">
                      {s.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8 pt-6">
              {turns.map((turn) =>
                turn.role === "user" ? (
                  <div key={turn.id} className="animate-fade-up flex justify-end">
                    <p
                      className="max-w-[85%] rounded-2xl rounded-br-md border border-[var(--line)] px-4 py-2.5 text-[14.5px] leading-relaxed"
                      style={{ background: "var(--accent-soft)" }}
                    >
                      {turn.text}
                    </p>
                  </div>
                ) : (
                  <div key={turn.id} className="animate-fade-in">
                    <ToolTrail steps={turn.steps} />

                    {turn.text && <Answer text={turn.text} />}

                    {!turn.streaming && turn.text && (
                      <>
                        {(() => {
                          const confidence = weakestConfidence(turn.steps);
                          return confidence ? <ConfidenceBadge confidence={confidence} /> : null;
                        })()}
                        {turn.grounding && <GroundingBadge grounding={turn.grounding} />}
                        <FollowUps
                          question={
                            turns[turns.findIndex((x) => x.id === turn.id) - 1]?.text ?? ""
                          }
                          answer={turn.text}
                          onPick={send}
                          disabled={busy}
                        />

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <CopyAnswer text={turn.text} />
                          <DownloadBrief
                            question={
                              turns[turns.findIndex((x) => x.id === turn.id) - 1]?.text ??
                              "Skylark BI brief"
                            }
                            answer={turn.text}
                            steps={turn.steps}
                            confidence={weakestConfidence(turn.steps)}
                            grounding={turn.grounding}
                          />
                          <ExportSession turns={turns} />
                        </div>
                      </>
                    )}

                    {turn.streaming && !turn.text && !turn.steps.length && (
                      <p className="shimmer text-[14px]">Working through the boards…</p>
                    )}

                    {turn.streaming && turn.text && (
                      <span
                        className="animate-dot ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px]"
                        style={{ background: "var(--accent)" }}
                      />
                    )}

                    {turn.error && (
                      <div
                        className="animate-fade-in mt-3 rounded-2xl border p-4"
                        style={{
                          borderColor: "color-mix(in srgb, var(--danger) 28%, transparent)",
                          background: "color-mix(in srgb, var(--danger) 5%, transparent)",
                        }}
                      >
                        <p
                          className="text-[13px] font-semibold"
                          style={{ color: "var(--danger)" }}
                        >
                          {turn.error.message}
                        </p>
                        {turn.error.hint && (
                          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                            {turn.error.hint}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 pt-3">
        <div className="mx-auto w-full max-w-[720px]">
          <div
            data-tour="composer"
            className="glass p-1.5 transition-all duration-300 focus-within:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
            style={{ transitionTimingFunction: "var(--ease)" }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Ask about revenue, pipeline health, sector performance…"
                className="max-h-44 min-h-[38px] flex-1 resize-none bg-transparent px-3 py-2 text-[14.5px] leading-relaxed outline-none placeholder:text-[var(--faint)]"
              />

              {busy ? (
                <button onClick={stop} className="btn-ghost mb-0.5 shrink-0 !py-2 !text-[13px]">
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim()}
                  aria-label="Send"
                  className="mb-0.5 shrink-0 rounded-xl p-2.5 text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-35"
                  style={{
                    background: input.trim() ? "var(--btn-face)" : "var(--line-2)",
                    boxShadow: input.trim() ? "var(--btn-shadow)" : "none",
                    transitionTimingFunction: "var(--ease)",
                  }}
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                    <path
                      d="M8 13V3.5M8 3.5 3.75 7.75M8 3.5l4.25 4.25"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <p className="px-1 pt-2.5 pb-3 text-[11px] text-[var(--faint)]">
            Figures are computed from live monday.com reads. Check anything that will leave the
            building.
          </p>
        </div>
      </div>
    </div>
  );
}
