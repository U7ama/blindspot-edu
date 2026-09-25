"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import ThemePicker from "./ThemePicker";
import Footer from "./Footer";
import CompletionAlerts from "./CompletionAlerts";

export { button, secondary, panel } from "@/lib/ui-tokens";

export default function Shell({
  children,
  footer = true,
}: {
  children: ReactNode;
  footer?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 15);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="app-shell">
      <div className="ambient-scene" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className={`app-header ${scrolled ? "scrolled shadow-md" : ""}`}>
        <nav className={`site-frame flex items-center justify-between gap-2 sm:gap-4 transition-[padding] duration-200 ${scrolled ? "py-2.5 sm:py-3" : "py-3 sm:py-4"}`}>
          <Link href="/" className="flex items-center gap-2 sm:gap-2.5 font-semibold tracking-tight group shrink-0">
            <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden border border-[var(--line)] shadow-sm group-hover:scale-105 transition-transform flex items-center justify-center bg-[var(--surface)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-light.png"
                alt="Blindspot Edu Logo"
                className="brand-logo-light w-full h-full object-cover"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-dark.png"
                alt="Blindspot Edu Logo"
                className="brand-logo-dark w-full h-full object-cover"
              />
            </div>
            <span className="text-sm sm:text-base">
              blindspot<span className="brand-edu"> EDU</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-5 shrink-0">
            <Link
              className="nav-link inline-flex items-center gap-1 hover:text-[var(--accent-ink)] transition-colors font-medium text-xs sm:text-sm whitespace-nowrap shrink-0"
              href="/workspace"
            >
              <span className="hidden min-[380px]:inline">My </span>lectures <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-70" />
            </Link>
            <ThemePicker />
          </div>
        </nav>
      </header>
      <div className="page-content">{children}</div>
      <CompletionAlerts />
      {footer && <Footer />}
    </div>
  );
}
