"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Bookmark,
  Sparkles,
  ExternalLink,
  Network,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  Volume2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PhaseItem {
  id: number;
  title: string;
  duration: string;
  durationSec: number;
  timestamp: string;
  summary: string;
  tutorScript: string;
  alternativeScript: string;
  quote: string;
  speaker: string;
  gapConcept?: string;
}

const samplePhases: PhaseItem[] = [
  {
    id: 1,
    title: "1. Foundations of Supply & Demand",
    duration: "04:15",
    durationSec: 255,
    timestamp: "03:12",
    summary: "Market mechanisms and price signals in competitive environments.",
    tutorScript:
      "The intersection of supply and demand curves establishes the market-clearing equilibrium price. When quantity demanded matches quantity supplied, the system maintains dynamic balance without external intervention.",
    alternativeScript:
      "Think of buyers and sellers at a bustling farmers market. If apples are too expensive, boxes sit unsold until vendors lower prices. If prices are too low, lines form until prices rise.",
    quote:
      "...at this exact intersection point, every buyer willing to pay the market price finds a willing seller, clearing the market without artificial shortages.",
    speaker: "Prof. Sterling",
  },
  {
    id: 2,
    title: "2. Price Elasticity of Demand (PED)",
    duration: "06:40",
    durationSec: 400,
    timestamp: "14:22",
    summary: "Measuring consumer responsiveness to incremental price fluctuations.",
    tutorScript:
      "Think of price elasticity of demand like a rubber band. When a product is highly elastic, even a tiny stretch in price causes consumer demand to snap back dramatically. When inelastic, consumers absorb the price change without altering their purchasing volume.",
    alternativeScript:
      "If the price of luxury coffee goes up 20%, people easily switch to tea (elastic). But if life-saving medicine doubles in price, people still have to buy it (inelastic).",
    quote:
      "...when elasticity is greater than one, consumer demand responds disproportionately to any price adjustment, causing total revenue to move in the opposite direction of the price change.",
    speaker: "Prof. Sterling",
    gapConcept: "Cross-Price Elasticity",
  },
  {
    id: 3,
    title: "3. Equilibrium Shifting & Elasticity",
    duration: "08:10",
    durationSec: 490,
    timestamp: "23:45",
    summary: "How exogenous shocks alter market equilibrium across varying elasticities.",
    tutorScript:
      "When an external supply shock occurs—like a sudden resource constraint—the degree of price increase versus quantity reduction is dictated entirely by the elasticity slope of the corresponding demand curve.",
    alternativeScript:
      "Imagine an oil refinery disruption. Because fuel demand is relatively inelastic in the short run, prices spike dramatically while driving habits adjust slowly.",
    quote:
      "...a steep, inelastic curve forces the market price to absorb the brunt of any supply shift, whereas a flat elastic curve forces the quantity to adjust.",
    speaker: "Prof. Sterling",
  },
  {
    id: 4,
    title: "4. Deadweight Loss & Market Surpluses",
    duration: "09:30",
    durationSec: 570,
    timestamp: "38:10",
    summary: "Welfare economics, consumer surplus, and allocative inefficiency.",
    tutorScript:
      "Deadweight loss represents the economic value that evaporates when market interventions prevent mutually beneficial transactions. It is the unrealized gains from trade that neither consumer, producer, nor government captures.",
    alternativeScript:
      "Imagine two people who would gladly trade a book for $15, but a regulation requires a $10 fee. The trade never happens, and that potential satisfaction simply disappears.",
    quote:
      "...the deadweight loss triangle is essentially lost social welfare—transactions that would have made both parties better off are blocked.",
    speaker: "Prof. Sterling",
  },
];

interface QuizState {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  receiptTimestamp: string;
}

const sampleQuiz: QuizState = {
  question:
    "If the Price Elasticity of Demand (PED) for a good is 2.5 and a firm decreases its price by 10%, what is the expected change in quantity demanded?",
  options: [
    "Quantity demanded increases by 25%",
    "Quantity demanded decreases by 25%",
    "Quantity demanded increases by 2.5%",
    "Quantity demanded remains unchanged",
  ],
  correctIndex: 0,
  explanation:
    "PED = (% Change in Quantity Demanded) / (% Change in Price). With PED = 2.5 and a 10% price drop: % Change in Quantity = 2.5 × 10% = +25%.",
  receiptTimestamp: "14:22",
};

export const InteractivePlayerPreview: React.FC = () => {
  const [activePhaseIndex, setActivePhaseIndex] = useState<number>(1); // Phase 2 default
  const [activeTab, setActiveTab] = useState<"teach" | "receipts" | "graph">("teach");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSeconds, setPlaybackSeconds] = useState<number>(105); // 01:45
  const [showQuiz, setShowQuiz] = useState<boolean>(false);
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(null);
  const [isAlternativeScript, setIsAlternativeScript] = useState<boolean>(false);

  const currentPhase = samplePhases[activePhaseIndex];

  // Playback timer simulation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setPlaybackSeconds((prev) => {
          if (prev >= currentPhase.durationSec) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentPhase.durationSec]);

  const formatSeconds = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  const handlePhaseSelect = (index: number) => {
    setActivePhaseIndex(index);
    setPlaybackSeconds(0);
    setIsPlaying(false);
    setShowQuiz(false);
    setSelectedQuizOption(null);
    setIsAlternativeScript(false);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const targetSec = Math.round(percentage * currentPhase.durationSec);
    setPlaybackSeconds(targetSec);
  };

  const progressPercentage = Math.min(
    100,
    (playbackSeconds / currentPhase.durationSec) * 100
  );

  return (
    <section id="traceability" className="relative py-24 sm:py-32 w-full border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white max-w-2xl leading-tight mb-4"
          >
            Your lecture recording, taught properly —{" "}
            <span className="bg-gradient-to-r from-blue-400 to-blue-200 bg-clip-text text-transparent">
              with receipts.
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-base sm:text-lg text-neutral-400 max-w-xl font-normal leading-relaxed tracking-tight"
          >
            Seamlessly toggle between conversational voice teaching, verifiable lecture timestamps, and the autonomous concept graph.
          </motion.p>
        </div>

        {/* Mock Application Interface Container */}
        <div className="relative rounded-3xl bg-neutral-900/60 border border-white/[0.08] shadow-[0_20px_70px_rgba(0,0,0,0.8)] backdrop-blur-2xl overflow-hidden p-4 sm:p-8">
          
          {/* Top App Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-semibold">
                  Session Active
                </span>
                <span className="text-[11px] font-mono text-neutral-500">
                  // {currentPhase.timestamp} → {currentPhase.duration}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Principles of Economics &amp; Market Dynamics — Lecture 04: Market Equilibrium &amp; Elasticity
              </h3>
            </div>

            {/* Tab switchers with Emil Spring Morphing indicator */}
            <div className="flex items-center gap-1.5 bg-neutral-950/80 p-1.5 rounded-xl border border-white/[0.08] relative">
              {[
                { key: "teach", label: "Voice Tutor" },
                { key: "receipts", label: "Source Receipts" },
                { key: "graph", label: "Blindspot Graph" },
              ].map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key as "teach" | "receipts" | "graph");
                      if (tab.key !== "teach") setShowQuiz(false);
                    }}
                    className={cn(
                      "relative z-10 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-colors cursor-pointer select-none",
                      isActive ? "text-white" : "text-neutral-400 hover:text-neutral-200"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activePreviewTab"
                        className="absolute inset-0 rounded-lg bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.45)]"
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 30,
                        }}
                      />
                    )}
                    <span className="relative z-20">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main App Body */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6">
            
            {/* Left: Phase Navigator */}
            <div className="lg:col-span-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between mb-1 px-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-400">
                  Learning Roadmap ({samplePhases.length} Phases)
                </span>
                <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                  Phase {activePhaseIndex + 1} of {samplePhases.length}
                </span>
              </div>

              {samplePhases.map((phase, idx) => {
                const isSelected = activePhaseIndex === idx;
                return (
                  <motion.div
                    key={phase.id}
                    onClick={() => handlePhaseSelect(idx)}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "relative p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between overflow-hidden",
                      isSelected
                        ? "border-blue-500/40 text-white shadow-[0_0_20px_rgba(59,130,246,0.15)]"
                        : "bg-white/[0.02] border-white/[0.06] text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
                    )}
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="activePhaseHighlight"
                        className="absolute inset-0 bg-blue-500/10 -z-0"
                        transition={{
                          type: "spring",
                          stiffness: 350,
                          damping: 28,
                        }}
                      />
                    )}

                    <div className="relative z-10 flex flex-col text-left pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold tracking-tight">
                          {phase.title}
                        </span>
                        {phase.gapConcept && (
                          <span className="text-[9px] font-mono text-amber-400 font-semibold">
                            Gap
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-neutral-500 mt-0.5">
                        Source timestamp: {phase.timestamp}
                      </span>
                    </div>

                    <span className="relative z-10 text-[11px] font-mono text-neutral-400 flex-shrink-0">
                      {phase.duration}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {/* Right: Dynamic Interactive Content Area */}
            <div className="lg:col-span-8 rounded-2xl bg-neutral-950/70 border border-white/[0.08] p-6 flex flex-col justify-between min-h-[340px]">
              <AnimatePresence mode="wait">
                {activeTab === "teach" && (
                  <motion.div
                    key={`tab-teach-${activePhaseIndex}-${showQuiz}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col justify-between h-full"
                  >
                    {!showQuiz ? (
                      /* Tutor View */
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                              <Sparkles className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-bold text-white tracking-tight">
                              Conversational Teaching Companion
                            </span>
                          </div>
                          <span className="text-xs text-blue-400 font-mono">
                            Phase {activePhaseIndex + 1} / {samplePhases.length}
                          </span>
                        </div>

                        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 text-xs text-neutral-300 leading-relaxed font-normal mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider font-mono">
                              {isAlternativeScript ? "Alternative Analogy:" : "Tutor Synthesis:"}
                            </span>
                            <span className="text-[10px] font-mono text-neutral-500">
                              Target Concept: {currentPhase.title.split(". ")[1]}
                            </span>
                          </div>

                          <p className="text-neutral-200">
                            &quot;
                            {isAlternativeScript
                              ? currentPhase.alternativeScript
                              : currentPhase.tutorScript}
                            &quot;
                          </p>

                          <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.05]">
                            <button
                              onClick={() => setActiveTab("receipts")}
                              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg hover:bg-blue-500/20 transition-colors cursor-pointer"
                            >
                              <span>Verify: Instructor audio at {currentPhase.timestamp}</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>

                            {currentPhase.gapConcept && (
                              <button
                                onClick={() => setActiveTab("graph")}
                                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer"
                              >
                                <HelpCircle className="w-3 h-3" />
                                <span>1 Skipped Prerequisite Detected</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Emil Kowalski Diagnostic Quiz View */
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10 text-blue-400 font-mono text-xs font-bold">
                              Q
                            </span>
                            <span className="text-xs font-bold text-white tracking-tight">
                              Instant Diagnostic Check
                            </span>
                          </div>
                          <button
                            onClick={() => setShowQuiz(false)}
                            className="text-[11px] font-mono text-neutral-400 hover:text-white transition-colors"
                          >
                            Close Quiz ×
                          </button>
                        </div>

                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-3">
                          <p className="text-xs font-semibold text-white mb-3">
                            {sampleQuiz.question}
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {sampleQuiz.options.map((opt, idx) => {
                              const isSelected = selectedQuizOption === idx;
                              const isCorrect = idx === sampleQuiz.correctIndex;
                              return (
                                <motion.button
                                  key={opt}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => setSelectedQuizOption(idx)}
                                  className={cn(
                                    "p-2.5 rounded-lg border text-left text-xs transition-all flex items-start gap-2 cursor-pointer",
                                    isSelected
                                      ? isCorrect
                                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                                        : "bg-red-500/10 border-red-500/40 text-red-300"
                                      : "bg-white/[0.03] border-white/[0.06] text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                                  )}
                                >
                                  <span className="font-mono text-[10px] opacity-60 mt-0.5">
                                    {String.fromCharCode(65 + idx)}.
                                  </span>
                                  <span className="flex-1">{opt}</span>
                                  {isSelected && isCorrect && (
                                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                  )}
                                </motion.button>
                              );
                            })}
                          </div>

                          {selectedQuizOption !== null && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px]"
                            >
                              <span className="text-neutral-300">
                                {sampleQuiz.explanation}
                              </span>
                              <button
                                onClick={() => setActiveTab("receipts")}
                                className="text-blue-400 hover:underline flex-shrink-0 font-mono ml-2 cursor-pointer"
                              >
                                View Receipt @ {sampleQuiz.receiptTimestamp}
                              </button>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Audio Player Controls & Interactive Scrubber */}
                    <div className="pt-4 border-t border-white/[0.06]">
                      {/* Scrubber Bar */}
                      <div
                        onClick={handleSeek}
                        className="group relative w-full h-2 rounded-full bg-white/[0.06] mb-3 cursor-pointer overflow-hidden"
                      >
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-600 via-blue-500 to-blue-400 rounded-full relative"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          <motion.button
                            whileTap={{ scale: 0.94 }}
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="h-9 w-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all cursor-pointer"
                          >
                            {isPlaying ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4 ml-0.5" />
                            )}
                          </motion.button>
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-white">
                              Synchronized Lecture Audio
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400">
                              {formatSeconds(playbackSeconds)} / {currentPhase.duration}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setIsAlternativeScript(!isAlternativeScript)}
                            className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-xs font-medium text-neutral-300 transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{isAlternativeScript ? "Standard Script" : "Simpler Analogy"}</span>
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setShowQuiz(!showQuiz)}
                            className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-xs font-medium text-blue-400 border border-blue-500/20 transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <HelpCircle className="w-3 h-3" />
                            <span>{showQuiz ? "Back to Voice" : "Diagnostic Quiz"}</span>
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === "receipts" && (
                  <motion.div
                    key="tab-receipts"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col h-full justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-white tracking-tight flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Source Timestamp Traceability (Receipt #{currentPhase.timestamp})
                        </span>
                        <span className="text-[11px] font-mono text-emerald-400">
                          98.4% Confidence Match
                        </span>
                      </div>

                      <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-500/30 text-xs text-neutral-300 leading-relaxed font-mono mb-4">
                        <p className="text-blue-300 font-semibold mb-1.5 flex items-center gap-2">
                          <span>[{currentPhase.timestamp} - {currentPhase.duration}] {currentPhase.speaker}:</span>
                          <span className="text-[10px] text-neutral-400 font-normal">
                            (Raw Audio Track #1)
                          </span>
                        </p>
                        <p className="text-neutral-200">
                          &quot;{currentPhase.quote}&quot;
                        </p>
                      </div>

                      {/* Waveform Micro Receipt Bar */}
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Volume2 className="w-4 h-4 text-blue-400" />
                          <span className="text-xs text-neutral-300 font-medium">
                            Waveform Segment Alignment
                          </span>
                        </div>
                        <div className="flex items-center gap-1 h-4">
                          {[40, 70, 90, 60, 100, 80, 50, 85, 95, 60, 75, 45, 90, 65, 80].map(
                            (height, i) => (
                              <div
                                key={i}
                                className="w-1 bg-blue-500/60 rounded-full"
                                style={{ height: `${height}%` }}
                              />
                            )
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-neutral-400 flex items-center justify-between pt-4 border-t border-white/[0.06]">
                      <span>Original Audio Chunk ID: #chunk-882</span>
                      <span className="text-blue-400 font-mono">
                        Timestamp linked directly to raw audio recording
                      </span>
                    </div>
                  </motion.div>
                )}

                {activeTab === "graph" && (
                  <motion.div
                    key="tab-graph"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col h-full justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-white tracking-tight flex items-center gap-2">
                          <Network className="w-4 h-4 text-blue-400" />
                          Autonomous Concept Graph &amp; Gap Detection
                        </span>
                        <span className="text-[11px] font-mono text-amber-400">
                          1 Blindspot / Gap Identified
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <motion.div
                          whileHover={{ y: -2 }}
                          className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center"
                        >
                          <span className="text-xs font-bold text-white block">
                            Market Equilibrium
                          </span>
                          <span className="text-[10px] text-emerald-400 font-medium">
                            Taught thoroughly
                          </span>
                        </motion.div>
                        <motion.div
                          whileHover={{ y: -2 }}
                          className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-center shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                        >
                          <span className="text-xs font-bold text-blue-300 block">
                            Price Elasticity (PED)
                          </span>
                          <span className="text-[10px] text-blue-400 font-medium">
                            Current Teaching Phase
                          </span>
                        </motion.div>
                        <motion.div
                          whileHover={{ y: -2 }}
                          className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                        >
                          <span className="text-xs font-bold text-amber-300 block">
                            Cross-Price Elasticity
                          </span>
                          <span className="text-[10px] text-amber-400 font-medium">
                            Instructor Skipped (Blindspot)
                          </span>
                        </motion.div>
                      </div>

                      <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-neutral-300">
                        <p className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Auto-Generated Prerequisite Primer</span>
                        </p>
                        <p className="text-[11px] text-neutral-400 leading-relaxed">
                          The lecture assumed familiarity with substitute and complementary goods without defining cross-price formulas. Blindspot auto-injected a 90-second foundation bridge.
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-400 pt-3 border-t border-white/[0.06]">
                      Blindspot Edu bridges conceptual gaps by auto-generating primer notes for prerequisites skipped by the speaker.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default InteractivePlayerPreview;

