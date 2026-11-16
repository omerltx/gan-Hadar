export function isFacebookUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "fb.watch" || host.endsWith(".fb.watch")) {
    return true;
  }
  if (host === "fb.com" || host.endsWith(".fb.com")) {
    return true;
  }
  if (host === "facebook.com" || host.endsWith(".facebook.com")) {
    return true;
  }

  return false;
}

export async function resolveFacebookUrl(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!isFacebookUrl(trimmed)) {
    throw new Error("INVALID_URL");
  }

  try {
    const response = await fetch(trimmed, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const finalUrl = response.url;
    if (finalUrl && isFacebookUrl(finalUrl)) {
      return finalUrl;
    }
  } catch {
    // yt-dlp can still resolve many share links
  }

  return trimmed;
}

/** Numeric Facebook video id from common URL shapes (/videos/<id>, ?v=<id>, /reel/<id>). */
export function extractVideoId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const v = u.searchParams.get("v");
    if (v && /^\d{6,}$/.test(v)) return v;
    const m = u.pathname.match(/\/(?:videos|reel|reels)\/(?:[^/]+\/)?(\d{6,})/);
    if (m) return m[1];
  } catch {
    // ignore
  }
  return null;
}

/** Alternative URLs yt-dlp can parse when the original page URL fails. */
export function fallbackVideoUrls(resolvedUrl: string): string[] {
  const id = extractVideoId(resolvedUrl);
  if (!id) return [];
  return [
    `https://www.facebook.com/reel/${id}`,
    `https://m.facebook.com/watch/?v=${id}`,
  ].filter((u) => u !== resolvedUrl);
}
