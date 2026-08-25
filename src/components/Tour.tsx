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

const STEPS: Step[] = [
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

const AFTER = {
  title: "What comes back",
  body: "Every answer shows the monday.com queries that produced it, a confidence rating computed from how complete the fields it used actually were, and a copy button that gives you the brief as markdown.",
};

const SEEN_KEY = "skylark-tour-seen";

type Box = { top: number; left: number; width: number; height: number };

export function Tour() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    // A timer rather than requestAnimationFrame: rAF is paused in background
    // tabs, so a link opened in one would never show the tour at all.
    const id = setTimeout(() => {
      try {
        if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
      } catch {
        // Private browsing blocks storage; showing the tour once is harmless.
        setOpen(true);
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

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
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter" || e.key === "ArrowRight") setIndex((i) => i + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

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
          aria-label="Skip the tour"
          className="absolute top-3 right-3 rounded-lg p-1 text-[var(--faint)] transition-colors hover:text-[var(--text)]"
        >
          <XIcon size={15} weight="bold" />
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
              Start asking
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
