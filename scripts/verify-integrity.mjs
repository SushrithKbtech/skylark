/**
 * Compares the original workbooks against what actually landed in monday.com.
 *
 * Answers one question: did anything get lost between the spreadsheet and the
 * board? Reports row counts, column coverage, and per-column non-empty counts
 * so a dropped or silently-emptied field is visible.
 *
 *   node scripts/verify-integrity.mjs
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const XLSX = createRequire(import.meta.url)("xlsx");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load credentials from .env.local without adding a dependency.
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}

const TOKEN = process.env.MONDAY_API_TOKEN;
const BOARDS = {
  deals: { id: process.env.MONDAY_BOARD_DEALS, file: "Deal funnel Data.xlsx" },
  "work-orders": { id: process.env.MONDAY_BOARD_WORK_ORDERS, file: "Work_Order_Tracker Data.xlsx" },
};

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const BLANK = new Set(["", "-", "n/a", "na", "null", "nil", "none", "tbd", "#n/a", "not available"]);
const isBlank = (v) => v == null || BLANK.has(String(v).trim().toLowerCase());

function readSheet(file) {
  const wb = XLSX.readFile(join(root, "excel", file));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });

  let headerRow = 0;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i] ?? [];
    const filled = row.filter((c) => c !== null && String(c).trim() !== "").length;
    if (filled >= Math.max(3, row.length * 0.5)) {
      headerRow = i;
      break;
    }
  }

  const headers = (aoa[headerRow] ?? []).map((h) => String(h ?? "").trim());
  const rows = aoa
    .slice(headerRow + 1)
    .filter((r) => (r ?? []).some((c) => c !== null && String(c).trim() !== ""));

  return { headers, rows };
}

async function mondayBoard(id) {
  const columns = [];
  const items = [];
  let cursor = null;

  do {
    const query = `
      query ($id: [ID!], $cursor: String) {
        boards(ids: $id) {
          name
          columns { id title type }
          items_page(limit: 500, cursor: $cursor) {
            cursor
            items { id name column_values { id text } }
          }
        }
      }`;
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: TOKEN,
        "API-Version": "2024-10",
      },
      body: JSON.stringify({ query, variables: { id: [id], cursor } }),
    });
    const body = await res.json();
    if (body.errors) throw new Error(body.errors.map((e) => e.message).join("; "));
    const board = body.data.boards[0];
    if (!columns.length) columns.push(...board.columns);
    items.push(...board.items_page.items);
    cursor = board.items_page.cursor;
  } while (cursor);

  return { columns, items };
}

let problems = 0;

for (const [slug, { id, file }] of Object.entries(BOARDS)) {
  console.log(`\n=== ${slug} ===`);
  const sheet = readSheet(file);
  const board = await mondayBoard(id);

  // Row parity
  const rowsMatch = sheet.rows.length === board.items.length;
  console.log(
    `rows      excel ${sheet.rows.length}  |  monday ${board.items.length}  ${rowsMatch ? "OK" : "MISMATCH"}`,
  );
  if (!rowsMatch) problems++;

  // Column parity. monday adds a "name" column that holds the first sheet column.
  const sheetCols = sheet.headers.filter((h) => h !== "");
  const boardTitles = board.columns.map((c) => c.title);
  const boardNorm = new Set(boardTitles.map(norm));

  // monday.com always renames the sheet's first column to "Name" and stores it
  // as the item name, so matching it by title would be a false positive.
  const firstCol = sheetCols[0];
  const missing = sheetCols.filter((h) => h !== firstCol && !boardNorm.has(norm(h)));
  console.log(
    `columns   excel ${sheetCols.length}  |  monday ${board.columns.length}  ${missing.length ? `MISSING ${missing.length}` : "OK"}`,
  );
  if (missing.length) {
    problems++;
    for (const m of missing) console.log(`          missing: "${m}"`);
  }

  // Per-column value parity: how many non-empty cells in each source column vs board column.
  const idxByNorm = new Map(sheetCols.map((h) => [norm(h), sheet.headers.indexOf(h)]));
  const colById = new Map(board.columns.map((c) => [c.id, c]));

  const boardFilled = new Map();
  for (const item of board.items) {
    for (const cv of item.column_values) {
      const col = colById.get(cv.id);
      if (!col) continue;
      if (!isBlank(cv.text)) boardFilled.set(col.title, (boardFilled.get(col.title) ?? 0) + 1);
    }
    // The item name carries the sheet's first column.
    if (!isBlank(item.name)) boardFilled.set("name", (boardFilled.get("name") ?? 0) + 1);
  }

  const drifts = [];
  for (const title of boardTitles) {
    const idx = idxByNorm.get(norm(title));
    if (idx === undefined || idx < 0) continue;
    const excelFilled = sheet.rows.filter((r) => !isBlank(r[idx])).length;
    const mondayFilledCount = boardFilled.get(title) ?? 0;
    const delta = mondayFilledCount - excelFilled;
    // Small deltas are expected: monday drops values its column type rejects.
    if (Math.abs(delta) > Math.max(2, excelFilled * 0.02)) {
      drifts.push({ title, excelFilled, monday: mondayFilledCount, delta });
    }
  }

  if (drifts.length) {
    problems++;
    console.log(`values    ${drifts.length} column(s) lost data in import:`);
    for (const d of drifts.sort((a, b) => a.delta - b.delta)) {
      console.log(
        `          ${d.title}: excel ${d.excelFilled} filled -> monday ${d.monday} (${d.delta > 0 ? "+" : ""}${d.delta})`,
      );
    }
  } else {
    console.log(`values    all mapped columns within tolerance  OK`);
  }
}

console.log(problems ? `\n${problems} issue(s) found.` : `\nNo integrity issues found.`);
