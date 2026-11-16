import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";

/**
 * Client for the Gan Hadar storage Worker (Cloudflare Worker + R2).
 * The shared secret stays on the server; the browser only talks to /api/videos.
 */

// Cloudflare Workers reject request bodies above 100MB on the free plan.
export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

export type SavedVideo = {
  key: string;
  size: number;
  title: string;
  source: string;
  createdAt: string;
};

function config(): { base: string; secret: string } | null {
  const base = process.env.STORAGE_WORKER_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.STORAGE_SECRET?.trim();
  if (!base || !secret) return null;
  return { base, secret };
}

export function storageConfigured(): boolean {
  return config() !== null;
}

const KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidKey(key: string): boolean {
  return KEY_RE.test(key);
}

/** Stable storage key from the yt-dlp video id (dedupes share/reel/watch links). */
export function keyForVideoId(videoId: string): string {
  const cleaned = videoId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
  return `fb_${cleaned}`;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const cfg = config();
  if (!cfg) throw new Error("storage not configured");
  const headers = new Headers(init.headers);
  headers.set("X-Storage-Secret", cfg.secret);
  return fetch(`${cfg.base}${path}`, { ...init, headers, cache: "no-store" });
}

export async function listVideos(): Promise<{ items: SavedVideo[]; totalBytes: number }> {
  const res = await call("/videos");
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return (await res.json()) as { items: SavedVideo[]; totalBytes: number };
}

export async function getVideoInfo(key: string): Promise<SavedVideo | null> {
  const res = await call(`/videos/${encodeURIComponent(key)}`, { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`head failed: ${res.status}`);
  const dec = (v: string | null) => {
    try {
      return decodeURIComponent(v ?? "");
    } catch {
      return v ?? "";
    }
  };
  return {
    key,
    size: Number(res.headers.get("Content-Length") ?? 0),
    title: dec(res.headers.get("X-Meta-Title")) || key,
    source: dec(res.headers.get("X-Meta-Source")),
    createdAt: res.headers.get("X-Meta-Created") ?? "",
  };
}

export async function uploadVideo(
  key: string,
  filePath: string,
  meta: { title: string; source: string },
): Promise<boolean> {
  const info = await stat(filePath);
  if (info.size > MAX_UPLOAD_BYTES) return false;
  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  const res = await call(`/videos/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(info.size),
      "X-Meta-Title": encodeURIComponent(meta.title.slice(0, 300)),
      "X-Meta-Source": encodeURIComponent(meta.source.slice(0, 1000)),
    },
    body,
    // Required by Node's fetch for streaming request bodies.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return res.ok;
}

export async function fetchVideo(key: string, range: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (range) headers.Range = range;
  return call(`/videos/${encodeURIComponent(key)}`, { headers });
}

export async function deleteVideo(key: string): Promise<boolean> {
  const res = await call(`/videos/${encodeURIComponent(key)}`, { method: "DELETE" });
  return res.ok;
}
