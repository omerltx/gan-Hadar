"use client";

import { useState } from "react";
import { DownloadForm } from "@/components/DownloadForm";
import { Gallery } from "@/components/Gallery";

export function HomeClient() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  return (
    <>
      <section className="rounded-3xl border border-slate-100 bg-white/90 p-6 shadow-lg shadow-emerald-900/5 backdrop-blur">
        <DownloadForm
          onSaved={(key) => {
            setHighlightKey(key);
            setRefreshToken((n) => n + 1);
          }}
        />
      </section>
      <ul className="mt-8 space-y-2 text-sm text-slate-500">
        <li>• נתמכים קישורי שיתוף, ריל, watch ו־fb.watch</li>
        <li>• רק תוכן ציבורי שאפשר לצפות בו בלי להתחבר</li>
        <li>• כל סרטון שמורידים נשמר בגלריה למטה, ואפשר למחוק אותו עם הפח</li>
      </ul>
      <Gallery refreshToken={refreshToken} highlightKey={highlightKey} />
    </>
  );
}
