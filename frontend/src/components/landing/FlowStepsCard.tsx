"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles, Lightbulb, Target, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlowStepItem {
  step_number: number;
  title: string;
  detail: string;
}

interface FlowStepsCardProps {
  flowSteps?: FlowStepItem[] | null;
  keyTakeaway?: string | null;
  analogy?: string | null;
  className?: string;
}

export const FlowStepsCard: React.FC<FlowStepsCardProps> = ({
  flowSteps,
  keyTakeaway,
  analogy,
  className,
}) => {
  if (!flowSteps?.length && !keyTakeaway && !analogy) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "mt-3 pt-3 border-t border-white/[0.08] space-y-2.5 text-xs",
        className
      )}
    >
      {/* 1. Visual Flow Steps Chain */}
      {flowSteps && flowSteps.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-sky-400">
            <Sparkles className="w-3 h-3" />
            <span>Process Breakdown</span>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-1">
            {flowSteps.map((step, idx) => (
              <div
                key={`flow-step-${step.step_number || idx}`}
                className="relative flex items-start gap-2.5 p-2.5 rounded-xl bg-zinc-900/80 border border-white/[0.06] hover:border-sky-500/30 transition-colors"
              >
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-mono font-bold text-[10px] shrink-0 mt-0.5 shadow-sm">
                  {step.step_number || idx + 1}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-neutral-200 text-xs">
                    {step.title}
                  </div>
                  <div className="text-[11px] text-neutral-400 leading-relaxed">
                    {step.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Quick Analogy Badge */}
      {analogy && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-semibold text-amber-300">Analogy: </span>
            {analogy}
          </div>
        </div>
      )}

      {/* 3. Key Takeaway Badge */}
      {keyTakeaway && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200">
          <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-semibold text-emerald-300">Key Takeaway: </span>
            {keyTakeaway}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default FlowStepsCard;
