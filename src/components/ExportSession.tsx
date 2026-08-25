"use client";

import { useState } from "react";
import { FileArrowDownIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { weakestConfidence, type Turn } from "@/lib/chat-types";

/**
 * Exports the whole conversation as one document.
 *
 * A single answer is useful to paste into a message; a session is what you take
 * into a meeting, because the questions asked are part of the story. Each
 * answer keeps the queries behind it, its confidence and its verification, so
 * the figures can be defended by whoever presents them.
 */
export function ExportSession({ turns }: { turns: Turn[] }) {
  const [done, setDone] = useState(false);

  const answered = turns.filter((t) => t.role === "assistant" && t.text.trim());
  if (answered.length < 2) return null;

  const build = () => {
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const out: string[] = [
      "# Skylark BI session",
      "",
      `${answered.length} questions answered from live monday.com boards. Prepared ${stamp} UTC.`,
      "",
      "---",
      "",
    ];

    turns.forEach((turn, i) => {
      if (turn.role !== "assistant" || !turn.text.trim()) return;

      const question = turns[i - 1]?.role === "user" ? turns[i - 1].text : "Question";
      out.push(`## ${question}`, "", turn.text.trim(), "");

      if (turn.steps.length) {
        out.push("**Queries run**", "");
        for (const s of turn.steps) out.push(`- \`${s.name}\` — ${s.summary ?? "no summary"}`);
        out.push("");
      }

      const confidence = weakestConfidence(turn.steps);
      if (confidence) {
        out.push(`**Confidence** ${confidence.level} (${confidence.score}/100)`, "");
        for (const b of confidence.basis) out.push(`- ${b}`);
        out.push("");
      }

      if (turn.grounding) {
        out.push(
          turn.grounding.unverified.length
            ? `**Verification** ${turn.grounding.grounded} of ${turn.grounding.checked} figures traced to a query. Not traced: ${turn.grounding.unverified.join(", ")}.`
            : `**Verification** all ${turn.grounding.checked} figures traced back to a monday.com query.`,
          "",
        );
      }

      out.push("---", "");
    });

    out.push(
      "Every figure above is computed from a live read of the monday.com deals and",
      "work orders boards. No board data is stored in the application.",
      "",
    );
    return out.join("\n");
  };

  const download = () => {
    const blob = new Blob([build()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skylark-session-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);

    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };

  return (
    <button
      onClick={download}
      className="btn-ghost !px-3 !py-2 !text-[12.5px]"
      title="Every question and answer in this session, with the queries behind each figure"
    >
      {done ? (
        <CheckIcon size={14} weight="bold" style={{ color: "var(--success)" }} />
      ) : (
        <FileArrowDownIcon size={14} weight="bold" />
      )}
      {done ? "Session saved" : `Export session (${answered.length})`}
    </button>
  );
}
