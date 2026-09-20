'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sparkles,
  Zap,
  Layers,
  Radio,
  Hand,
} from 'lucide-react';
import {
  CanvasObject,
  ViewportTransform,
  WhiteboardLessonBeat,
} from '@/lib/whiteboard/types';
import { AudioSyncEngine } from '@/lib/whiteboard/audioSyncEngine';
import { SyncConductor } from '@/lib/whiteboard/syncConductor';
import {
  LESSON_CIRCUIT_SYNCHRONIZED,
  LESSON_BST_SYNCHRONIZED,
} from '@/lib/whiteboard/lessonPresets';

interface SynchronizedLessonPlayerProps {
  objects: CanvasObject[];
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>;
  onCommitAction: (newObjects: CanvasObject[]) => void;
  setViewport: React.Dispatch<React.SetStateAction<ViewportTransform>>;
  onTriggerHighlight: (targetId: string, color: string, durationMs: number) => void;
  activeLesson?: WhiteboardLessonBeat | null;
  onRaiseHand?: (currentTimeMs: number) => void;
}

export const SynchronizedLessonPlayer: React.FC<SynchronizedLessonPlayerProps> = ({
  objects,
  setObjects,
  onCommitAction,
  setViewport,
  onTriggerHighlight,
  activeLesson,
  onRaiseHand,
}) => {
  const [selectedLesson, setSelectedLesson] = useState<WhiteboardLessonBeat>(
    activeLesson || LESSON_CIRCUIT_SYNCHRONIZED
  );

  useEffect(() => {
    if (activeLesson) {
      setSelectedLesson(activeLesson);
    }
  }, [activeLesson]);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(
    selectedLesson.durationMs || 18000
  );
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  const audioEngineRef = useRef<AudioSyncEngine | null>(null);
  const conductorRef = useRef<SyncConductor>(new SyncConductor(selectedLesson));
  const prevTimeRef = useRef<number>(0);

  // Store latest callbacks in refs to prevent useEffect re-triggering
  const propsRef = useRef({
    onCommitAction,
    setObjects,
    setViewport,
    onTriggerHighlight,
  });

  useEffect(() => {
    propsRef.current = {
      onCommitAction,
      setObjects,
      setViewport,
      onTriggerHighlight,
    };
  }, [onCommitAction, setObjects, setViewport, onTriggerHighlight]);

  // Initialize Audio & Conductor only when selectedLesson changes
  useEffect(() => {
    const conductor = new SyncConductor(selectedLesson);
    conductorRef.current = conductor;
    setDurationMs(selectedLesson.durationMs || 18000);
    setCurrentTimeMs(0);
    setActiveWordIndex(-1);
    setIsPlaying(false);
    prevTimeRef.current = 0;

    // Reset canvas to empty initial state
    propsRef.current.setObjects([]);
    propsRef.current.onCommitAction([]);

    if (selectedLesson.initialViewport) {
      propsRef.current.setViewport(selectedLesson.initialViewport);
    }

    const audioEngine = new AudioSyncEngine({
      onTimeUpdate: (timeMs) => {
        setCurrentTimeMs(timeMs);

        // Process draw commands to fire
        const commandsToFire = conductor.getCommandsToFire(prevTimeRef.current, timeMs);
        if (commandsToFire.length > 0) {
          const updated = conductor.getCanvasStateAtTime(timeMs);
          propsRef.current.setObjects(updated);
          propsRef.current.onCommitAction(updated);

          // Handle highlights & pan/zoom
          for (const rc of commandsToFire) {
            const cmd = rc.command;
            if (cmd.op === 'highlight') {
              propsRef.current.onTriggerHighlight(
                cmd.targetId,
                cmd.color || '#818CF8',
                cmd.durationMs || 1500
              );
            } else if (cmd.op === 'pan_zoom') {
              propsRef.current.setViewport((v) => ({
                ...v,
                x: cmd.x,
                y: cmd.y,
                scale: cmd.scale || v.scale,
              }));
            }
          }
        }
        prevTimeRef.current = timeMs;
      },
      onWordBoundary: (mark, wordIndex) => {
        setActiveWordIndex(wordIndex);
      },
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
      onEnded: () => {
        setIsPlaying(false);
        setActiveWordIndex(-1);
      },
      onError: (err) => {
        console.warn('Lesson audio notification:', err);
      },
    });

    if (selectedLesson.audioUrl) {
      audioEngine.load(selectedLesson.audioUrl, selectedLesson.timingMarks || []);
    }

    audioEngineRef.current = audioEngine;

    return () => {
      audioEngine.stop();
    };
  }, [selectedLesson]);

  // Toggle Play / Pause
  const togglePlay = async () => {
    if (!audioEngineRef.current) return;
    if (isPlaying) {
      audioEngineRef.current.pause();
    } else {
      if (currentTimeMs >= durationMs - 100) {
        handleSeek(0);
      }
      await audioEngineRef.current.play();
    }
  };

  // Replay from start
  const handleReset = () => {
    if (!audioEngineRef.current) return;
    audioEngineRef.current.pause();
    handleSeek(0);
  };

  // Timeline scrubber seek
  const handleSeek = (newTimeMs: number) => {
    if (!audioEngineRef.current || !conductorRef.current) return;
    audioEngineRef.current.seek(newTimeMs);
    setCurrentTimeMs(newTimeMs);
    prevTimeRef.current = newTimeMs;

    // Reset fired flags and reconstruct exact canvas state at newTimeMs
    conductorRef.current.resetFiredState();
    const stateAtTime = conductorRef.current.getCanvasStateAtTime(newTimeMs);
    setObjects(stateAtTime);
    onCommitAction(stateAtTime);
  };

  // Cycle speed
  const handleSpeedCycle = () => {
    const nextSpeed =
      playbackSpeed === 0.75
        ? 1.0
        : playbackSpeed === 1.0
        ? 1.25
        : playbackSpeed === 1.25
        ? 1.5
        : 0.75;
    setPlaybackSpeed(nextSpeed);
    audioEngineRef.current?.setPlaybackRate(nextSpeed);
  };

  const progressPercent = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;
  const resolvedCmds = conductorRef.current.getResolvedCommands();

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-indigo-500/40 rounded-2xl p-3.5 shadow-2xl flex flex-col gap-2.5 text-slate-200">
        {/* Top: Lesson Selector & Live Sync Indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedLesson(LESSON_CIRCUIT_SYNCHRONIZED)}
              className={`px-3 py-1 rounded-lg transition-all font-semibold flex items-center gap-1.5 ${
                selectedLesson.id === LESSON_CIRCUIT_SYNCHRONIZED.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Circuit Lesson
            </button>
            <button
              onClick={() => setSelectedLesson(LESSON_BST_SYNCHRONIZED)}
              className={`px-3 py-1 rounded-lg transition-all font-semibold flex items-center gap-1.5 ${
                selectedLesson.id === LESSON_BST_SYNCHRONIZED.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              BST Lesson
            </button>
            {selectedLesson.id.startsWith('lesson-ai-') && (
              <div className="px-3 py-1 rounded-lg bg-gradient-to-r from-indigo-600 to-sky-600 text-white font-semibold flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" />
                <span className="max-w-[140px] truncate">{selectedLesson.title}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-mono">
              <Radio className="w-3 h-3 animate-pulse" />
              <span>Step 4 Audio-Visual Sync</span>
            </div>
            <button
              onClick={handleSpeedCycle}
              className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-mono"
            >
              {playbackSpeed}x
            </button>
          </div>
        </div>

        {/* Live Spoken Karaoke Transcript Subtitle */}
        <div className="px-3 py-2 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-wrap gap-1 leading-snug text-xs min-h-[38px] items-center">
          {selectedLesson.timingMarks?.map((mark, idx) => {
            const isCurrent = idx === activeWordIndex;
            const isPassed = activeWordIndex > idx;
            return (
              <span
                key={idx}
                className={`px-1 py-0.5 rounded transition-all duration-75 ${
                  isCurrent
                    ? 'bg-indigo-600 text-white font-bold scale-105 shadow-md shadow-indigo-600/50 ring-1 ring-indigo-400'
                    : isPassed
                    ? 'text-slate-400'
                    : 'text-slate-300'
                }`}
              >
                {mark.raw_word}
              </span>
            );
          })}
        </div>

        {/* Audio Timeline Scrubber with Command Milestone Pins */}
        <div className="space-y-1">
          <div className="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden cursor-pointer border border-slate-800 group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const ratio = Math.max(0, Math.min(1, clickX / rect.width));
              handleSeek(ratio * durationMs);
            }}
          >
            {/* Progress Fill */}
            <div
              className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-400 transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Command Trigger Markers on timeline */}
            {resolvedCmds.map((rc, i) => {
              const pinLeft = durationMs > 0 ? (rc.resolvedOffsetMs / durationMs) * 100 : 0;
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-1 bg-amber-400/80 rounded-full shadow-sm z-10"
                  style={{ left: `${pinLeft}%` }}
                  title={`Draw: ${rc.command.op} on "${rc.triggerWord || ''}" (${Math.round(rc.resolvedOffsetMs)}ms)`}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-0.5">
            <span>{formatTime(currentTimeMs)}</span>
            <span className="text-slate-500">
              {objects.length} canvas objects active
            </span>
            <span>{formatTime(durationMs)}</span>
          </div>
        </div>

        {/* Bottom Playback Controls */}
        <div className="flex items-center justify-center gap-3 pt-0.5">
          <button
            onClick={handleReset}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Restart Lesson"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95 transition-all text-xs"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? 'Pause Lesson' : 'Start Live Lesson'}</span>
          </button>

          {/* Step 6 Raise Hand Button */}
          <button
            onClick={() => {
              if (audioEngineRef.current) audioEngineRef.current.pause();
              setIsPlaying(false);
              onRaiseHand?.(currentTimeMs);
            }}
            className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold flex items-center gap-1.5 shadow-md shadow-amber-500/10 active:scale-95 transition-all text-xs"
            title="Raise Hand to Pause & Ask AI (Shortcut: H)"
          >
            <Hand className="w-4 h-4" />
            <span>Raise Hand</span>
          </button>
        </div>
      </div>
    </div>
  );
};

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000.0);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${tenths}`;
}
