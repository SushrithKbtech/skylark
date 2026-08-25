"use client";

/**
 * Follow-up questions offered after an answer.
 *
 * Derived on the client from what the question and answer were actually about,
 * rather than asked of the model. A second model round trip to invent three
 * questions would double the cost of every answer for something a small amount
 * of topic matching does just as well, and these are guaranteed to be questions
 * the tools can genuinely answer.
 */

type Rule = {
  when: RegExp;
  asks: string[];
};

const RULES: Rule[] = [
  {
    when: /\b(sector|mining|powerline|renewable|railway|construction|tender)\b/i,
    asks: [
      "Which deal stages are stalling in that sector?",
      "How does that sector's execution compare with its pipeline?",
    ],
  },
  {
    when: /\b(billed|collect|receivable|cash|revenue|invoice)\b/i,
    asks: [
      "Which work orders are the largest uncollected balances?",
      "Do our billing and collection numbers actually add up?",
    ],
  },
  {
    when: /\b(pipeline|deal|open|stage|funnel|probability)\b/i,
    asks: [
      "What is the weighted pipeline, and what weights did you use?",
      "Which deals have no close date, and how much value is that?",
    ],
  },
  {
    when: /\b(work order|execution|ongoing|completed|delivery)\b/i,
    asks: [
      "Where is the gap between deals won and work executed?",
      "Which work orders are stuck and what are they worth?",
    ],
  },
  {
    when: /\b(missing|incomplete|trust|quality|confidence|caveat)\b/i,
    asks: [
      "Which fields would most change the numbers if they were filled in?",
      "Do any rows contradict each other?",
    ],
  },
];

const FALLBACK = [
  "Which sector is performing best for us?",
  "Prepare a leadership update for this week's board meeting.",
];

export function FollowUps({
  question,
  answer,
  onPick,
  disabled,
}: {
  question: string;
  answer: string;
  onPick: (q: string) => void;
  disabled?: boolean;
}) {
  const haystack = `${question} ${answer}`;

  const picked: string[] = [];
  for (const rule of RULES) {
    if (!rule.when.test(haystack)) continue;
    for (const ask of rule.asks) {
      // Never suggest something the user effectively just asked.
      if (picked.length < 3 && !haystack.toLowerCase().includes(ask.slice(0, 22).toLowerCase())) {
        picked.push(ask);
      }
    }
  }

  const suggestions = (picked.length ? picked : FALLBACK).slice(0, 3);
  if (!suggestions.length) return null;

  return (
    <div className="mt-4">
      <p className="text-[11px] tracking-[0.14em] text-[var(--faint)] uppercase">Ask next</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            disabled={disabled}
            className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-left text-[12.5px] text-[var(--muted)] transition-all duration-200 hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--text)] disabled:opacity-40"
            style={{ transitionTimingFunction: "var(--ease)" }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
