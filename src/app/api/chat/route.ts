import { runAgent, type ChatMessage } from "@/lib/agent/run";

export const runtime = "nodejs";
export const maxDuration = 120;

function isValid(body: unknown): body is { messages: ChatMessage[] } {
  if (!body || typeof body !== "object") return false;
  const { messages } = body as { messages?: unknown };
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= 40 &&
    messages.every(
      (m) =>
        m &&
        typeof m === "object" &&
        (m as ChatMessage).role !== undefined &&
        ["user", "assistant"].includes((m as ChatMessage).role) &&
        typeof (m as ChatMessage).content === "string" &&
        (m as ChatMessage).content.length <= 8000,
    )
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValid(body)) {
    return Response.json({ error: "Expected { messages: [{ role, content }] }." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        for await (const event of runAgent(body.messages)) {
          send(event);
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Unexpected server error.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
