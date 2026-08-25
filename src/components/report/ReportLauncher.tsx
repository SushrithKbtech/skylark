"use client";

import { useState } from "react";
import { ChartBarIcon } from "@phosphor-icons/react/dist/ssr";
import { ReportPanel } from "./ReportPanel";

/** Opens the board report. Kept separate so the console stays a server component. */
export function ReportLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        data-tour="report"
        onClick={() => setOpen(true)}
        className="btn-ghost !px-3 !py-2 !text-[13px]"
      >
        <ChartBarIcon size={15} weight="bold" />
        Board report
      </button>

      <ReportPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
