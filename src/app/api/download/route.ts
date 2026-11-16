import { NextResponse } from "next/server";
import { isFacebookUrl, resolveFacebookUrl } from "@/lib/facebook-url";
import {
  MSG_GENERIC_ERROR,
  MSG_INVALID_URL,
  MSG_RATE_LIMIT,
  MSG_UNSUPPORTED,
} from "@/lib/messages";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import { cleanupStaleJobs } from "@/lib/temp-store";
import { downloadFacebookVideo, probeFacebookVideo } from "@/lib/ytdlp";

export const maxDuration = 300;

type DownloadBody = { url?: string };

export async function POST(request: Request) {
  void cleanupStaleJobs();

  const rate = checkRateLimit(clientKeyFromHeaders(request.headers));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: MSG_RATE_LIMIT, retryAfterSec: rate.retryAfterSec },
      { status: 429 },
    );
  }

  let body: DownloadBody;
  try {
    body = (await request.json()) as DownloadBody;
  } catch {
    return NextResponse.json({ error: MSG_INVALID_URL }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl || !isFacebookUrl(rawUrl)) {
    return NextResponse.json({ error: MSG_INVALID_URL }, { status: 400 });
  }

  let resolvedUrl = rawUrl;
  try {
    resolvedUrl = await resolveFacebookUrl(rawUrl);
  } catch {
    return NextResponse.json({ error: MSG_INVALID_URL }, { status: 400 });
  }

  const probe = await probeFacebookVideo(resolvedUrl);
  if (!probe.ok) {
    return NextResponse.json({ error: MSG_UNSUPPORTED }, { status: 422 });
  }

  const download = await downloadFacebookVideo(resolvedUrl, probe.data.title);
  if (!download.ok) {
    return NextResponse.json({ error: MSG_UNSUPPORTED }, { status: 422 });
  }

  const fileName = `${download.data.title}.mp4`;
  const downloadUrl = `/api/file/${download.data.id}`;

  return NextResponse.json({
    ok: true,
    title: probe.data.title,
    fileName,
    downloadUrl,
  });
}

export async function GET() {
  return NextResponse.json({ error: MSG_GENERIC_ERROR }, { status: 405 });
}