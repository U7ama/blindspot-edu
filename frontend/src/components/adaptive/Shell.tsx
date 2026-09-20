import Link from "next/link";
import { ReactNode } from "react";
export const button =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#701a24] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#8c2633] disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
export const secondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm text-stone-200 hover:bg-white/5 disabled:opacity-40";
export const panel =
  "rounded-2xl border border-white/10 bg-[#111114] p-5 sm:p-7";
export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b] text-stone-100">
      <header className="border-b border-white/10">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Link
            href="/"
            className="flex items-center gap-3 font-semibold tracking-tight"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-rose-900 bg-[#701a24]/30">
              B
            </span>
            Blindspot{" "}
            <span className="text-xs font-mono uppercase tracking-widest text-stone-500">
              Edu
            </span>
          </Link>
          <Link
            className="text-sm text-stone-300 hover:text-white"
            href="/workspace"
          >
            Your lectures →
          </Link>
        </nav>
      </header>
      {children}
      <footer className="mx-auto max-w-7xl px-5 py-10 text-xs text-stone-500">
        Lecture evidence stays visible. Supplementary teaching stays labelled.
      </footer>
    </div>
  );
}
