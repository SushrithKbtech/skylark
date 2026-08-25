"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { ReportLauncher } from "@/components/report/ReportLauncher";
import { Tour, CONSOLE_STEPS } from "@/components/Tour";

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
          {/* Wordmark only: a mark plus a name plus a tagline crowds the left
              edge, and the name is doing the work. */}
          <Link href="/" className="flex items-baseline gap-2.5">
            <span className="serif text-[21px] leading-none font-medium tracking-[-0.02em]">
              Skylark <span className="grad">BI</span>
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

            {variant === "app" && (
              <>
                <Tour
                  steps={CONSOLE_STEPS}
                  storageKey="skylark-tour-manual"
                  autoOpen={false}
                  label="Guide me"
                />
                <ReportLauncher />
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
