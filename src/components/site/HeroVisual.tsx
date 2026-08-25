"use client";

import Image from "next/image";
import { useState } from "react";
import { StageChart } from "./StageChart";

/**
 * Hero asset: a real screenshot of the console answering a real question.
 *
 * A product shot beats an illustrative chart here, because the chart had to be
 * labelled "sample shape" on a page whose whole claim is that nothing is
 * sample data. If the screenshot is missing the chart still renders, so the
 * page is never broken by a missing asset.
 */
export function HeroVisual() {
  const [failed, setFailed] = useState(false);

  if (failed) return <StageChart />;

  return (
    <figure className="glass glow m-0 overflow-hidden p-2">
      <Image
        src="/console-preview.png"
        alt="The Skylark BI console answering which sector holds the most open pipeline value, showing the monday.com queries it ran and a breakdown by sector."
        width={1600}
        height={900}
        priority
        onError={() => setFailed(true)}
        className="h-auto w-full rounded-xl"
      />
      <figcaption className="px-3 pt-3 pb-1.5 text-[12px] leading-relaxed text-[var(--faint)]">
        A real answer from the live boards, with the queries behind it.
      </figcaption>
    </figure>
  );
}
