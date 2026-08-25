import OpenAI from "openai";
import { systemPrompt } from "./system";
import { TOOLS, runTool } from "./tools";
import { MondayError } from "@/lib/monday/client";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Confidence = { level: "high" | "medium" | "low"; score: number; basis: string[] };

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | {
      type: "tool_end";
      id: string;
      name: string;
      ok: boolean;
      summary: string;
      confidence?: Confidence;
    }
  | { type: "error"; message: string; hint?: string }
  | { type: "done" };

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const MAX_TURNS = 8;

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new MondayError("OPENAI_API_KEY is not set on the server.", "config", false);
  }
  // Transient connection resets to the API are common enough on long
  // tool-calling loops that the default of 2 retries is not enough.
  return new OpenAI({ apiKey, maxRetries: 4, timeout: 60_000 });
}

const isTransient = (err: unknown) => {
  if (err instanceof OpenAI.APIError) {
    return err.status === undefined || err.status === 429 || err.status >= 500;
  }
  return err instanceof Error;
};

/**
 * Opens the completion stream, retrying transient failures. Only safe to retry
 * here: nothing has been streamed to the caller yet, so no output is duplicated.
 */
async function openStream(
  openai: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    try {
      return await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        stream: true,
      });
    } catch (err) {
      lastError = err;
      if (!isTransient(err)) throw err;
    }
  }
  throw lastError;
}

/** One-line description of a tool result, shown in the UI's activity trail. */
function summarize(name: string, result: unknown): { ok: boolean; summary: string } {
  const r = result as Record<string, unknown>;
  if (r && typeof r === "object" && typeof r.error === "string") {
    return { ok: false, summary: r.error.slice(0, 160) };
  }
  switch (name) {
    case "describe_boards": {
      const boards = (r?.boards as { board_name: string; row_count: number }[]) ?? [];
      return {
        ok: true,
        summary: boards.map((b) => `${b.board_name} · ${b.row_count} rows`).join("   ·   "),
      };
    }
    case "aggregate_metrics": {
      const groups = (r?.groups as unknown[])?.length ?? 0;
      const gap = r?.uncertainty as { excluded_rows: number } | undefined;
      return {
        ok: true,
        summary: `${r?.aggregation} of ${r?.metric} · ${r?.matched} rows · ${groups} group${groups === 1 ? "" : "s"}${
          gap ? ` · ${gap.excluded_rows} blank row(s) projected` : ""
        }`,
      };
    }
    case "query_records":
      return {
        ok: true,
        summary: `${r?.returned} of ${r?.matched} matching rows${
          r?.ambiguous_name_warning ? " · repeated names, not one record" : ""
        }`,
      };
    case "data_quality_report": {
      const boards = (r?.boards as { board_name: string; completeness: string }[]) ?? [];
      return {
        ok: true,
        summary: boards.map((b) => `${b.board_name} ${b.completeness} complete`).join("   ·   "),
      };
    }
    case "audit_consistency": {
      const boards = (r?.boards as { findings: { violations: number }[]; checks_run: number }[]) ?? [];
      const violations = boards.reduce(
        (n, b) => n + b.findings.reduce((m, f) => m + f.violations, 0),
        0,
      );
      const checks = boards.reduce((n, b) => n + b.checks_run, 0);
      return {
        ok: true,
        summary: `${checks} consistency check${checks === 1 ? "" : "s"} · ${
          violations ? `${violations} contradicting row(s)` : "no contradictions"
        }`,
      };
    }
    case "join_boards":
      return { ok: true, summary: `${r?.matched_keys} keys matched across boards` };
    default:
      return { ok: true, summary: "done" };
  }
}

function friendlyError(err: unknown): { message: string; hint?: string } {
  if (err instanceof MondayError) {
    switch (err.kind) {
      case "config":
        return {
          message: err.message,
          hint: "Add the missing value to your environment variables and restart the app.",
        };
      case "auth":
        return {
          message: "monday.com rejected the API token.",
          hint: "Regenerate it under monday.com → Developers → My access tokens, and confirm that account can see both boards.",
        };
      case "rate_limit":
        return {
          message: "monday.com is rate limiting these requests.",
          hint: "Wait a few seconds and ask again — the complexity budget replenishes on a rolling window.",
        };
      default:
        return { message: `monday.com request failed: ${err.message}` };
    }
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401) {
      return { message: "The OpenAI API key was rejected.", hint: "Check OPENAI_API_KEY." };
    }
    if (err.status === 429) {
      return {
        message: "OpenAI rate limited the request.",
        hint: "Wait a moment and retry, or check the account's quota.",
      };
    }
    if (err.status === 404) {
      return {
        message: `The model "${MODEL}" is not available to this API key.`,
        hint: "Set OPENAI_MODEL to a model your account can access, such as gpt-4o.",
      };
    }
    return { message: `Model request failed (${err.status}): ${err.message}` };
  }
  return { message: err instanceof Error ? err.message : "Something went wrong." };
}

type PendingCall = { id: string; name: string; args: string };

export async function* runAgent(history: ChatMessage[]): AsyncGenerator<AgentEvent> {
  let openai: OpenAI;
  try {
    openai = client();
  } catch (err) {
    yield { type: "error", ...friendlyError(err) };
    return;
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt() },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = await openStream(openai, messages);

      let text = "";
      const calls = new Map<number, PendingCall>();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          text += delta.content;
          yield { type: "text", delta: delta.content };
        }

        for (const call of delta.tool_calls ?? []) {
          const existing = calls.get(call.index) ?? { id: "", name: "", args: "" };
          if (call.id) existing.id = call.id;
          if (call.function?.name) existing.name = call.function.name;
          if (call.function?.arguments) existing.args += call.function.arguments;
          calls.set(call.index, existing);
        }
      }

      const pending = [...calls.values()].filter((c) => c.name);

      if (!pending.length) {
        yield { type: "done" };
        return;
      }

      messages.push({
        role: "assistant",
        content: text || null,
        tool_calls: pending.map((c) => ({
          id: c.id,
          type: "function" as const,
          function: { name: c.name, arguments: c.args || "{}" },
        })),
      });

      for (const call of pending) {
        let input: Record<string, unknown> = {};
        let parseError: string | null = null;
        try {
          input = call.args ? JSON.parse(call.args) : {};
        } catch {
          parseError = `Arguments for ${call.name} were not valid JSON. Retry with a well-formed object.`;
        }

        yield { type: "tool_start", id: call.id, name: call.name, input };

        const result = parseError
          ? { error: parseError, recoverable: true }
          : await runTool(call.name, input).catch((err) => ({
              error: friendlyError(err).message,
              recoverable: false,
            }));

        const { ok, summary } = summarize(call.name, result);
        const confidence = (result as { confidence?: Confidence })?.confidence;
        yield { type: "tool_end", id: call.id, name: call.name, ok, summary, confidence };

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    yield {
      type: "error",
      message: "The analysis needed more steps than allowed.",
      hint: "Try narrowing the question to one board or one metric.",
    };
  } catch (err) {
    yield { type: "error", ...friendlyError(err) };
  }
}
