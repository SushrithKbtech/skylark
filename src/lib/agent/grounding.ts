/**
 * Numeric grounding check.
 *
 * "Never fabricate a number" is an instruction, and instructions are not
 * enforcement. This verifies it after the fact: every figure the answer states
 * is matched back against the values the tools actually returned, and anything
 * that cannot be traced is reported rather than quietly trusted.
 *
 * The check is deliberately generous. It is looking for figures with no
 * plausible origin in the data, not for rounding differences, so a number that
 * matches a tool value at any reasonable precision counts as grounded.
 */

export type Grounding = {
  checked: number;
  grounded: number;
  unverified: string[];
};

const CR = 1e7;
const LAKH = 1e5;

/** Every number appearing anywhere in a tool result, at any nesting depth. */
export function collectToolNumbers(value: unknown, out: Set<number> = new Set()): Set<number> {
  if (typeof value === "number" && Number.isFinite(value)) {
    out.add(value);
    return out;
  }
  if (typeof value === "string") {
    // Tool results carry pre-formatted strings too ("66%", "₹1.2 Cr").
    for (const n of extractNumbers(value)) out.add(n);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectToolNumbers(v, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectToolNumbers(v, out);
  }
  return out;
}

/**
 * A figure as written, with the slack its own notation implies. "0.7 Cr" is not
 * a claim that the value is exactly 7,000,000 — it is a claim that the value
 * rounds to 0.7 Cr, which is anything within half a step of the last digit
 * shown. Comparing at a flat percentage instead flags ordinary rounding as
 * fabrication, which is the failure mode that makes a check like this useless.
 */
export type Claim = { value: number; tolerance: number };

const UNIT_SCALE = (unit: string): number => {
  if (unit.startsWith("cr")) return CR;
  if (unit.startsWith("lakh") || unit === "l") return LAKH;
  if (unit === "k") return 1e3;
  return 1;
};

/** Optional currency mark, grouped digits, optional decimals, optional magnitude. */
const NUMBER_RE = /(-?\d[\d,]*(?:\.\d+)?)\s*(cr(?:ore)?s?|lakhs?|l\b|k\b|%)?/gi;

export function extractClaims(text: string): Claim[] {
  const out: Claim[] = [];

  for (const m of text.matchAll(NUMBER_RE)) {
    const digits = m[1].replace(/,/g, "");
    const raw = Number(digits);
    if (!Number.isFinite(raw)) continue;

    const scale = UNIT_SCALE((m[2] ?? "").toLowerCase());
    const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
    // Half a step of the least significant digit shown, in real units.
    const halfStep = (Math.pow(10, -decimals) / 2) * scale;

    out.push({
      value: raw * scale,
      // Never tighter than a hair, to absorb float noise on exact matches.
      tolerance: Math.max(halfStep, Math.abs(raw * scale) * 1e-9),
    });
  }
  return out;
}

/** Plain values, for harvesting whatever the tools returned. */
export function extractNumbers(text: string): number[] {
  return extractClaims(text).map((c) => c.value);
}

/** Numbers this large in prose are usually years or ids, not claims about data. */
const isCalendarish = (n: number) => Number.isInteger(n) && n >= 1900 && n <= 2100;

/** Within the slack the claim's own notation allows. */
const matches = (claim: Claim, known: number) =>
  Math.abs(claim.value - known) <= claim.tolerance;

/**
 * Some figures are legitimately derived rather than returned: a share as a
 * percentage of a total, or a gap such as billed minus collected. Those are
 * arithmetic on real values, not invention, so they count as grounded when they
 * match a combination of two figures the tools produced.
 */
function isDerived(claim: Claim, known: number[]): boolean {
  const cap = Math.min(known.length, 120);
  const slack = Math.max(claim.tolerance, Math.abs(claim.value) * 1e-6);

  for (let i = 0; i < cap; i++) {
    const a = known[i];
    for (let j = 0; j < cap; j++) {
      if (i === j) continue;
      const b = known[j];

      // Difference: the gap between two figures, in either direction.
      if (Math.abs(claim.value - (a - b)) <= slack) return true;
      // Sum: two figures reported as a combined total.
      if (Math.abs(claim.value - (a + b)) <= slack) return true;

      // Share of a total, expressed as a percentage.
      if (b && claim.value >= 0 && claim.value <= 100) {
        const pct = (a / b) * 100;
        if (Number.isFinite(pct) && Math.abs(claim.value - pct) <= Math.max(claim.tolerance, 0.5)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function verifyGrounding(answer: string, toolNumbers: Set<number>): Grounding {
  const known = [...toolNumbers];
  // Small integers are structural ("3 sectors", "top 5") and match almost any
  // count a tool returned; checking them produces noise, not signal.
  const claims = extractClaims(answer).filter(
    (c) => Math.abs(c.value) >= 10 && !isCalendarish(c.value),
  );

  const unverified: string[] = [];
  let grounded = 0;

  for (const claim of claims) {
    const direct = known.some((k) => matches(claim, k));
    // A tool may have returned the figure in lakhs where the answer states rupees.
    const scaled =
      !direct && known.some((k) => matches(claim, k * LAKH) || matches(claim, k * CR));

    if (direct || scaled || isDerived(claim, known)) {
      grounded++;
    } else {
      unverified.push(formatClaim(claim.value));
    }
  }

  return {
    checked: claims.length,
    grounded,
    // Repeats of the same unsourced figure are one problem, not several.
    unverified: [...new Set(unverified)].slice(0, 6),
  };
}

function formatClaim(n: number): string {
  const abs = Math.abs(n);
  if (abs >= CR) return `₹${(n / CR).toFixed(2)} Cr`;
  if (abs >= LAKH) return `₹${(n / LAKH).toFixed(2)} L`;
  return n.toLocaleString("en-IN");
}
