"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { Mark } from "./Mark";

export function Nav({ variant = "site" }: { variant?: "site" | "app" }) {
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // IntersectionObserver rather than a scroll listener: no per-frame work.
  useEffect(() => {
    if (variant !== "site") return;
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      threshold: 1,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [variant]);

  const solid = variant === "app" || stuck;

  return (
    <>
      {variant === "site" && <div ref={sentinel} className="absolute top-0 h-px w-full" />}
      <header
        className={`sticky top-0 z-50 transition-colors duration-500 ${
          solid
            ? "border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl"
            : "border-b border-transparent"
        }`}
        style={{ transitionTimingFunction: "var(--ease)" }}
      >
        {/* Full-bleed: brand pinned to the left edge, actions to the right. */}
        <div className="flex h-[64px] w-full items-center gap-3 px-5 sm:px-7">
          <Link href="/" className="flex items-center gap-2">
            <Mark size={30} />
            <span className="flex items-baseline gap-2.5">
              <span className="text-[15.5px] font-semibold tracking-[-0.015em]">Skylark BI</span>
              <span className="hidden text-[12.5px] text-[var(--faint)] sm:inline">
                monday.com intelligence agent
              </span>
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-1">
            {variant === "site" && (
              <>
                <a
                  href="#how"
                  className="hidden rounded-[11px] px-3 py-2 text-[13.5px] text-[var(--muted)] transition-colors duration-200 hover:text-[var(--text)] sm:block"
                >
                  How it works
                </a>
                <a
                  href="#data"
                  className="hidden rounded-[11px] px-3 py-2 text-[13.5px] text-[var(--muted)] transition-colors duration-200 hover:text-[var(--text)] md:block"
                >
                  Data handling
                </a>
                <a
                  href="#trust"
                  className="hidden rounded-[11px] px-3 py-2 text-[13.5px] text-[var(--muted)] transition-colors duration-200 hover:text-[var(--text)] md:block"
                >
                  Reliability
                </a>
              </>
            )}

            <Link
              href={variant === "app" ? "/" : "/console"}
              className={variant === "app" ? "btn-ghost ml-2" : "btn ml-2 !px-5 !py-2.5 !text-[14px]"}
            >
              {variant === "app" ? "Overview" : "Open console"}
              {variant === "site" && <ArrowRightIcon size={15} weight="bold" />}
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}
