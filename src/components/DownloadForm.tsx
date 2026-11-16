"use client";

import { FormEvent, useState } from "react";
import {
  MSG_DOWNLOADING,
  MSG_GENERIC_ERROR,
  MSG_INVALID_URL,
  MSG_PROCESSING,
  MSG_SUCCESS,
} from "@/lib/messages";

type StatusKind = "idle" | "loading" | "success" | "error";

export function DownloadForm() {
  const [url, setUrl] = useState("");
  const [statusKind, setStatusKind] = useState<StatusKind>("idle");
  const [statusText, setStatusText] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmed = url.trim();
    if (!trimmed) {
      setStatusKind("error");
      setStatusText(MSG_INVALID_URL);
      return;
    }

    setStatusKind("loading");
    setStatusText(MSG_PROCESSING);

    try {
      const prep = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = (await prep.json()) as {
        error?: string;
        downloadUrl?: string;
        fileName?: string;
        title?: string;
      };

      if (!prep.ok) {
        setStatusKind("error");
        setStatusText(data.error ?? MSG_GENERIC_ERROR);
        return;
      }

      setStatusText(MSG_DOWNLOADING);

      const fileRes = await fetch(data.downloadUrl ?? "");
      if (!fileRes.ok) {
        setStatusKind("error");
        setStatusText(MSG_GENERIC_ERROR);
        return;
      }

      const blob = await fileRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = data.fileName ?? "video.mp4";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setStatusKind("success");
      setStatusText(MSG_SUCCESS);
    } catch {
      setStatusKind("error");
      setStatusText(MSG_GENERIC_ERROR);
    }
  }

  const statusClass =
    statusKind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : statusKind === "error"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : statusKind === "loading"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-transparent bg-transparent text-slate-600";

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4" dir="rtl">
      <label htmlFor="fb-url" className="block text-sm font-medium text-slate-700">
        קישור לסרטון בפייסבוק
      </label>
      <input
        id="fb-url"
        name="url"
        type="url"
        inputMode="url"
        autoComplete="off"
        dir="ltr"
        placeholder="https://www.facebook.com/share/r/…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none ring-emerald-500/30 transition focus:border-emerald-500 focus:ring-4"
      />
      <button
        type="submit"
        disabled={statusKind === "loading"}
        className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {statusKind === "loading" ? "מורידים…" : "הורדה"}
      </button>

      {statusKind !== "idle" && (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${statusClass}`}
        >
          {statusText}
        </p>
      )}
    </form>
  );
}