/**
 * Converts the two supplied workbooks into monday.com-import-ready CSVs.
 * This is a one-off setup step: the agent itself never reads these files,
 * it queries monday.com over the API at request time.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const XLSX = createRequire(import.meta.url)("xlsx");
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "excel", "import-ready");
mkdirSync(outDir, { recursive: true });

/** Finds the first row that looks like a header (mostly non-empty strings). */
function findHeaderRow(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i] ?? [];
    const filled = row.filter((c) => c !== null && String(c).trim() !== "").length;
    if (filled >= Math.max(3, row.length * 0.5)) return i;
  }
  return 0;
}

function toCsv(rows, headers) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.map(esc).join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\r\n");
}

function convert(file, outName) {
  const wb = XLSX.readFile(join(root, "excel", file));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

  const headerRow = findHeaderRow(aoa);
  const rawHeaders = aoa[headerRow].map((h, i) =>
    h === null || String(h).trim() === "" ? `Column ${i + 1}` : String(h).trim(),
  );

  // De-duplicate header labels — monday.com rejects repeated column names.
  const seen = new Map();
  const headers = rawHeaders.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });

  const rows = [];
  for (let i = headerRow + 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    if (row.every((c) => c === null || String(c).trim() === "")) continue;
    const obj = {};
    headers.forEach((h, c) => {
      const v = row[c];
      obj[h] = v === null || v === undefined ? "" : String(v).trim();
    });
    rows.push(obj);
  }

  const outPath = join(outDir, outName);
  writeFileSync(outPath, "﻿" + toCsv(rows, headers), "utf8");
  console.log(`${outName}: ${rows.length} rows, ${headers.length} columns`);
  console.log(`  header found on sheet row ${headerRow + 1}`);
  console.log(`  -> ${outPath}\n`);
}

convert("Deal funnel Data.xlsx", "deals.csv");
convert("Work_Order_Tracker Data.xlsx", "work-orders.csv");
