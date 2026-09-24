"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowRight, RotateCcw, Play, Pause, Sparkles } from "lucide-react";

const steps = [
  {
    label: "Discover",
    title: "One missing step. A whole new perspective.",
    tag: "Inferred prerequisite",
    text: "A lecture uses ratios. Equivalent fractions might be the step you need first.",
    actionText: "See the knowledge check",
    actionIcon: "arrow",
    timeRange: "00:00 – 05:20",
    cue: "03:45 • Inferred prerequisite identified",
  },
  {
    label: "Check",
    title: "Start with what you already know.",
    tag: "Illustrative diagnostic",
    text: "Which fraction represents the same share as ½?",
    actionText: "",
    actionIcon: "",
    timeRange: "05:20 – 11:40",
    cue: "08:15 • Diagnostic checkpoint",
  },
  {
    label: "Learn",
    title: "Make the missing connection.",
    tag: "Supplementary teaching",
    text: "Split each half into two equal pieces. The whole now has four pieces, and your half contains two: ½ = ²⁄₄.",
    actionText: "Return to the journey",
    actionIcon: "return",
    timeRange: "11:40 – 18:00",
    cue: "14:20 • Worked pedagogical explanation",
  },
];

const BASE_HEIGHTS = [
  14, 22, 38, 50, 32, 46, 62, 78, 56, 38, 24, 16,
  18, 32, 58, 76, 48, 66, 82, 60, 42, 26, 18, 14,
  18, 34, 56, 76, 86, 68, 48, 34, 24, 18, 14, 12,
];

function playHarmonicTone(stepIndex: number) {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Pentatonic frequencies: C5 (523Hz), E5 (659Hz), G5 (784Hz)
    const notes = [523.25, 659.25, 783.99];
    const freq = notes[stepIndex % notes.length];

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // AudioContext blocked or unsupported; silent fallback
  }
}

export default function JourneyPreview() {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playhead, setPlayhead] = useState(4); // Default near step 0

  const waveRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;

  const item = steps[step];

  // Pause autoplay if user prefers reduced motion
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsPlaying(false);
    }
  }, []);

  const handleSeek = useCallback((barIndex: number) => {
    const targetStep = Math.min(2, Math.floor(barIndex / 12));
    setStep(targetStep);
    setAnswer("");
    setPlayhead(barIndex);
    playHarmonicTone(targetStep);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!waveRef.current) return;
    const rect = waveRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = x / rect.width;
    const bar = Math.min(35, Math.floor(pct * 36));
    setHoveredBar(bar);
    setHoverPercent(pct * 100);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHoveredBar(null);
    setHoverPercent(null);
  }, []);

  const handleWaveClick = useCallback(() => {
    if (hoveredBar !== null) {
      handleSeek(hoveredBar);
    }
  }, [hoveredBar, handleSeek]);

  // Synchronize playhead loop when isPlaying is active and user is not actively inspecting
  useEffect(() => {
    if (!isPlaying || hoveredBar !== null) return;
    const interval = setInterval(() => {
      setPlayhead((prev) => {
        const next = (prev + 0.25) % 36;
        const currentPhase = Math.min(2, Math.floor(next / 12));
        setStep((currentStep) => {
          if (currentStep !== currentPhase) {
            return currentPhase;
          }
          return currentStep;
        });
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, hoveredBar]);

  const togglePlay = () => {
    const willPlay = !isPlaying;
    setIsPlaying(willPlay);
    if (willPlay) {
      playHarmonicTone(step);
    }
  };

  // Get metadata for currently hovered or active bar
  const activeInspectBar = hoveredBar !== null ? hoveredBar : Math.floor(playhead);
  const activeInspectPhase = Math.min(2, Math.floor(activeInspectBar / 12));
  const inspectStep = steps[activeInspectPhase];
  const barMinutes = Math.floor((activeInspectBar / 36) * 18);
  const barSeconds = Math.floor(((activeInspectBar / 36) * 18 * 60) % 60);
  const formattedTime = `${String(barMinutes).padStart(2, "0")}:${String(barSeconds).padStart(2, "0")}`;

  return (
    <section className="journey-preview" aria-label="Interactive learning flow illustration">
      <div className="preview-top">
        <span className="live-dot" />
        <span className="font-semibold tracking-wider text-[var(--ink)]">THE LEARNING LOOP</span>
        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent-ink)] hover:text-[var(--accent-ink)] transition-all cursor-pointer shadow-xs active:scale-95"
            aria-label={isPlaying ? "Pause lecture simulation" : "Play lecture simulation"}
          >
            {isPlaying ? (
              <Pause className="w-3 h-3 text-[var(--accent-ink)] shrink-0" />
            ) : (
              <Play className="w-3 h-3 text-[var(--accent-ink)] shrink-0" />
            )}
            <span>{isPlaying ? "Pause loop" : "Preview loop"}</span>
          </button>
          <span className="text-[10px] text-[var(--muted-ink)] hidden sm:inline">Interactive preview</span>
        </div>
      </div>

      {/* Interactive Waveform with Scrubbing, Hover Ripples, and Sound feedback */}
      <div
        ref={waveRef}
        className="waveform group"
        role="slider"
        aria-label="Interactive lecture audio waveform. Scrub to change lecture phase."
        aria-valuemin={0}
        aria-valuemax={35}
        aria-valuenow={activeInspectBar}
        tabIndex={0}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleWaveClick}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            handleSeek(Math.min(35, Math.floor(playhead) + 4));
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            handleSeek(Math.max(0, Math.floor(playhead) - 4));
          } else if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            togglePlay();
          }
        }}
      >
        {/* Hover / Playhead position indicator badge */}
        {hoverPercent !== null && (
          <div
            className="absolute top-2 z-20 pointer-events-none -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-md bg-[var(--surface)] border border-[var(--accent-ink)] shadow-md text-[10px] font-medium text-[var(--ink)] flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: `${hoverPercent}%` }}
          >
            <span className="font-mono text-[var(--accent-ink)] font-semibold">{formattedTime}</span>
            <span className="text-[var(--muted-ink)]">•</span>
            <span>{inspectStep.label}: {inspectStep.tag}</span>
            <span className="text-[9px] text-[var(--muted-ink)] font-normal hidden sm:inline">(Click to jump)</span>
          </div>
        )}

        {/* Playhead Vertical Line */}
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--accent-ink)] pointer-events-none transition-[left] duration-75 z-10 opacity-70"
          style={{
            left: `${((hoveredBar !== null ? hoveredBar : playhead) / 35) * 100}%`,
          }}
        />

        {/* Audio Waveform Bars */}
        {BASE_HEIGHTS.map((baseH, i) => {
          const barPhase = Math.min(2, Math.floor(i / 12));
          const isPhaseActive = barPhase === step;

          // Interactive physics: Gaussian ripple calculation for hovered cursor
          let height = baseH;
          let isHoveredRipple = false;

          if (hoveredBar !== null) {
            const dist = Math.abs(i - hoveredBar);
            if (dist <= 4) {
              const boost = Math.exp(-Math.pow(dist / 2, 2)) * 26;
              height += boost;
              isHoveredRipple = true;
            }
          } else if (isPlaying) {
            const distToPlayhead = Math.abs(i - playhead);
            if (distToPlayhead <= 2) {
              height += (3 - distToPlayhead) * 6;
            }
          }

          return (
            <i
              key={i}
              className={`${isPhaseActive ? "active-step-bar" : ""} ${
                isHoveredRipple ? "hover-bar" : ""
              }`}
              style={{
                height: `${Math.min(92, Math.max(8, height))}px`,
                backgroundColor: isPhaseActive || isHoveredRipple ? "var(--accent-ink)" : undefined,
                opacity: isHoveredRipple ? 1 : isPhaseActive ? 0.95 : 0.35,
              }}
            />
          );
        })}
      </div>

      {/* Step Tabs */}
      <div className="preview-tabs" aria-label="Preview steps">
        {steps.map((s, i) => (
          <button
            key={s.label}
            type="button"
            aria-pressed={step === i}
            onClick={() => {
              setStep(i);
              setAnswer("");
              setPlayhead(i * 12 + 4);
              playHarmonicTone(i);
            }}
          >
            <span>0{i + 1}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Step Content */}
      <div key={step} className="preview-body">
        <span className="eyebrow">{item.tag}</span>
        <h2>{item.title}</h2>
        <p>{item.text}</p>

        {step === 1 ? (
          <div className="preview-answers">
            {["2/4", "1/4"].map((a) => (
              <button
                key={a}
                type="button"
                className="ui-button ui-secondary"
                onClick={() => {
                  setAnswer(a);
                  playHarmonicTone(a === "2/4" ? 2 : 1);
                }}
              >
                {a}
              </button>
            ))}
            {answer && (
              <p role="status" className="w-full mt-3 text-xs leading-relaxed text-[var(--muted-ink)]">
                <span>
                  {answer === "2/4"
                    ? "Correct for this example. Two quarters equal one half."
                    : "Try dividing each half into two. Let’s look at the explanation."}
                </span>{" "}
                <button
                  type="button"
                  className="text-link inline-flex items-center gap-1.5 whitespace-nowrap align-middle group font-semibold ml-1 cursor-pointer"
                  onClick={() => {
                    setStep(2);
                    setPlayhead(28);
                    playHarmonicTone(2);
                  }}
                >
                  <span>Show explanation</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 inline-block align-middle transition-transform duration-200 group-hover:translate-x-1" />
                </button>
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="text-link mt-4 inline-flex items-center gap-1.5 whitespace-nowrap group text-left cursor-pointer"
            onClick={() => {
              const nextStep = step === 0 ? 1 : 0;
              setStep(nextStep);
              setAnswer("");
              setPlayhead(nextStep * 12 + 4);
              playHarmonicTone(nextStep);
            }}
          >
            <span className="font-semibold">{item.actionText}</span>
            {item.actionIcon === "arrow" && (
              <ArrowRight className="w-3.5 h-3.5 shrink-0 inline-block align-middle transition-transform duration-200 group-hover:translate-x-1" />
            )}
            {item.actionIcon === "return" && (
              <RotateCcw className="w-3.5 h-3.5 shrink-0 inline-block align-middle transition-transform duration-200 group-hover:-rotate-45" />
            )}
          </button>
        )}
      </div>

      <div className="preview-note flex items-center justify-between text-[10px] text-[var(--muted-ink)]">
        <span>Illustrative example · Your lessons use your recording’s evidence.</span>
        <span className="font-mono text-[var(--accent-ink)] font-medium hidden sm:inline">
          {item.timeRange}
        </span>
      </div>
    </section>
  );
}
