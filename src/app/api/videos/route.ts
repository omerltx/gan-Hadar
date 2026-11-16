import { NextResponse, connection } from "next/server";
import { listVideos, storageConfigured } from "@/lib/storage";

export async function GET() {
  await connection();
  if (!storageConfigured()) {
    return NextResponse.json({ items: [], totalBytes: 0, enabled: false });
  }
  try {
    const data = await listVideos();
    return NextResponse.json(
      { ...data, enabled: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("gallery list failed", err);
    return NextResponse.json({ error: "list failed" }, { status: 502 });
  }
}
