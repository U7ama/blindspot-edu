"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Github, ArrowRight, Menu, X, Compass, Presentation, Sparkles, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route changes or resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled || mobileMenuOpen
          ? "bg-[#09090b]/90 backdrop-blur-2xl border-b border-white/[0.08] py-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
          : "bg-transparent py-4 sm:py-5"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-[#701a24]/20 border border-[#701a24]/40 text-stone-200 group-hover:border-[#701a24] transition-colors">
            <span className="font-bold text-sm tracking-tighter">B</span>
            <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#701a24]" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base sm:text-lg font-bold tracking-tight text-white group-hover:text-stone-200 transition-colors">
              Blindspot
            </span>
            <span className="text-[10px] font-mono font-medium uppercase tracking-widest text-stone-400">
              Edu
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-neutral-400 tracking-tight">
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-white transition-colors">
            How it Works
          </a>
          <Link href="/workspace" className="hover:text-white transition-colors">
            Workspace
          </Link>
          <Link
            href="/whiteboard-lab"
            className="flex items-center gap-1.5 text-amber-400/90 hover:text-amber-300 transition-colors font-semibold"
          >
            <span>Whiteboard</span>
            <span className="px-1.5 py-0.2 text-[9px] font-mono uppercase bg-amber-500/20 border border-amber-500/30 rounded text-amber-300">
              Live
            </span>
          </Link>
        </nav>

        {/* Right Actions (Desktop + Mobile) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Workspace link visible on mobile without opening menu */}
          <Link
            href="/workspace"
            className="flex md:hidden items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#701a24]/30 hover:bg-[#701a24]/50 border border-[#701a24]/50 text-neutral-200 text-xs font-medium transition-colors"
          >
            <Compass className="w-3.5 h-3.5 text-rose-400" />
            <span>Workspace</span>
          </Link>

          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors tracking-tight px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub</span>
          </a>

          <Link
            href="/workspace"
            className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-neutral-950 hover:bg-neutral-200 text-xs font-semibold tracking-tight transition-colors shadow-[0_0_20px_rgba(255,255,255,0.15)] cursor-pointer"
          >
            <span>Launch App</span>
            <ArrowRight className="w-3 h-3" />
          </Link>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            title="Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer / Dropdown */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="md:hidden overflow-hidden border-t border-white/[0.08] bg-[#09090b]/95 backdrop-blur-2xl"
          >
            <div className="px-5 py-4 space-y-3">
              <Link
                href="/workspace"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-[#701a24]/30 to-neutral-900 border border-[#701a24]/40 text-neutral-100 font-medium text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-rose-400" />
                  <span>Interactive Workspace</span>
                </div>
                <span className="text-[10px] font-mono uppercase bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">
                  Open
                </span>
              </Link>

              <Link
                href="/whiteboard-lab"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/60 border border-white/5 text-neutral-200 hover:text-white text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Presentation className="w-4 h-4 text-amber-400" />
                  <span>AI Whiteboard Lab</span>
                </div>
                <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                  Live
                </span>
              </Link>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-neutral-300 hover:text-white transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Features</span>
                </a>
                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-neutral-300 hover:text-white transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 text-neutral-400" />
                  <span>How it Works</span>
                </a>
              </div>

              <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors p-2"
                >
                  <Github className="w-4 h-4" />
                  <span>GitHub Repo</span>
                </a>

                <Link
                  href="/workspace"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-neutral-950 text-xs font-semibold shadow-sm"
                >
                  <span>Launch</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;

