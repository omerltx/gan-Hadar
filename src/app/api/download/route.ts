import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  fallbackVideoUrls,
  isFacebookUrl,
  resolveFacebookUrl,
} from "@/lib/facebook-url";
import {
  MSG_GENERIC_ERROR,
  MSG_INVALID_URL,
  MSG_RATE_LIMIT,
  MSG_UNSUPPORTED,
} from "@/lib/messages";
import {
  getVideoInfo,
  keyForVideoId,
  storageConfigured,
  uploadVideo,
} from "@/lib/storage";
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

  let probe = await probeFacebookVideo(resolvedUrl);
  if (!probe.ok) {
    // Some page-video URLs (/<page>/videos/<id>) fail to parse; the same id often
    // works as a reel or mobile watch URL.
    for (const alt of fallbackVideoUrls(resolvedUrl)) {
      const retry = await probeFacebookVideo(alt);
      if (retry.ok) {
        probe = retry;
        resolvedUrl = alt;
        break;
      }
    }
  }
  if (!probe.ok) {
    return NextResponse.json({ error: MSG_UNSUPPORTED }, { status: 422 });
  }

  const storageOn = storageConfigured();
  const videoKey = keyForVideoId(
    probe.data.id ||
      createHash("sha1").update(probe.data.webpageUrl).digest("hex").slice(0, 32),
  );

  if (storageOn) {
    try {
      const existing = await getVideoInfo(videoKey);
      if (existing) {
        return NextResponse.json({
          ok: true,
          alreadyExists: true,
          saved: true,
          videoKey,
          title: existing.title,
          fileName: `${sanitize(existing.title)}.mp4`,
          downloadUrl: `/api/videos/${videoKey}?download=1`,
        });
      }
    } catch (err) {
      console.error("storage lookup failed", err);
    }
  }

  const download = await downloadFacebookVideo(resolvedUrl, probe.data.title);
  if (!download.ok) {
    return NextResponse.json({ error: MSG_UNSUPPORTED }, { status: 422 });
  }

  let saved = false;
  let tooBig = false;
  if (storageOn) {
    try {
      saved = await uploadVideo(videoKey, download.data.filePath, {
        title: probe.data.title,
        source: /^\d+$/.test(probe.data.id)
          ? `https://www.facebook.com/watch/?v=${probe.data.id}`
          : probe.data.webpageUrl || rawUrl,
      });
      tooBig = !saved;
    } catch (err) {
      console.error("storage upload failed", err);
    }
  }

  const fileName = `${download.data.title}.mp4`;
  const downloadUrl = `/api/file/${download.data.id}`;

  return NextResponse.json({
    ok: true,
    alreadyExists: false,
    saved,
    tooBig,
    videoKey: saved ? videoKey : undefined,
    title: probe.data.title,
    fileName,
    downloadUrl,
  });
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120);
}

export async function GET() {
  return NextResponse.json({ error: MSG_GENERIC_ERROR }, { status: 405 });
}