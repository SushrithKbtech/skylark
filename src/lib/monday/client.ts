const MONDAY_API = "https://api.monday.com/v2";
const API_VERSION = "2024-10";

export class MondayError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "rate_limit" | "network" | "graphql" | "config",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "MondayError";
  }
}

function token(): string {
  const t = process.env.MONDAY_API_TOKEN;
  if (!t) {
    throw new MondayError(
      "MONDAY_API_TOKEN is not configured on the server.",
      "config",
      false,
    );
  }
  return t;
}

export function configuredBoardIds(): { workOrders: string; deals: string } {
  const workOrders = process.env.MONDAY_BOARD_WORK_ORDERS;
  const deals = process.env.MONDAY_BOARD_DEALS;
  if (!workOrders || !deals) {
    throw new MondayError(
      "MONDAY_BOARD_WORK_ORDERS and MONDAY_BOARD_DEALS must both be set.",
      "config",
      false,
    );
  }
  return { workOrders, deals };
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
  error_message?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mondayQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  let lastError: MondayError | null = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(2 ** attempt * 400);

    let res: Response;
    try {
      res = await fetch(MONDAY_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token(),
          "API-Version": API_VERSION,
        },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
      });
    } catch {
      lastError = new MondayError(
        "Could not reach monday.com. Check network connectivity.",
        "network",
        true,
      );
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new MondayError(
        "monday.com rejected the API token (401/403). It may be expired or lack board access.",
        "auth",
        false,
      );
    }

    if (res.status === 429 || res.status >= 500) {
      lastError = new MondayError(
        `monday.com returned ${res.status}.`,
        res.status === 429 ? "rate_limit" : "network",
        true,
      );
      continue;
    }

    const body = (await res.json()) as GraphQLResponse<T>;

    if (body.errors?.length) {
      const msg = body.errors.map((e) => e.message).join("; ");
      // Complexity budget exhaustion is transient — monday replenishes it.
      if (/complexity/i.test(msg)) {
        lastError = new MondayError(msg, "rate_limit", true);
        continue;
      }
      throw new MondayError(msg, "graphql", false);
    }

    if (body.error_message) {
      throw new MondayError(body.error_message, "graphql", false);
    }

    if (!body.data) {
      throw new MondayError("monday.com returned an empty response.", "graphql", false);
    }

    return body.data;
  }

  throw lastError ?? new MondayError("monday.com request failed.", "network", true);
}
