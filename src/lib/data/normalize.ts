export type FieldKind = "date" | "number" | "currency" | "category" | "text";

const NULLISH = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "n.a.",
  "null",
  "nil",
  "none",
  "tbd",
  "tbc",
  "unknown",
  "?",
  "#n/a",
  "not available",
  "not applicable",
  "pending",
  "xxx",
]);

export function isBlank(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  return NULLISH.has(String(raw).trim().toLowerCase());
}

/** Collapses whitespace and strips zero-width junk that survives spreadsheet exports. */
export function cleanText(raw: unknown): string | null {
  if (isBlank(raw)) return null;
  const s = String(raw)
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length ? s : null;
}

/**
 * Canonical key for grouping categorical values so "Energy", "energy " and
 * "ENERGY_SECTOR" collapse to one bucket.
 */
export function categoryKey(raw: unknown): string | null {
  const s = cleanText(raw);
  if (!s) return null;
  return s
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/[^a-z0-9 &]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title-cases a canonical key back into something presentable. */
export function prettyCategory(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}

const MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  mm: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
  lakh: 1e5,
  lakhs: 1e5,
  l: 1e5,
};

/** Parses "₹1,20,000", "$45k", "1.2 Cr", "(500)", "12%" into a number. */
export function parseNumber(raw: unknown): number | null {
  if (isBlank(raw)) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  let s = String(raw).trim().toLowerCase();
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/^\(|\)$/g, "");

  s = s.replace(/[₹$€£¥,\s]/g, "").replace(/(inr|usd|eur|gbp|rs\.?)/g, "");

  const isPercent = s.endsWith("%");
  if (isPercent) s = s.slice(0, -1);

  // Quantities arrive with units baked in ("5360 HA", "12 nos", "40kms").
  s = s.replace(
    /(hectares?|hectare|ha|acres?|sqkm|sq|kms?|km|units?|nos?|pcs|hrs?|hours?|days?|mw|kw|kwp|points?|images?)$/,
    "",
  );

  const match = s.match(/^-?(\d+(?:\.\d+)?)([a-z]*)$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  const suffix = match[2];
  const multiplier = suffix ? MULTIPLIERS[suffix] : 1;
  if (suffix && multiplier === undefined) return null;

  const result = value * (multiplier ?? 1);
  return negative ? -result : result;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parses the date shapes that show up in exported spreadsheets and returns an
 * ISO date string. Ambiguous D/M vs M/D is resolved day-first, matching the
 * Indian-format source data; see decision log.
 */
export function parseDate(raw: unknown): string | null {
  if (isBlank(raw)) return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }

  const s = String(raw).trim();

  // Excel serial date (days since 1899-12-30)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 60000) {
      const ms = (serial - 25569) * 86400 * 1000;
      return new Date(ms).toISOString().slice(0, 10);
    }
  }

  // ISO or ISO-like: 2024-03-15, 2024/03/15
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);

  // Day-first or month-first numeric: 15/03/2024, 3-15-24
  const numeric = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (numeric) {
    const [, a, b, y] = numeric;
    let year = Number(y);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    let day = Number(a);
    let month = Number(b);
    // Only value >12 disambiguates; otherwise assume day-first.
    if (day <= 12 && month > 12) [day, month] = [month, day];
    return build(year, month, day);
  }

  // Textual: 15 Mar 2024, Mar 15, 2024, 15-March-2024
  const textual = s
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .match(/(\d{1,2})?\s*[-\s,]*([a-z]{3,9})\s*[-\s,]*(\d{1,2})?\s*[-\s,]*(\d{4})/);
  if (textual) {
    const month = MONTHS[textual[2].slice(0, 4)] ?? MONTHS[textual[2].slice(0, 3)];
    if (month) {
      const day = Number(textual[1] ?? textual[3] ?? 1);
      return build(Number(textual[4]), month, day || 1);
    }
  }

  const fallback = new Date(s);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }

  return null;
}

function build(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null;
  return d.toISOString().slice(0, 10);
}

export function quarterOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

/** Indian financial year (Apr–Mar), which is how Skylark-style orgs report. */
export function fiscalQuarterOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const fyStartYear = m >= 4 ? y : y - 1;
  const q = Math.floor(((m - 4 + 12) % 12) / 3) + 1;
  return `FY${String(fyStartYear + 1).slice(2)}-Q${q}`;
}

const DATE_HINT = /(date|day|deadline|due|start|end|closed|created|updated|timeline|eta)/i;
const MONEY_HINT = /(value|amount|revenue|price|cost|budget|deal|worth|fee|billing|invoice|arr|mrr)/i;
const NUMBER_HINT = /(count|qty|quantity|number|hours|days|acres|area|km|score|probability|percent|%|size)/i;

/** Infers how a column should be treated from its title, monday type, and values. */
export function inferKind(
  title: string,
  mondayType: string,
  samples: (string | null)[],
): FieldKind {
  if (mondayType === "date" || mondayType === "timeline") return "date";
  if (mondayType === "numbers") return MONEY_HINT.test(title) ? "currency" : "number";
  if (mondayType === "status" || mondayType === "dropdown" || mondayType === "color") {
    return "category";
  }

  const values = samples.filter((s): s is string => !!s);
  if (!values.length) return "text";

  const dateHit = values.filter((v) => parseDate(v) !== null).length / values.length;
  const numHit = values.filter((v) => parseNumber(v) !== null).length / values.length;

  if (DATE_HINT.test(title) && dateHit > 0.5) return "date";
  if (dateHit > 0.8 && numHit < 0.8) return "date";
  if (MONEY_HINT.test(title) && numHit > 0.5) return "currency";
  if (numHit > 0.8) return NUMBER_HINT.test(title) || MONEY_HINT.test(title)
    ? (MONEY_HINT.test(title) ? "currency" : "number")
    : "number";

  const distinct = new Set(values.map(categoryKey)).size;
  if (distinct <= Math.max(12, values.length * 0.2)) return "category";

  return "text";
}
