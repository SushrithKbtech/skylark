"use client";

import { ShieldCheckIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import type { Grounding } from "@/lib/chat-types";

/**
 * Shows whether every figure in the answer could be traced back to a value some
 * tool actually returned. A clean result is the interesting claim here: it means
 * nothing in the answer was invented.
 */
export function GroundingBadge({ grounding }: { grounding: Grounding }) {
  if (!grounding.checked) return null;

  const clean = grounding.unverified.length === 0;
  const tone = clean ? "var(--success)" : "var(--warning)";

  return (
    <div
      className="mt-3 inline-flex max-w-full items-start gap-2 rounded-xl border px-3 py-2"
      style={{
        borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`,
        background: `color-mix(in srgb, ${tone} 6%, transparent)`,
      }}
    >
      {clean ? (
        <ShieldCheckIcon size={14} weight="fill" style={{ color: tone, marginTop: 2 }} />
      ) : (
        <WarningIcon size={14} weight="fill" style={{ color: tone, marginTop: 2 }} />
      )}
      <p className="text-[11.5px] leading-relaxed" style={{ color: tone }}>
        {clean ? (
          <>
            All {grounding.checked} figure{grounding.checked === 1 ? "" : "s"} traced back to a
            monday.com query
          </>
        ) : (
          <>
            {grounding.grounded} of {grounding.checked} figures traced to a query.
            Could not trace: {grounding.unverified.join(", ")}. Verify before using.
          </>
        )}
      </p>
    </div>
  );
}
