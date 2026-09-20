"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const steps = [
  {
    step: "01",
    title: "Ingest Lecture Audio",
    subtitle: "Raw Audio → Timestamped Ground Truth",
    description:
      "Drop any 50-minute classroom recording or paste a Zoom link. Blindspot parses speech audio with high-precision word-level alignment.",
    tag: "Multi-format Support",
  },
  {
    step: "02",
    title: "Synthesize & Plan",
    subtitle: "AI Teacher Architecture",
    description:
      "Our planning engine reorganizes unstructured lecture monologue into digestible teaching phases and identifies gaps where the instructor skipped prerequisite steps.",
    tag: "Concept Graph Extraction",
  },
  {
    step: "03",
    title: "Active Learning & Receipts",
    subtitle: "Voice Delivery + Source Verification",
    description:
      "Listen, interrupt, and ask clarifying questions. If you ever doubt a claim, jump directly to that exact second in the original audio.",
    tag: "Instant Timestamp Seek",
  },
];

export const HowItWorksSection: React.FC = () => {
  return (
    <section id="how-it-works" className="relative py-24 sm:py-32 w-full border-t border-white/5 bg-neutral-950/80">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center mb-16 sm:mb-20">
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-tight mb-4"
          >
            From passive audio to an active masterclass in three steps.
          </motion.h2>

          <p className="text-base sm:text-lg text-neutral-400 max-w-xl font-normal leading-relaxed tracking-tight">
            Designed to turn confusing, rushed lectures into structured clarity you can actually retain.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 relative">
          {steps.map((item, idx) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 24,
                delay: idx * 0.1,
              }}
              whileHover={{ y: -4 }}
              className="h-full"
            >
              <Card className="group relative h-full rounded-lg p-6 sm:p-8 bg-neutral-900/40 border-white/5 backdrop-blur-md flex flex-col justify-between hover:border-primary/40 hover:bg-neutral-900/60 transition-all duration-300 shadow-lg overflow-hidden">
                {/* Subtle card hover glow */}
                <div className="pointer-events-none absolute -inset-px rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[radial-gradient(350px_circle_at_top_right,rgba(112,26,36,0.12),transparent_80%)]" />

                <div>
                  <div className="flex items-center justify-between mb-5">
                    <span className="font-mono text-2xl font-bold text-neutral-200 group-hover:text-rose-300 transition-colors">
                      {item.step}
                    </span>
                    <Badge
                      variant="outline"
                      className="rounded-md font-mono text-[10px] uppercase text-neutral-400 border-white/10 bg-white/[0.02] px-2 py-0.5"
                    >
                      {item.tag}
                    </Badge>
                  </div>

                  <h3 className="text-lg font-semibold tracking-tight text-neutral-100 mb-1.5">
                    {item.title}
                  </h3>
                  <h4 className="text-xs font-medium text-rose-300/80 mb-3 tracking-tight">
                    {item.subtitle}
                  </h4>

                  <p className="text-sm text-neutral-400 leading-relaxed font-normal tracking-tight">
                    {item.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 flex items-center text-xs text-neutral-500 gap-2 font-medium">
                  <Check className="w-3.5 h-3.5 text-primary" />
                  <span>Autonomous orchestration</span>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
