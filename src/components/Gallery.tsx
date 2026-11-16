"use client";

import { useEffect, useState } from "react";

type SavedVideo = {
  key: string;
  size: number;
  title: string;
  source: string;
  createdAt: string;
};

type Props = {
  refreshToken: number;
  highlightKey?: string | null;
};

async function fetchGallery(): Promise<
  { ok: true; enabled: boolean; items: SavedVideo[] } | { ok: false }
> {
  try {
    const res = await fetch("/api/videos", { cache: "no-store" });
    const data = (await res.json()) as { items?: SavedVideo[]; enabled?: boolean };
    if (!res.ok) return { ok: false };
    return { ok: true, enabled: data.enabled !== false, items: data.items ?? [] };
  } catch {
    return { ok: false };
  }
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Jerusalem",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function Gallery({ refreshToken, highlightKey }: Props) {
  const [items, setItems] = useState<SavedVideo[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGallery().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setEnabled(result.enabled);
        setItems(result.items);
        setError(false);
      } else {
        setError(true);
        setItems((prev) => prev ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    if (!highlightKey || !items) return;
    document
      .getElementById(`video-${highlightKey}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightKey, items]);

  async function handleDelete(video: SavedVideo) {
    if (!window.confirm("למחוק את הסרטון?")) return;
    setDeleting(video.key);
    try {
      const res = await fetch(`/api/videos/${video.key}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((prev) => (prev ?? []).filter((v) => v.key !== video.key));
    } catch {
      window.alert("המחיקה נכשלה. נסי שוב.");
    } finally {
      setDeleting(null);
    }
  }

  if (!enabled) return null;

  return (
    <section id="gallery" className="mt-10" dir="rtl">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-2xl font-bold text-slate-900">הגלריה</h2>
        {items && items.length > 0 && (
          <span className="text-sm text-slate-500">
            {items.length === 1 ? "סרטון אחד" : `${items.length} סרטונים`}
          </span>
        )}
      </div>

      {items === null && (
        <p className="rounded-2xl border border-slate-100 bg-white/80 p-6 text-center text-sm text-slate-500">
          טוענים את הגלריה…
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          לא הצלחנו לטעון את הגלריה. נסי לרענן את הדף.
        </p>
      )}

      {items && items.length === 0 && !error && (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm text-slate-500">
          עדיין אין סרטונים בגלריה. כל סרטון שתורידי יישמר כאן.
        </p>
      )}

      <ul className="space-y-6">
        {items?.map((video) => (
          <li
            key={video.key}
            id={`video-${video.key}`}
            className={`overflow-hidden rounded-3xl border bg-white/90 shadow-lg shadow-emerald-900/5 ${
              highlightKey === video.key ? "border-emerald-400 ring-4 ring-emerald-500/20" : "border-slate-100"
            }`}
          >
            <video
              controls
              playsInline
              preload="metadata"
              src={`/api/videos/${video.key}`}
              className="aspect-[9/16] max-h-[70vh] w-full bg-black object-contain"
            />
            <div className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 break-words font-semibold text-slate-900">
                  {video.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(video.createdAt)} · {formatSize(video.size)}
                  {video.source && (
                    <>
                      {" · "}
                      <a
                        href={video.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-emerald-700"
                      >
                        מקור בפייסבוק
                      </a>
                    </>
                  )}
                </p>
              </div>
              <a
                href={`/api/videos/${video.key}?download=1`}
                className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                הורדה
              </a>
              <button
                type="button"
                onClick={() => handleDelete(video)}
                disabled={deleting === video.key}
                aria-label="מחיקת הסרטון"
                title="מחיקה"
                className="shrink-0 rounded-xl border border-rose-200 bg-white p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                <TrashIcon />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
