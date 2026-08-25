import { configuredBoardIds } from "@/lib/monday/client";
import { loadDataset, type Dataset } from "./dataset";

/**
 * Boards are re-fetched from monday.com per conversation turn, but a short TTL
 * keeps a multi-tool-call turn from re-paginating the same board several times.
 */
const TTL_MS = 60_000;

type Entry = { dataset: Dataset; expires: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Dataset>>();

export async function getDataset(boardId: string, force = false): Promise<Dataset> {
  const hit = cache.get(boardId);
  if (!force && hit && hit.expires > Date.now()) return hit.dataset;

  const pending = inflight.get(boardId);
  if (pending) return pending;

  const task = loadDataset(boardId)
    .then((dataset) => {
      cache.set(boardId, { dataset, expires: Date.now() + TTL_MS });
      return dataset;
    })
    .finally(() => inflight.delete(boardId));

  inflight.set(boardId, task);
  return task;
}

export type BoardRef = "work_orders" | "deals";

export function resolveBoardId(ref: string): string {
  const { workOrders, deals } = configuredBoardIds();
  const normalized = ref.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("deal")) return deals;
  if (normalized.includes("work") || normalized.includes("order")) return workOrders;
  throw new Error(`Unknown board "${ref}". Use "work_orders" or "deals".`);
}

export async function getAllDatasets(): Promise<Dataset[]> {
  const { workOrders, deals } = configuredBoardIds();
  return Promise.all([getDataset(workOrders), getDataset(deals)]);
}
