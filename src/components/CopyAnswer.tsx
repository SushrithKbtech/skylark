"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";

export function CopyAnswer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[11.5px] text-[var(--muted)] transition-all duration-200 hover:border-[var(--line-2)] hover:text-[var(--text)]"
      style={{ transitionTimingFunction: "var(--ease)" }}
    >
      {copied ? (
        <CheckIcon size={13} weight="bold" style={{ color: "var(--success)" }} />
      ) : (
        <CopyIcon size={13} weight="bold" />
      )}
      {copied ? "Copied as markdown" : "Copy for a brief"}
    </button>
  );
}
