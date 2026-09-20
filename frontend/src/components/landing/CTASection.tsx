"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export const CTASection: React.FC = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className="relative py-24 sm:py-32 w-full overflow-hidden border-t border-white/5 bg-neutral-950">
      {/* Glow highlight */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-primary/10 blur-[140px] rounded-full" />

      <div className="max-w-5xl mx-auto px-6 sm:px-8 relative z-10 text-center flex flex-col items-center">
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-3xl sm:text-5xl font-bold tracking-tight text-white max-w-2xl leading-tight mb-6"
        >
          Stop scrubbing through 50-minute recordings blind.
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-base sm:text-lg text-neutral-400 max-w-xl mb-10 leading-relaxed font-normal tracking-tight"
        >
          Upload your first lecture recording today. Get phase-by-phase active teaching, concept gap discovery, and verifiable source timestamps.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-center gap-4"
        >
          <Button
            size="lg"
            onClick={scrollToTop}
            className="h-11 rounded-md px-6 text-sm font-medium tracking-tight shadow-md shadow-primary/25 transition-all gap-2 cursor-pointer"
          >
            <span>Drop a lecture now</span>
            <ArrowUp className="w-4 h-4" />
          </Button>

          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-11 rounded-md border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:text-white text-neutral-300 px-6 text-sm font-medium tracking-tight gap-2"
          >
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>View Architecture Blueprint</span>
              <ArrowRight className="w-4 h-4 text-neutral-500" />
            </a>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
