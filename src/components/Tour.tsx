"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, XIcon, CursorClickIcon } from "@phosphor-icons/react/dist/ssr";

/**
 * Guided tour.
 *
 * The highlight is the target element itself, lifted above the dimming layer by
 * a class, rather than a hole drawn at coordinates copied from its rect. An
 * earlier version measured the rect and cut a matching hole, which drifted out
 * of alignment whenever the page scrolled, a sticky element moved, or a step
 * advanced while a scroll was still animating. Nothing here can drift, because
 * there are no coordinates.
 */

type Step = {
  target: string;
  title: string;
  body: string;
};

export const CONSOLE_STEPS: Step[] = [
  {
    target: "boards",
    title: "Both boards, read live",
    body: "Row counts, fields and completeness are read from monday.com when this page loads, and again on every question you ask.",
  },
  {
    target: "suggestions",
    title: "Start with a real question",
    body: "Each of these runs the full pipeline against your live boards. Click one to see it work.",
  },
  {
    target: "report",
    title: "Or take the whole picture",
    body: "The board report builds pipeline, cash and execution charts from a live read, flags rows whose numbers contradict each other, and saves as a PDF.",
  },
  {
    target: "composer",
    title: "Or ask in your own words",
    body: 'Try "do our billing numbers actually add up?". There is no query syntax to learn.',
  },
];

const CONSOLE_AFTER = {
  title: "Every answer shows its working",
  body: "You get the monday.com queries behind the figures, a confidence rating from how complete those fields were, and a check that every number traces back to real data.",
};

const HIGHLIGHT = "tour-highlight";

export function Tour({
  steps = CONSOLE_STEPS,
  after,
  storageKey = "skylark-tour-seen",
  autoOpen = true,
  label = "Guide me",
}: {
  steps?: Step[];
  after?: { title: string; body: string };
  storageKey?: string;
  autoOpen?: boolean;
  label?: string;
}) {
  const AFTER = after ?? CONSOLE_AFTER;

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [intro, setIntro] = useState<{ x: number; y: number } | null>(null);
  const [tapping, setTapping] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  const highlighted = useRef<HTMLElement | null>(null);

  const step: Step | undefined = steps[index];
  const finished = index >= steps.length;

  const dropHighlight = useCallback(() => {
    highlighted.current?.classList.remove(HIGHLIGHT);
    highlighted.current = null;
  }, []);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
      highlighted.current?.classList.remove(HIGHLIGHT);
    },
    [],
  );

  // Opens on a first visit, or whenever ?tour=1 carries the tour across a page.
  useEffect(() => {
    if (!autoOpen) return;
    const forced =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tour");

    const id = window.setTimeout(() => {
      try {
        if (forced || !localStorage.getItem(storageKey)) setOpen(true);
      } catch {
        setOpen(true);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [autoOpen, storageKey]);

  // Move the highlight onto the current step's element.
  useEffect(() => {
    dropHighlight();
    if (!open || !step) return;

    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return;

    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 80) {
      // Explicitly instant: the stylesheet sets scroll-behavior: smooth.
      el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "center" });
    }

    el.classList.add(HIGHLIGHT);
    highlighted.current = el;
  }, [open, step, dropHighlight]);

  const close = useCallback(() => {
    dropHighlight();
    setOpen(false);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Storage unavailable; the tour simply offers itself again next visit.
    }
  }, [storageKey, dropHighlight]);

  const advance = useCallback(() => setIndex((i) => i + 1), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter" || e.key === "ArrowRight") advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, advance]);

  const startTour = () => {
    setIndex(0);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = document.querySelector<HTMLElement>(`[data-tour="${steps[0]?.target}"]`);
    const btn = triggerRef.current;
    if (reduce || !target || !btn) {
      setOpen(true);
      return;
    }

    const from = btn.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    setIntro({
      x: Math.min(from.left + from.width / 2 + 170, window.innerWidth - 40),
      y: Math.min(from.top + from.height / 2 + 140, window.innerHeight - 40),
    });

    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(60, () => setIntro({ x: to.left + to.width / 2, y: to.top + to.height / 2 }));
    at(820, () => setTapping(true));
    at(1240, () => {
      setTapping(false);
      setIntro(null);
      setOpen(true);
    });
  };

  if (!open) {
    if (autoOpen) return null;
    return (
      <>
        <button ref={triggerRef} onClick={startTour} disabled={!!intro} className="btn-ghost">
          <CursorClickIcon size={15} weight="bold" />
          {label}
        </button>

        {intro && (
          <div className="pointer-events-none fixed inset-0 z-[100]" aria-hidden>
            <div
              className="absolute"
              style={{
                left: intro.x,
                top: intro.y,
                transition: "left 760ms var(--ease), top 760ms var(--ease)",
              }}
            >
              <CursorClickIcon
                size={32}
                weight="fill"
                className="drop-shadow-lg"
                style={{ color: "var(--accent)", transform: "translate(-7px, -5px)" }}
              />
              {tapping && <span className="tap-ripple" />}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div
        onClick={close}
        className="absolute inset-0"
        style={{ background: "rgba(9, 11, 20, 0.66)" }}
      />

      {/* Pinned to the bottom of the viewport. A card that chased the target is
          what kept landing on top of the thing it was describing. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-5">
        <div className="glass glow pointer-events-auto relative w-[min(94vw,420px)] p-5">
          <button
            onClick={close}
            aria-label="Close the tour"
            className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <XIcon size={13} weight="bold" />
            Close
          </button>

          <p className="mono text-[10.5px] tracking-[0.18em] text-[var(--faint)] uppercase">
            {finished ? "Done" : `${index + 1} of ${steps.length}`}
          </p>
          <h3 className="h3 mt-2 pr-16 text-[1.02rem]">
            {finished ? AFTER.title : step!.title}
          </h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted)]">
            {finished ? AFTER.body : step!.body}
          </p>

          {true && (
            <div className="mt-5 flex items-center gap-2">
              <button onClick={advance} className="btn !px-4 !py-2 !text-[13.5px]">
                {finished ? "Start asking" : "Next"}
                <ArrowRightIcon size={14} weight="bold" />
              </button>
              {!finished && (
                <button
                  onClick={close}
                  className="rounded-lg px-2.5 py-2 text-[13px] text-[var(--faint)] transition-colors hover:text-[var(--text)]"
                >
                  Skip
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/**
 * Landing-page hand-off.
 *
 * No tutorial here: the page already explains itself. The cursor simply travels
 * to the console button, taps it, and the console tour takes over on arrival.
 */
export function GuideToConsole({ label = "Guide me" }: { label?: string }) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [tapping, setTapping] = useState(false);
  const [pressed, setPressed] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const run = () => {
    const target = document.querySelector<HTMLElement>('[data-tour="hero-cta"]');
    const btn = btnRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || !target || !btn) {
      window.location.assign("/console?tour=1");
      return;
    }

    const r = target.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 80) {
      target.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "center" });
    }
    const to = target.getBoundingClientRect();
    const from = btn.getBoundingClientRect();

    setCursor({
      x: Math.min(from.left + from.width / 2 + 190, window.innerWidth - 40),
      y: Math.min(from.top + from.height / 2 + 150, window.innerHeight - 40),
    });

    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    at(60, () => setCursor({ x: to.left + to.width * 0.5, y: to.top + to.height * 0.62 }));
    at(900, () => {
      setTapping(true);
      setPressed(true);
    });
    at(1080, () => setPressed(false));
    at(1360, () => window.location.assign("/console?tour=1"));
  };

  return (
    <>
      <button ref={btnRef} onClick={run} disabled={!!cursor} className="btn-ghost">
        <CursorClickIcon size={15} weight="bold" />
        {label}
      </button>

      {cursor && (
        <div className="pointer-events-none fixed inset-0 z-[100]" aria-hidden>
          <div
            className="absolute"
            style={{
              left: cursor.x,
              top: cursor.y,
              transition: "left 820ms var(--ease), top 820ms var(--ease)",
            }}
          >
            <CursorClickIcon
              size={34}
              weight="fill"
              className="drop-shadow-lg"
              style={{
                color: "var(--accent)",
                transform: `translate(-7px, -5px) scale(${pressed ? 0.82 : 1})`,
                transition: "transform 160ms var(--ease)",
              }}
            />
            {tapping && <span className="tap-ripple" />}
          </div>
        </div>
      )}
    </>
  );
}
