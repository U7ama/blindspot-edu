"use client";

import Link from "next/link";
import { Mail, MessageSquare, ArrowUpRight, ShieldCheck, Sparkles, Code2 } from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="app-footer relative w-full border-t border-[var(--line)] bg-[var(--surface)] text-[var(--muted-ink)] overflow-hidden transition-colors">
      {/* Soft ambient burgundy glow behind footer */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[280px] rounded-full blur-[140px] opacity-40"
        style={{ background: "radial-gradient(ellipse, var(--glow), transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-14 sm:py-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-14 pb-12 border-b border-[var(--line)]">

          {/* Col 1: Brand & Pedagogical Mission (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-start">
            <Link href="/" className="flex items-center gap-2.5 mb-4 group">
              <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-[var(--line)] shadow-sm group-hover:scale-105 transition-transform flex items-center justify-center bg-[var(--surface)]">
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
              <span className="font-semibold tracking-tight text-[var(--ink)]">
                blindspot<span className="brand-edu"> EDU</span>
              </span>
            </Link>

            <p className="text-sm leading-relaxed text-[var(--muted-ink)] max-w-sm">
              Turn passive lecture recordings into an active private tutor with receipts. Structured pedagogical planning, diagnostic checks, and verifiable source timestamps.
            </p>

            <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-soft)] text-xs text-[var(--accent-ink)] font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Inspect the original evidence</span>
            </div>
          </div>

          {/* Col 2: Product (2 cols) */}
          <div className="md:col-span-2 flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">Learning</span>
            <Link href="/workspace" className="text-xs text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors">
              Start learning
            </Link>
            <a href="/#how-it-works" className="text-xs text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors">
              How it works
            </a>
            <Link href="/workspace" className="text-xs text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors">
              Lecture library
            </Link>
            <a href="/#how-it-works" className="text-xs text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors">
              Evidence receipts
            </a>
          </div>

          {/* Col 3: Architecture & Pedagogy (2 cols) */}
          <div className="md:col-span-2 flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">Architecture</span>
            <span className="text-xs text-[var(--muted-ink)]">Pedagogical Compiler</span>
            <span className="text-xs text-[var(--muted-ink)]">Prerequisite Engine</span>
            <span className="text-xs text-[var(--muted-ink)]">Timestamp Sync</span>
            <span className="text-xs text-[var(--muted-ink)]">Diagnostic checks & reassessment</span>
          </div>

          {/* Col 4: Contact & Community (3 cols) */}
          <div className="md:col-span-3 flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">Contact &amp; Support</span>
            <a
              href="mailto:usamaaslam8726@gmail.com"
              className="text-xs text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors inline-flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5 text-[var(--accent-ink)]" />
              <span>usamaaslam8726@gmail.com</span>
            </a>
            <Link
              href="/workspace"
              className="text-xs text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors inline-flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
              <span>Student &amp; Course Access</span>
            </Link>
            <a
              href="https://github.com/U7ama/blindspot-edu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--muted-ink)] hover:text-[var(--ink)] transition-colors inline-flex items-center gap-1.5"
            >
              <GithubIcon className="w-3.5 h-3.5 text-[var(--ink)]" />
              <span>GitHub repository</span>
              <ArrowUpRight className="w-3 h-3 opacity-60" />
            </a>
            <div className="mt-2 text-[11px] text-[var(--muted-ink)]">
              Office hours &bull; Built for university courses
            </div>
          </div>

        </div>

        {/* Bottom copyright & operational status */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--muted-ink)]">
          <div>
            &copy; {new Date().getFullYear()} Blindspot Edu. Evidence-connected learning for students.
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-30"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[var(--ink)] font-medium">Learning with source evidence</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-[var(--ink)] transition-colors">Privacy Protocol</Link>
            <Link href="/terms" className="hover:text-[var(--ink)] transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
