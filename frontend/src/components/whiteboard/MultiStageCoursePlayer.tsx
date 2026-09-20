'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  ChevronRight,
  ChevronLeft,
  Hand,
  GraduationCap,
  Sparkles,
  Layers,
  Loader2,
  CheckCircle2,
  FastForward,
} from 'lucide-react';
import {
  CanvasObject,
  CourseStageBeat,
  CourseSyllabus,
  MultiStageCourseRecord,
  TimedDrawCommand,
  TimingMark,
  ViewportTransform,
} from '@/lib/whiteboard/types';
import { AudioSyncEngine } from '@/lib/whiteboard/audioSyncEngine';
import { applyCommand } from '@/lib/whiteboard/commandInterpreter';
import { API_BASE_URL } from '@/lib/api';

interface MultiStageCoursePlayerProps {
  course: MultiStageCourseRecord | null;
  onUpdateCourse: (updated: MultiStageCourseRecord) => void;
  objects: CanvasObject[];
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>;
  onCommitAction: (newObjects: CanvasObject[]) => void;
  viewport: ViewportTransform;
  setViewport: React.Dispatch<React.SetStateAction<ViewportTransform>>;
  onTriggerHighlight: (targetId: string, color: string, durationMs: number) => void;
  onRaiseHand: (currentTimestampMs: number) => void;
}

export const MultiStageCoursePlayer: React.FC<MultiStageCoursePlayerProps> = ({
  course,
  onUpdateCourse,
  objects,
  setObjects,
  onCommitAction,
  viewport,
  setViewport,
  onTriggerHighlight,
  onRaiseHand,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [loadingStageIndex, setLoadingStageIndex] = useState<number | null>(null);

  const audioEngineRef = useRef<AudioSyncEngine | null>(null);
  const objectsRef = useRef<CanvasObject[]>(objects);
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  const syllabus = course?.syllabus;
  const currentStageIndex = course?.currentStageIndex || 1;
  const currentStageBeat: CourseStageBeat | null = course?.stages[currentStageIndex] || null;

  // Background Pre-fetcher: Pre-loads next stages sequentially into memory
  useEffect(() => {
    if (!syllabus) return;

    const prefetchNextStages = async () => {
      for (const stageOutline of syllabus.stages) {
        const sIdx = stageOutline.stageIndex;
        // If not in cache, fetch it in background
        if (course && !course.stages[sIdx]) {
          try {
            const res = await fetch(
              `${API_BASE_URL}/api/whiteboard/course/${syllabus.courseId}/stage/${sIdx}`
            );
            if (res.ok) {
              const stageData: CourseStageBeat = await res.json();
              onUpdateCourse({
                ...course,
                stages: {
                  ...course.stages,
                  [sIdx]: stageData,
                },
              });
            }
          } catch (e) {
            // Background pre-fetch silent catch
          }
        }
      }
    };

    const timer = setTimeout(prefetchNextStages, 600);
    return () => clearTimeout(timer);
  }, [syllabus, course, onUpdateCourse]);

  // When stage changes or loads, initialize audio sync engine
  useEffect(() => {
    if (!currentStageBeat) return;

    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
    }

    setIsPlaying(false);
    setActiveWordIndex(-1);
    setCurrentTimeMs(0);

    // Initial camera glide to this stage's territory
    if (currentStageBeat.cameraFocus) {
      setViewport((prev) => ({
        ...prev,
        x: currentStageBeat.cameraFocus.x,
        y: currentStageBeat.cameraFocus.y,
        scale: currentStageBeat.cameraFocus.scale,
      }));
    }

    let appliedObjects = [...objectsRef.current];

    const engine = new AudioSyncEngine({
      onTimeUpdate: (timeMs) => {
        setCurrentTimeMs(timeMs);
      },
      onWordBoundary: (mark, wordIndex) => {
        setActiveWordIndex(wordIndex);

        // Check if any timed command triggers on this spoken word
        const matchingCommands = currentStageBeat.timedCommands.filter(
          (tc) =>
            tc.triggerWord &&
            mark.word.toLowerCase().includes(tc.triggerWord.toLowerCase())
        );

        for (const tc of matchingCommands) {
          const cmd = tc.command;
          if (cmd.op === 'highlight') {
            onTriggerHighlight(cmd.targetId, cmd.color || '#FBBF24', cmd.durationMs || 1800);
          } else if (cmd.op === 'pan_zoom') {
            setViewport((v) => ({
              ...v,
              x: cmd.x,
              y: cmd.y,
              scale: cmd.scale || v.scale,
            }));
          } else {
            appliedObjects = applyCommand(appliedObjects, cmd);
            setObjects(appliedObjects);
            onCommitAction(appliedObjects);
          }
        }
      },
      onEnded: () => {
        setIsPlaying(false);
        setActiveWordIndex(-1);

        // Auto-advance to next stage if enabled
        if (autoAdvance && syllabus && currentStageIndex < syllabus.totalStages) {
          setTimeout(() => {
            handleGoToStage(currentStageIndex + 1);
          }, 1000);
        }
      },
      onError: (e) => {
        console.warn('Stage audio playback error:', e);
        setIsPlaying(false);
      },
    }, 75);

    engine.load(currentStageBeat.audioUrl, currentStageBeat.timingMarks);
    audioEngineRef.current = engine;

    return () => {
      engine.stop();
    };
  }, [currentStageBeat?.stageIndex]);

  if (!course || !syllabus) return null;

  // Jump to specific stage with graceful retries if still processing in backend
  const handleGoToStage = async (targetStageIndex: number) => {
    if (targetStageIndex < 1 || targetStageIndex > syllabus.totalStages) return;

    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
    }
    setIsPlaying(false);

    // If stage is already cached in memory
    if (course.stages[targetStageIndex]) {
      onUpdateCourse({
        ...course,
        currentStageIndex: targetStageIndex,
      });
      return;
    }

    // Otherwise fetch on-demand with up to 5 retries
    setLoadingStageIndex(targetStageIndex);
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const res = await fetch(
          `${API_BASE_URL}/api/whiteboard/course/${syllabus.courseId}/stage/${targetStageIndex}`
        );
        if (res.ok) {
          const stageData: CourseStageBeat = await res.json();
          onUpdateCourse({
            ...course,
            stages: {
              ...course.stages,
              [targetStageIndex]: stageData,
            },
            currentStageIndex: targetStageIndex,
          });
          setLoadingStageIndex(null);
          return;
        }
        // Wait 1.5s before retry if backend is still generating
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        if (attempts >= maxAttempts) {
          console.warn(`Stage ${targetStageIndex} generation timeout:`, e);
          setLoadingStageIndex(null);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    setLoadingStageIndex(null);
  };

  const togglePlay = () => {
    if (!audioEngineRef.current || !currentStageBeat) return;
    if (isPlaying) {
      audioEngineRef.current.pause();
      setIsPlaying(false);
    } else {
      audioEngineRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleReset = () => {
    if (!audioEngineRef.current) return;
    audioEngineRef.current.seek(0);
    setActiveWordIndex(-1);
    setCurrentTimeMs(0);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-4 pointer-events-auto">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-indigo-500/40 rounded-2xl shadow-2xl p-4 text-slate-100 flex flex-col gap-3">
        {/* Course Header & Stepper */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <span>{syllabus.title}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                  Multi-Stage Masterclass
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 truncate max-w-md">
                {syllabus.overview}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoAdvance(!autoAdvance)}
              className={`px-2 py-1 rounded-lg border text-[10px] font-mono transition-all ${
                autoAdvance
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              Auto-Advance {autoAdvance ? 'ON' : 'OFF'}
            </button>
            <span className="text-xs font-mono text-slate-400">
              Stage {currentStageIndex} of {syllabus.totalStages}
            </span>
          </div>
        </div>

        {/* Interactive Stage Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 scrollbar-none">
          {syllabus.stages.map((stageOutline) => {
            const sIdx = stageOutline.stageIndex;
            const isCurrent = sIdx === currentStageIndex;
            const isCached = !!course.stages[sIdx];
            const isLoadingThis = loadingStageIndex === sIdx;

            return (
              <button
                key={sIdx}
                onClick={() => handleGoToStage(sIdx)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-2 shrink-0 transition-all ${
                  isCurrent
                    ? 'bg-gradient-to-r from-indigo-600 to-sky-600 border-indigo-400 text-white shadow-md shadow-indigo-600/30 scale-105'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-900/80 text-[10px] font-mono flex items-center justify-center font-bold">
                  {isLoadingThis ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-300" />
                  ) : (
                    sIdx
                  )}
                </span>
                <span className="truncate max-w-[140px]">{stageOutline.title}</span>
                {isCached && !isLoadingThis && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Pre-fetched & Ready" />
                )}
              </button>
            );
          })}
        </div>

        {/* Live Spoken Karaoke Transcript for Active Stage or Inline Loader */}
        {loadingStageIndex !== null ? (
          <div className="px-3.5 py-2.5 bg-slate-950/90 rounded-xl border border-indigo-500/30 flex items-center justify-between min-h-[46px]">
            <div className="flex items-center gap-2 text-xs text-indigo-200">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>Preparing Stage {loadingStageIndex}... (Synthesizing Voice & Diagrams)</span>
            </div>
            <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20 animate-pulse">
              AI Processing
            </span>
          </div>
        ) : currentStageBeat ? (
          <div className="px-3.5 py-2.5 bg-slate-950/90 rounded-xl border border-slate-800 flex flex-wrap gap-1 leading-relaxed text-xs min-h-[46px] items-center">
            {currentStageBeat.timingMarks.map((mark, idx) => {
              const isCurrent = idx === activeWordIndex;
              const isPassed = activeWordIndex > idx;
              return (
                <span
                  key={idx}
                  className={`px-1 py-0.5 rounded transition-all duration-75 ${
                    isCurrent
                      ? 'bg-indigo-600 text-white font-bold scale-105 ring-1 ring-indigo-400 shadow-md shadow-indigo-600/50'
                      : isPassed
                      ? 'text-slate-400'
                      : 'text-slate-200'
                  }`}
                >
                  {mark.raw_word}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Loading Stage {currentStageIndex}...</span>
          </div>
        )}

        {/* Bottom Playback & Stage Progression Controls */}
        <div className="flex items-center justify-between pt-0.5">
          {/* Previous Stage */}
          <button
            onClick={() => handleGoToStage(currentStageIndex - 1)}
            disabled={currentStageIndex <= 1 || loadingStageIndex !== null}
            className="px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950/80 text-slate-300 hover:text-white disabled:opacity-30 text-xs font-semibold flex items-center gap-1 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev Stage</span>
          </button>

          {/* Center Audio Controls */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleReset}
              disabled={loadingStageIndex !== null}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors"
              title="Restart Current Stage"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              disabled={!currentStageBeat || loadingStageIndex !== null}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 hover:from-indigo-500 hover:to-sky-400 disabled:opacity-40 text-white font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95 transition-all text-xs"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'Pause Lesson' : 'Play Stage'}</span>
            </button>

            {/* Raise Hand Interruption */}
            <button
              onClick={() => onRaiseHand(currentTimeMs)}
              disabled={loadingStageIndex !== null}
              className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 disabled:opacity-30 transition-all"
              title="Raise Hand to Ask Question (H)"
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Raise Hand</span>
            </button>
          </div>

          {/* Next Stage */}
          <button
            onClick={() => handleGoToStage(currentStageIndex + 1)}
            disabled={currentStageIndex >= syllabus.totalStages || loadingStageIndex !== null}
            className="px-3 py-1.5 rounded-xl border border-indigo-500/40 hover:border-indigo-500 bg-indigo-600/20 text-indigo-300 hover:text-white disabled:opacity-30 text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            {loadingStageIndex !== null ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading Stage...</span>
              </>
            ) : (
              <>
                <span>Next Stage</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
