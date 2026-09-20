"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Compass,
  Link as LinkIcon,
  Network,
  Headphones,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: Compass,
    badge: "Pedagogical Planning",
    title: "Re-engineered for learning, not just summarized",
    description:
      "Lectures are linear, unedited recordings. Blindspot Edu's planner restructures 50-minute monologues into coherent, progressive learning phases with clear pedagogical goals.",
    stat: "100% structured",
  },
  {
    icon: LinkIcon,
    badge: "Timestamp Traceability",
    title: "Every taught concept comes with source receipts",
    description:
      "Never wonder if the AI made it up. Ask 'Where did the professor say that?' and instantly jump to the exact second in the original recording with high-precision alignment.",
    stat: "<0.1s precision",
  },
  {
    icon: Network,
    badge: "Blindspot Graph",
    title: "Surfaces the gaps the lecture left behind",
    description:
      "When an instructor skips prerequisites or assumes prior knowledge, Blindspot autonomously identifies the under-explained concepts and constructs an interactive concept graph.",
    stat: "Automated graph",
  },
  {
    icon: Headphones,
    badge: "Voice-Based Office Hours",
    title: "An active TA you can interrupt and quiz with",
    description:
      "Learn phase-by-phase with a conversational voice agent. Ask for deeper explanations, request analogies, or launch instant diagnostic MCQ quizzes anytime.",
    stat: "Real-time voice",
  },
];

export const FeaturesSection: React.FC = () => {
  return (
    <section id="features" className="relative py-24 sm:py-32 w-full">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center mb-16 sm:mb-20">
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-tight mb-4"
          >
            Recorded lectures are not the same as{" "}
            <span className="bg-gradient-to-r from-stone-100 via-stone-300 to-stone-400 bg-clip-text text-transparent">
              being taught.
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-base sm:text-lg text-neutral-400 max-w-xl font-normal leading-relaxed tracking-tight"
          >
            Blindspot transforms passive audio into an interactive, verifiable
            educational experience tailored to how your brain retains knowledge.
          </motion.p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {features.map((item, idx) => (
            <motion.div
              key={item.badge}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 24,
                delay: idx * 0.08,
              }}
              whileHover={{ y: -4 }}
              className="group h-full"
            >
              <Card className="relative h-full rounded-lg border-white/5 bg-neutral-900/40 p-6 sm:p-8 backdrop-blur-md transition-all duration-300 hover:border-primary/40 hover:bg-neutral-900/60 shadow-lg flex flex-col justify-between overflow-hidden">
                {/* Subtle card hover glow */}
                <div className="pointer-events-none absolute -inset-px rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[radial-gradient(400px_circle_at_top_right,rgba(112,26,36,0.12),transparent_80%)]" />

                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 border border-primary/30 text-neutral-200 group-hover:scale-105 transition-transform duration-200">
                      <item.icon className="h-5 w-5" strokeWidth={1.75} />
                    </div>
                    <span className="text-[11px] font-mono text-neutral-500">
                      {item.stat}
                    </span>
                  </div>

                  <Badge
                    variant="outline"
                    className="mb-3 rounded-md border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider text-rose-300"
                  >
                    {item.badge}
                  </Badge>

                  <h3 className="text-lg font-semibold tracking-tight text-neutral-100 mb-2">
                    {item.title}
                  </h3>

                  <p className="text-sm text-neutral-400 leading-relaxed tracking-tight font-normal">
                    {item.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-neutral-500 font-medium">
                  <span className="group-hover:text-neutral-300 transition-colors flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Built into core engine
                  </span>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
