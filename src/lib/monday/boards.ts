import { mondayQuery, configuredBoardIds } from "./client";

export type MondayColumn = {
  id: string;
  title: string;
  type: string;
  settings_str?: string;
};

export type MondayItem = {
  id: string;
  name: string;
  column_values: {
    id: string;
    text: string | null;
    type: string;
    value: string | null;
  }[];
};

export type RawBoard = {
  id: string;
  name: string;
  columns: MondayColumn[];
  items: MondayItem[];
};

const BOARD_META = `
  query ($ids: [ID!]) {
    boards(ids: $ids) {
      id
      name
      columns { id title type settings_str }
    }
  }
`;

const FIRST_PAGE = `
  query ($ids: [ID!], $limit: Int!) {
    boards(ids: $ids) {
      id
      name
      columns { id title type settings_str }
      items_page(limit: $limit) {
        cursor
        items { id name column_values { id text type value } }
      }
    }
  }
`;

const NEXT_PAGE = `
  query ($cursor: String!, $limit: Int!) {
    next_items_page(cursor: $cursor, limit: $limit) {
      cursor
      items { id name column_values { id text type value } }
    }
  }
`;

const PAGE_SIZE = 250;
const MAX_PAGES = 40;

export async function fetchBoard(boardId: string): Promise<RawBoard> {
  const first = await mondayQuery<{
    boards: (Omit<RawBoard, "items"> & {
      items_page: { cursor: string | null; items: MondayItem[] };
    })[];
  }>(FIRST_PAGE, { ids: [boardId], limit: PAGE_SIZE });

  const board = first.boards?.[0];
  if (!board) {
    throw new Error(
      `Board ${boardId} was not found, or the API token has no access to it.`,
    );
  }

  const items = [...board.items_page.items];
  let cursor = board.items_page.cursor;
  let pages = 0;

  while (cursor && pages < MAX_PAGES) {
    const next = await mondayQuery<{
      next_items_page: { cursor: string | null; items: MondayItem[] };
    }>(NEXT_PAGE, { cursor, limit: PAGE_SIZE });
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
    pages++;
  }

  return { id: board.id, name: board.name, columns: board.columns, items };
}

export async function fetchBoardMeta(boardIds: string[]) {
  const data = await mondayQuery<{ boards: Omit<RawBoard, "items">[] }>(BOARD_META, {
    ids: boardIds,
  });
  return data.boards ?? [];
}

export async function verifyConnection() {
  const { workOrders, deals } = configuredBoardIds();
  const boards = await fetchBoardMeta([workOrders, deals]);
  return boards.map((b) => ({
    id: b.id,
    name: b.name,
    columnCount: b.columns.length,
  }));
}
