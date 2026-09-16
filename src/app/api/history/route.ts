import { NextRequest } from "next/server";
import { db } from "@/db";
import { downloads } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const videoId = url.searchParams.get("videoId");

  try {
    if (videoId) {
      const rows = await db
        .select()
        .from(downloads)
        .where(eq(downloads.videoId, videoId))
        .orderBy(desc(downloads.createdAt))
        .limit(limit);
      return Response.json({ ok: true, items: rows });
    }

    const rows = await db
      .select()
      .from(downloads)
      .orderBy(desc(downloads.createdAt))
      .limit(limit);

    return Response.json({ ok: true, items: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await db.delete(downloads);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
