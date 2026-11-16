import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { NextResponse } from "next/server";
import { Readable } from "stream";
import { MSG_GENERIC_ERROR } from "@/lib/messages";
import { getEntry, removeEntry } from "@/lib/temp-store";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;

  if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json({ error: MSG_GENERIC_ERROR }, { status: 404 });
  }

  const entry = getEntry(token);
  if (!entry) {
    return NextResponse.json({ error: MSG_GENERIC_ERROR }, { status: 404 });
  }

  let size = 0;
  try {
    const info = await stat(entry.filePath);
    size = info.size;
  } catch {
    await removeEntry(token);
    return NextResponse.json({ error: MSG_GENERIC_ERROR }, { status: 404 });
  }

  const stream = createReadStream(entry.filePath);
  const fileName = `${entry.title}.mp4`;

  stream.on("close", () => {
    void removeEntry(token);
  });

  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}