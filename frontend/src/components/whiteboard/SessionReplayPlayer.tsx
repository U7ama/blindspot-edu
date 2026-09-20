'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Sparkles,
  Award,
  Hand,
  Layers,
  ChevronRight,
  ChevronLeft,
  FastForward,
  Film,
} from 'lucide-react';
import {
  CanvasObject,
  SessionEvent,
  ViewportTransform,
  WhiteboardSessionRecord,
} from '@/lib/whiteboard/types';
import { AudioSyncEngine } from '@/lib/whiteboard/audioSyncEngine';
import { applyCommand } from '@/lib/whiteboard/commandInterpreter';

interface SessionReplayPlayerProps {
  session: WhiteboardSessionRecord | null;
  objects: CanvasObject[];
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>;
  onCommitAction: (newObjects: CanvasObject[]) => void;
  setViewport: React.Dispatch<React.SetStateAction<ViewportTransform>>;
  onTriggerHighlight: (targetId: string, color: string, durationMs: number) => void;
}

export const SessionReplayPlayer: React.FC<SessionReplayPlayerProps> = ({
  session,
  objects,
  setObjects,
  onCommitAction,
  setViewport,
  onTriggerHighlight,
}) => {
  const [currentEventIdx, setCurrentEventIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeWordIdx, setActiveWordIdx] = useState<number>(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);

  const audioEngineRef = useRef<AudioSyncEngine | null>(null);
  const events = session?.events || [];

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioEngineRef.current?.stop();
    };
  }, []);

  const activeEvent = events[currentEventIdx] || null;

  // Jump to specific event
  const jumpToEvent = (idx: number) => {
    if (idx < 0 || idx >= events.length) return;

    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
    }
    setIsPlaying(false);
    setActiveWordIdx(-1);
    setCurrentEventIdx(idx);

    const targetEvent = events[idx];
    if (targetEvent) {
      setObjects(targetEvent.resultingObjects || []);
      onCommitAction(targetEvent.resultingObjects || []);
    }
  };

  // Play/Pause active event
  const togglePlay = () => {
    if (!activeEvent) return;

    if (isPlaying) {
      audioEngineRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (activeEvent.audioUrl && activeEvent.timingMarks) {
        if (!audioEngineRef.current) {
          const engine = new AudioSyncEngine({
            onWordBoundary: (mark, wordIdx) => {
              setActiveWordIdx(wordIdx);

              // Check if any command triggers on this word
              const match = activeEvent.commands.find(
                (c) =>
                  c.triggerWord &&
                  mark.word.toLowerCase().includes(c.triggerWord.toLowerCase())
              );

              if (match) {
                if (match.command.op === 'highlight') {
                  onTriggerHighlight(
                    match.command.targetId,
                    match.command.color || '#FBBF24',
                    match.command.durationMs || 1800
                  );
                } else {
                  setObjects((prev) => {
                    const updated = applyCommand(prev, match.command);
                    onCommitAction(updated);
                    return updated;
                  });
                }
              }
            },
            onEnded: () => {
              setIsPlaying(false);
              setActiveWordIdx(-1);
              // Auto-advance to next event if available
              if (currentEventIdx + 1 < events.length) {
                setTimeout(() => jumpToEvent(currentEventIdx + 1), 600);
              }
            },
            onError: (e) => {
              console.warn('Replay audio error:', e);
              setIsPlaying(false);
            },
          });

          engine.load(activeEvent.audioUrl, activeEvent.timingMarks);
          audioEngineRef.current = engine;
        }

        audioEngineRef.current.setPlaybackRate(playbackSpeed);
        audioEngineRef.current.play();
        setIsPlaying(true);
      } else {
        // Silent event or drawing event
        setIsPlaying(true);
        setTimeout(() => {
          setIsPlaying(false);
          if (currentEventIdx + 1 < events.length) {
            jumpToEvent(currentEventIdx + 1);
          }
        }, 1500);
      }
    }
  };

  const handleSpeedCycle = () => {
    const speeds = [0.75, 1.0, 1.25, 1.5];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackSpeed(nextSpeed);
    audioEngineRef.current?.setPlaybackRate(nextSpeed);
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'lecture_beat':
        return {
          label: 'Teacher Lecture',
          icon: Film,
          color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        };
      case 'student_interruption':
        return {
          label: 'Student Q&A',
          icon: Hand,
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        };
      case 'student_drawing':
        return {
          label: 'Student Solution',
          icon: Sparkles,
          color: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        };
      case 'teacher_review':
        return {
          label: 'AI Review & Grade',
          icon: Award,
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        };
      default:
        return {
          label: 'Chapter',
          icon: Layers,
          color: 'bg-slate-800 text-slate-300 border-slate-700',
        };
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-4 pointer-events-auto">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-indigo-500/30 rounded-2xl shadow-2xl p-4 text-slate-100 flex flex-col gap-3">
        {/* Header & Milestone Chapters */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Replay Studio & Study Notes</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Step 9
                </span>
              </h3>
              <p className="text-[10px] text-slate-400">
                Session: {session?.title || 'Interactive Learning Session'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSpeedCycle}
              className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-mono"
            >
              {playbackSpeed}x
            </button>
            <span className="text-[11px] font-mono text-slate-400">
              Chapter {currentEventIdx + 1} / {Math.max(1, events.length)}
            </span>
          </div>
        </div>

        {/* Milestone Chapters Navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
          {events.map((ev, idx) => {
            const isSelected = idx === currentEventIdx;
            const badge = getEventBadge(ev.type);
            const Icon = badge.icon;
            return (
              <button
                key={ev.id || idx}
                onClick={() => jumpToEvent(idx)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 shrink-0 transition-all ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/30 scale-105'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{ev.title || badge.label}</span>
              </button>
            );
          })}
        </div>

        {/* Live Spoken Karaoke Transcript */}
        {activeEvent?.speechText && (
          <div className="px-3 py-2 bg-slate-950/80 rounded-xl border border-slate-800/80 flex flex-wrap gap-1 leading-snug text-xs min-h-[38px] items-center">
            {activeEvent.timingMarks && activeEvent.timingMarks.length > 0 ? (
              activeEvent.timingMarks.map((mark, idx) => {
                const isCurrent = idx === activeWordIdx;
                const isPassed = activeWordIdx > idx;
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
              })
            ) : (
              <span className="text-slate-300">{activeEvent.speechText}</span>
            )}
          </div>
        )}

        {/* Bottom Playback Controls */}
        <div className="flex items-center justify-between pt-0.5">
          <button
            onClick={() => jumpToEvent(currentEventIdx - 1)}
            disabled={currentEventIdx === 0}
            className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 rounded-lg hover:bg-slate-800 transition-colors"
            title="Previous Chapter"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => jumpToEvent(0)}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Restart from Beginning"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95 transition-all text-xs"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'Pause Chapter' : 'Play Chapter'}</span>
            </button>
          </div>

          <button
            onClick={() => jumpToEvent(currentEventIdx + 1)}
            disabled={currentEventIdx >= events.length - 1}
            className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 rounded-lg hover:bg-slate-800 transition-colors"
            title="Next Chapter"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
