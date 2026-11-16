// Cloudflare Worker: private video storage for Gan Hadar, backed by R2.
// All requests must carry the shared secret in the X-Storage-Secret header.
// Routes:
//   GET    /videos            -> JSON list of saved videos (newest first)
//   PUT    /videos/:key       -> upload (body = mp4, needs Content-Length)
//                                headers: X-Meta-Title, X-Meta-Source (URI-encoded)
//   HEAD   /videos/:key       -> metadata only
//   GET    /videos/:key       -> video bytes, supports Range (206)
//   DELETE /videos/:key       -> delete

const KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toItem(obj) {
  const m = obj.customMetadata || {};
  return {
    key: obj.key,
    size: obj.size,
    title: m.title || obj.key,
    source: m.source || "",
    createdAt: m.createdAt || (obj.uploaded ? obj.uploaded.toISOString() : ""),
  };
}

function objectHeaders(obj) {
  const h = new Headers();
  obj.writeHttpMetadata(h);
  if (!h.get("Content-Type")) h.set("Content-Type", "video/mp4");
  h.set("Accept-Ranges", "bytes");
  h.set("ETag", obj.httpEtag);
  const m = obj.customMetadata || {};
  if (m.title) h.set("X-Meta-Title", encodeURIComponent(m.title));
  if (m.source) h.set("X-Meta-Source", encodeURIComponent(m.source));
  if (m.createdAt) h.set("X-Meta-Created", m.createdAt);
  return h;
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true });
    }
    if (!env.STORAGE_SECRET || !safeEqual(request.headers.get("X-Storage-Secret") || "", env.STORAGE_SECRET)) {
      return json({ error: "unauthorized" }, 401);
    }

    if (url.pathname === "/videos" && request.method === "GET") {
      const items = [];
      let cursor;
      do {
        const page = await env.BUCKET.list({ cursor, limit: 1000, include: ["customMetadata", "httpMetadata"] });
        for (const o of page.objects) items.push(toItem(o));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      const totalBytes = items.reduce((s, i) => s + i.size, 0);
      return json({ items, totalBytes });
    }

    const match = url.pathname.match(/^\/videos\/([^/]+)$/);
    if (!match) return json({ error: "not found" }, 404);
    const key = decodeURIComponent(match[1]);
    if (!KEY_RE.test(key)) return json({ error: "bad key" }, 400);

    switch (request.method) {
      case "PUT": {
        const len = Number(request.headers.get("Content-Length") || "0");
        if (!len) return json({ error: "Content-Length required" }, 411);
        const dec = (v) => { try { return decodeURIComponent(v || ""); } catch { return v || ""; } };
        const title = dec(request.headers.get("X-Meta-Title")).slice(0, 300);
        const source = dec(request.headers.get("X-Meta-Source")).slice(0, 1000);
        const obj = await env.BUCKET.put(key, request.body, {
          httpMetadata: { contentType: request.headers.get("Content-Type") || "video/mp4" },
          customMetadata: { title, source, createdAt: new Date().toISOString() },
        });
        return json({ ok: true, item: toItem(obj) }, 201);
      }
      case "HEAD": {
        const obj = await env.BUCKET.head(key);
        if (!obj) return new Response(null, { status: 404 });
        const h = objectHeaders(obj);
        h.set("Content-Length", String(obj.size));
        return new Response(null, { headers: h });
      }
      case "GET": {
        const rangeHeader = request.headers.get("Range");
        const obj = await env.BUCKET.get(key, rangeHeader ? { range: request.headers } : {});
        if (!obj) return json({ error: "not found" }, 404);
        const h = objectHeaders(obj);
        if (rangeHeader && obj.range) {
          let start, end;
          const r = obj.range;
          if ("suffix" in r && r.suffix !== undefined) {
            start = Math.max(0, obj.size - r.suffix);
            end = obj.size - 1;
          } else {
            start = r.offset || 0;
            end = r.length !== undefined ? start + r.length - 1 : obj.size - 1;
          }
          h.set("Content-Range", `bytes ${start}-${end}/${obj.size}`);
          h.set("Content-Length", String(end - start + 1));
          return new Response(obj.body, { status: 206, headers: h });
        }
        h.set("Content-Length", String(obj.size));
        return new Response(obj.body, { headers: h });
      }
      case "DELETE": {
        await env.BUCKET.delete(key);
        return json({ ok: true });
      }
      default:
        return json({ error: "method not allowed" }, 405);
    }
  },
};

export default worker;
