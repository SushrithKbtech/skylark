import { getAllDatasets } from "@/lib/data/store";
import { MondayError } from "@/lib/monday/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { ok: false, stage: "config", message: "OPENAI_API_KEY is not set." },
      { status: 503 },
    );
  }

  try {
    const datasets = await getAllDatasets();
    return Response.json({
      ok: true,
      fetchedAt: datasets[0]?.fetchedAt,
      boards: datasets.map((d) => ({
        slug: d.slug,
        name: d.boardName,
        id: d.boardId,
        rows: d.rowCount,
        fields: d.fields.length,
        completeness: Math.round(d.quality.completeness * 100),
        issues: d.quality.issues.length,
      })),
    });
  } catch (err) {
    const kind = err instanceof MondayError ? err.kind : "unknown";
    return Response.json(
      {
        ok: false,
        stage: kind,
        message: err instanceof Error ? err.message : "Could not reach monday.com.",
      },
      { status: 503 },
    );
  }
}
