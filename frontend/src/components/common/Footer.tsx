"use client";

import React from "react";
import Link from "next/link";
import { Github } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer className="relative border-t border-white/[0.07] bg-[#09090b] text-neutral-400 py-16 sm:py-20 w-full overflow-hidden">
      {/* Background soft ambient gradient */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[250px] bg-[#701a24]/10 blur-[120px] rounded-full" />

      <div className="max-w-7xl mx-auto px-6 sm:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 pb-14 border-b border-white/[0.07]">
          
          {/* Col 1: Brand & Tagline (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-start">
            <Link href="/" className="flex items-center gap-2.5 mb-4 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#701a24]/20 border border-[#701a24]/40 text-stone-200">
                <span className="font-bold text-sm tracking-tighter">B</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-white font-sans">
                Blindspot <span className="text-stone-400 font-mono text-xs ml-0.5">AI</span>
              </span>
            </Link>

            <p className="text-sm text-neutral-400 max-w-sm leading-relaxed tracking-tight">
              Turn passive lecture recordings into an active private tutor. Structured pedagogical planning, real-time voice office hours, and verifiable timestamps with receipts.
            </p>
          </div>

          {/* Col 2: Product (2 cols) */}
          <div className="md:col-span-2 flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white">Product</span>
            <a href="#features" className="text-xs hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-xs hover:text-white transition-colors">How it Works</a>
            <Link href="/workspace" className="text-xs hover:text-white transition-colors">Workspace</Link>
          </div>

          {/* Col 3: Architecture (3 cols) */}
          <div className="md:col-span-3 flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white">Architecture</span>
            <span className="text-xs text-neutral-500">Autonomous Planning Engine</span>
            <span className="text-xs text-neutral-500">Vector Knowledge Base (pgvector)</span>
            <span className="text-xs text-neutral-500">Turn-Based Voice Orchestration</span>
            <span className="text-xs text-neutral-500">Whisper ASR + Timestamp Sync</span>
          </div>

          {/* Col 4: Community (2 cols) */}
          <div className="md:col-span-2 flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white">Community</span>
            <a href="https://github.com/U7ama/blindspot-edu" target="_blank" rel="noopener noreferrer" className="text-xs hover:text-white transition-colors flex items-center gap-1.5">
              <Github className="w-3.5 h-3.5" />
              <span>GitHub repository</span>
            </a>
            <span className="text-xs text-neutral-500">Documentation</span>
            <span className="text-xs text-neutral-500">Research Paper</span>
          </div>
        </div>

        {/* Bottom copyright row */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div>
            <span>&copy; {new Date().getFullYear()} Blindspot Edu. Built for the modern learner.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-neutral-300 transition-colors">Privacy Protocol</Link>
            <Link href="/terms" className="hover:text-neutral-300 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

