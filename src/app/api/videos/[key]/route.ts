import { NextResponse } from "next/server";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import {
  deleteVideo,
  fetchVideo,
  getVideoInfo,
  isValidKey,
  storageConfigured,
} from "@/lib/storage";

type RouteContext = { params: Promise<{ key: string }> };

const PASS_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
];

export async function GET(request: Request, context: RouteContext) {
  const { key } = await context.params;
  if (!storageConfigured() || !isValidKey(key)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const upstream = await fetchVideo(key, request.headers.get("range"));
  if (upstream.status === 404) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: "upstream error" }, { status: 502 });
  }

  const headers = new Headers();
  for (const name of PASS_HEADERS) {
    const v = upstream.headers.get(name);
    if (v) headers.set(name, v);
  }
  headers.set("Cache-Control", "private, max-age=3600");

  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  if (wantsDownload) {
    let title = key;
    try {
      title = decodeURIComponent(upstream.headers.get("x-meta-title") ?? "") || key;
    } catch {
      // keep key
    }
    const fileName = `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120)}.mp4`;
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { key } = await context.params;
  if (!storageConfigured() || !isValidKey(key)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const rate = checkRateLimit(`del:${clientKeyFromHeaders(request.headers)}`);
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const info = await getVideoInfo(key);
  if (!info) return NextResponse.json({ ok: true, deleted: false });
  const ok = await deleteVideo(key);
  return NextResponse.json({ ok, deleted: ok }, { status: ok ? 200 : 502 });
}
