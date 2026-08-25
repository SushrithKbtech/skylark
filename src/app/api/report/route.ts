import { buildReport } from "@/lib/data/report";
import { MondayError } from "@/lib/monday/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ ok: true, report: await buildReport() });
  } catch (err) {
    if (err instanceof MondayError) {
      return Response.json(
        { ok: false, stage: err.kind, message: err.message },
        { status: err.kind === "auth" || err.kind === "config" ? 503 : 502 },
      );
    }
    return Response.json(
      { ok: false, message: err instanceof Error ? err.message : "Report failed." },
      { status: 500 },
    );
  }
}
