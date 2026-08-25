"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, XIcon, CursorClickIcon } from "@phosphor-icons/react/dist/ssr";

/**
 * First-run guided tour.
 *
 * Dims the console, cuts a hole around the element being described, and moves a
 * cursor to it, so a reviewer who has never seen this tool knows what to look
 * at and what to type. Targets are located by `data-tour` attributes rather
 * than by DOM shape, so re-laying-out the console cannot silently break it.
 */

type Step = {
  target: string;
  title: string;
  body: string;
  /** Where the card sits relative to the hole. */
  place: "right" | "left" | "top" | "bottom";
};

export const CONSOLE_STEPS: Step[] = [
  {
    target: "boards",
    title: "Both boards, read live",
    body: "Row counts, field counts and completeness come from monday.com at page load. Nothing here ships with the app, and the agent reads the same boards every time you ask a question.",
    place: "right",
  },
  {
    target: "suggestions",
    title: "Start with a real question",
    body: "These are founder-level questions, not canned demos. Each one runs the full pipeline against your live data. Pick one, or type your own below.",
    place: "top",
  },
  {
    target: "composer",
    title: "Or ask in plain language",
    body: 'Try "how is our pipeline looking for the mining sector this quarter?" or "do our billing numbers actually add up?". There is no query syntax to learn.',
    place: "top",
  },
];

const CONSOLE_AFTER = {
  title: "What comes back",
  body: "Every answer shows the monday.com queries that produced it, a confidence rating computed from how complete the fields it used actually were, a check that every figure traces back to a query, and a copy button that gives you the brief as markdown.",
};

export const LANDING_STEPS: Step[] = [
  {
    target: "hero-cta",
    title: "The console is where you ask",
    body: "Everything on this page describes what happens behind one text box. This button opens it.",
    place: "bottom",
  },
  {
    target: "how",
    title: "Four steps behind every number",
    body: "The agent reads the live board schema, normalises the messy fields, computes the figure on the server, then explains it. It never adds up rows itself.",
    place: "top",
  },
  {
    target: "trust",
    title: "Why the number can be trusted",
    body: "Each answer carries a confidence rating, a full query trail, and a check that every figure traces back to real board data.",
    place: "top",
  },
];

const LANDING_AFTER = {
  title: "Ready when you are",
  body: "Open the console and ask something a founder would ask. The first answer takes a few seconds because it reads both boards live.",
};

type Box = { top: number; left: number; width: number; height: number };

export function Tour({
  steps = CONSOLE_STEPS,
  after,
  storageKey = "skylark-tour-seen",
  autoOpen = true,
  label = "Show me how this works",
}: {
  steps?: Step[];
  after?: { title: string; body: string };
  storageKey?: string;
  autoOpen?: boolean;
  label?: string;
}) {
  const STEPS = steps;
  const AFTER = after ?? (steps === LANDING_STEPS ? LANDING_AFTER : CONSOLE_AFTER);
  const SEEN_KEY = storageKey;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const raf = useRef(0);
  const measureRef = useRef<() => void>(() => {});
  // Intro: the cursor travels from the trigger to the first target and taps it
  // before the page dims, so the overlay arrives as a consequence of the click
  // rather than appearing on top of the reader without warning.
  const [phase, setPhase] = useState<"idle" | "intro">("idle");
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [tapping, setTapping] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  useEffect(() => {
    // A timer rather than requestAnimationFrame: rAF is paused in background
    // tabs, so a link opened in one would never show the tour at all.
    if (!autoOpen) return;
    const id = setTimeout(() => {
      try {
        if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
      } catch {
        // Private browsing blocks storage; showing the tour once is harmless.
        setOpen(true);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [autoOpen, SEEN_KEY]);

  const step: Step | undefined = STEPS[index];
  const finished = index >= STEPS.length;

  const measure = useCallback(() => {
    if (!step) {
      setBox(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      setBox(null);
      return;
    }

    // A target below the fold must be brought into view before its rect means
    // anything, otherwise the spotlight lands off-screen.
    const r0 = el.getBoundingClientRect();
    const offscreen = r0.top < 72 || r0.bottom > window.innerHeight - 72;
    if (offscreen) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Re-measure once the scroll has settled.
      clearTimeout(raf.current);
      raf.current = window.setTimeout(measureRef.current, 420);
      return;
    }

    const r = el.getBoundingClientRect();
    const pad = 8;
    setBox({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    });
  }, [step]);

  useEffect(() => {
    measureRef.current = measure;
  }, [measure]);

  useEffect(() => {
    if (!open) return;
    // Deferred so the target has been laid out first. Timer, not rAF, for the
    // same background-tab reason as above.
    raf.current = window.setTimeout(measure, 0);
    const onChange = () => {
      clearTimeout(raf.current);
      raf.current = window.setTimeout(measure, 0);
    };
    window.addEventListener("resize", onChange);
    return () => {
      clearTimeout(raf.current);
      window.removeEventListener("resize", onChange);
    };
  }, [open, measure]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing to persist to; the tour simply reappears next visit.
    }
  }, [SEEN_KEY]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter" || e.key === "ArrowRight") setIndex((i) => i + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const startTour = () => {
    setIndex(0);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = document.querySelector<HTMLElement>(`[data-tour="${STEPS[0]?.target}"]`);
    const btn = triggerRef.current;

    if (reduce || !target || !btn) {
      setOpen(true);
      return;
    }

    const from = btn.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    setCursor({ x: from.left + from.width / 2, y: from.top + from.height / 2 });
    setPhase("intro");

    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

    // A frame later, so the starting position paints before the transition.
    at(40, () => setCursor({ x: to.left + to.width / 2, y: to.top + to.height / 2 }));
    at(900, () => setTapping(true));
    at(1320, () => {
      setTapping(false);
      setPhase("idle");
      setCursor(null);
      setOpen(true);
    });
  };

  if (!open) {
    if (autoOpen) return null;
    return (
      <>
        <button
          ref={triggerRef}
          onClick={startTour}
          disabled={phase === "intro"}
          className="btn-ghost"
        >
          <CursorClickIcon size={15} weight="bold" />
          {label}
        </button>

        {phase === "intro" && cursor && (
          <div className="pointer-events-none fixed inset-0 z-[100]" aria-hidden>
            <div
              className="absolute"
              style={{
                left: cursor.x,
                top: cursor.y,
                transition: "left 860ms var(--ease), top 860ms var(--ease)",
              }}
            >
              <CursorClickIcon
                size={28}
                weight="fill"
                className="drop-shadow-lg"
                style={{ color: "var(--accent)", transform: "translate(-6px, -4px)" }}
              />
              {tapping && <span className="tap-ripple" />}
            </div>
          </div>
        )}
      </>
    );
  }

  // `box` can still hold the previous step's rect for one frame after the tour
  // advances past the last step, so both must be present before it is used.
  const spot = step && box ? box : null;
  const card = spot
    ? cardPosition(spot, step.place)
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Dim everything, then punch a hole over the target with a huge ring. */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background: spot ? "transparent" : "rgba(9, 11, 20, 0.62)",
          transitionTimingFunction: "var(--ease)",
        }}
        onClick={close}
      />
      {spot && (
        <div
          className="pointer-events-none absolute rounded-2xl transition-all duration-[600ms]"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(9, 11, 20, 0.62)",
            border: "1px solid color-mix(in srgb, var(--accent) 65%, transparent)",
            transitionTimingFunction: "var(--ease)",
          }}
        />
      )}

      {/* Cursor that travels to whatever is being described. */}
      {spot && (
        <CursorClickIcon
          size={26}
          weight="fill"
          className="pointer-events-none absolute transition-all duration-[600ms] drop-shadow-lg"
          style={{
            top: spot.top + spot.height - 6,
            left: spot.left + Math.min(spot.width - 20, spot.width * 0.5),
            color: "var(--accent)",
            transitionTimingFunction: "var(--ease)",
          }}
        />
      )}

      <div
        className="glass glow absolute w-[min(94vw,352px)] p-5 transition-all duration-[600ms]"
        style={{ ...card, transitionTimingFunction: "var(--ease)" }}
      >
        <button
          onClick={close}
          aria-label="Close the tour"
          title="Close the tour"
          className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <XIcon size={13} weight="bold" />
          Close
        </button>

        <p className="mono text-[10.5px] tracking-[0.18em] text-[var(--faint)] uppercase">
          {finished ? "Ready" : `${index + 1} of ${STEPS.length}`}
        </p>
        <h3 className="h3 mt-2 text-[1.02rem]">{finished ? AFTER.title : step!.title}</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--muted)]">
          {finished ? AFTER.body : step!.body}
        </p>

        <div className="mt-5 flex items-center gap-2">
          {finished ? (
            <button onClick={close} className="btn !px-4 !py-2 !text-[13.5px]">
              {steps === LANDING_STEPS ? "Got it" : "Start asking"}
              <ArrowRightIcon size={14} weight="bold" />
            </button>
          ) : (
            <>
              <button
                onClick={() => setIndex((i) => i + 1)}
                className="btn !px-4 !py-2 !text-[13.5px]"
              >
                Next
                <ArrowRightIcon size={14} weight="bold" />
              </button>
              <button
                onClick={close}
                className="rounded-lg px-2.5 py-2 text-[13px] text-[var(--faint)] transition-colors hover:text-[var(--text)]"
              >
                Skip
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Keeps the card beside the hole and inside the viewport. */
function cardPosition(box: Box, place: Step["place"]) {
  const W = 352;
  const H = 210;
  const gap = 16;
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;

  let top = box.top;
  let left = box.left;

  if (place === "right") {
    left = box.left + box.width + gap;
    top = box.top;
  } else if (place === "left") {
    left = box.left - W - gap;
    top = box.top;
  } else if (place === "top") {
    top = box.top - H - gap;
    left = box.left + box.width / 2 - W / 2;
  } else {
    top = box.top + box.height + gap;
    left = box.left + box.width / 2 - W / 2;
  }

  // On a narrow screen the side placements have nowhere to go.
  if (left + W > vw - 12) left = vw - W - 12;
  if (left < 12) left = 12;
  if (top + H > vh - 12) top = vh - H - 12;
  if (top < 12) top = 12;

  return { top, left };
}
