"use client";

import { useState } from "react";
import { SealCheckIcon, CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import type { Confidence } from "@/lib/chat-types";

const TONE: Record<Confidence["level"], string> = {
  high: "var(--success)",
  medium: "var(--warning)",
  low: "var(--danger)",
};

const LABEL: Record<Confidence["level"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const [open, setOpen] = useState(false);
  const tone = TONE[confidence.level];

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all duration-200"
        style={{
          borderColor: `color-mix(in srgb, ${tone} 32%, transparent)`,
          background: `color-mix(in srgb, ${tone} 7%, transparent)`,
          transitionTimingFunction: "var(--ease)",
        }}
        aria-expanded={open}
      >
        <SealCheckIcon size={14} weight="fill" style={{ color: tone }} />
        <span className="text-[11.5px] font-semibold" style={{ color: tone }}>
          {LABEL[confidence.level]}
        </span>
        <span className="mono tabular text-[10.5px] text-[var(--faint)]">
          {confidence.score}/100
        </span>
        <CaretDownIcon
          size={11}
          weight="bold"
          className={`text-[var(--faint)] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          style={{ transitionTimingFunction: "var(--ease)" }}
        />
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transitionTimingFunction: "var(--ease)" }}
      >
        <div className="overflow-hidden">
          <ul className="mt-2.5 flex flex-col gap-1.5 pl-1">
            {confidence.basis.map((line) => (
              <li key={line} className="flex gap-2 text-[12px] leading-relaxed text-[var(--muted)]">
                <span
                  className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
                  style={{ background: tone }}
                />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
