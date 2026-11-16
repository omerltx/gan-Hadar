import { HomeClient } from "@/components/HomeClient";

export default function Home() {
  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-50 via-white to-slate-50">
      <header className="mx-auto max-w-lg px-4 pb-6 pt-10 text-center">
        <BrandMark />
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
          גן הדר
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          מדביקים קישור לסרטון או ריל ציבורי בפייסבוק ומורידים את הקובץ — בלי
          התחברות ובלי סיסמאות.
        </p>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 pb-16">
        <HomeClient />
      </main>

      <footer className="pb-8 text-center text-xs text-slate-400">
        גן הדר · לשימוש אישי בלבד · כבדו זכויות יוצרים
      </footer>
    </div>
  );
}

function BrandMark() {
  return (
    <div
      className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-3xl shadow-lg shadow-emerald-700/30"
      aria-hidden
    >
      🌿
    </div>
  );
}