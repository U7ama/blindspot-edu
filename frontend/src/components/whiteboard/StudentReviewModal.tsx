'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Volume2,
  Loader2,
  Award,
  ArrowRight,
} from 'lucide-react';
import {
  CanvasObject,
  TimedDrawCommand,
  TimingMark,
  WhiteboardLessonBeat,
} from '@/lib/whiteboard/types';
import { extractStudentWorkDiff, StudentWorkDiff } from '@/lib/whiteboard/studentInputAnalyzer';
import { AudioSyncEngine } from '@/lib/whiteboard/audioSyncEngine';
import { applyCommand } from '@/lib/whiteboard/commandInterpreter';
import { API_BASE_URL } from '@/lib/api';

interface StudentReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  objects: CanvasObject[];
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>;
  onCommitAction: (newObjects: CanvasObject[]) => void;
  activeLesson: WhiteboardLessonBeat | null;
  onTriggerHighlight: (targetId: string, color: string, durationMs: number) => void;
}

interface ReviewResult {
  status: 'correct' | 'partially_correct' | 'needs_improvement';
  scorePercent: number;
  feedbackSpeech: string;
  audioUrl: string;
  durationMs: number;
  timingMarks: TimingMark[];
  correctionCommands: TimedDrawCommand[];
}

export const StudentReviewModal: React.FC<StudentReviewModalProps> = ({
  isOpen,
  onClose,
  objects,
  setObjects,
  onCommitAction,
  activeLesson,
  onTriggerHighlight,
}) => {
  const [diff, setDiff] = useState<StudentWorkDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [activeWordIdx, setActiveWordIdx] = useState<number>(-1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const audioEngineRef = useRef<AudioSyncEngine | null>(null);

  useEffect(() => {
    if (isOpen) {
      const extracted = extractStudentWorkDiff(objects);
      setDiff(extracted);
      setReviewResult(null);
      setErrorMsg(null);
      setActiveWordIdx(-1);
    } else {
      audioEngineRef.current?.stop();
    }
  }, [isOpen, objects]);

  if (!isOpen) return null;

  const handleRunReview = async () => {
    if (!diff) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);

      const payload = {
        student_work_summary: diff.summaryDescription,
        all_board_objects: objects,
        lesson_context: {
          lessonId: activeLesson?.id || 'practice',
          lessonTitle: activeLesson?.title || 'Interactive Whiteboard Problem',
          speechScript: activeLesson?.speechScript || '',
        },
      };

      const res = await fetch(`${API_BASE_URL}/api/whiteboard/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Review failed with HTTP ${res.status}`);
      }

      const data: ReviewResult = await res.json();
      setReviewResult(data);
      setIsLoading(false);

      // Play vocal grading audio & apply corrections
      playReviewAudio(data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to analyze student work');
      setIsLoading(false);
    }
  };

  const playReviewAudio = (data: ReviewResult) => {
    if (audioEngineRef.current) audioEngineRef.current.stop();

    let appliedObjects = [...objects];

    const engine = new AudioSyncEngine({
      onWordBoundary: (mark, wordIdx) => {
        setActiveWordIdx(wordIdx);

        const match = data.correctionCommands.find(
          (c) =>
            c.triggerWord &&
            mark.word.toLowerCase().includes(c.triggerWord.toLowerCase())
        );

        if (match) {
          if (match.command.op === 'highlight') {
            onTriggerHighlight(
              match.command.targetId,
              match.command.color || '#34D399',
              match.command.durationMs || 2000
            );
          } else {
            appliedObjects = applyCommand(appliedObjects, match.command);
            setObjects(appliedObjects);
            onCommitAction(appliedObjects);
          }
        }
      },
      onEnded: () => {
        setActiveWordIdx(-1);
      },
      onError: (e) => {
        console.warn('Audio review playback error:', e);
      },
    });

    engine.load(data.audioUrl, data.timingMarks);
    engine.play();
    audioEngineRef.current = engine;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-emerald-500/40 rounded-2xl shadow-2xl p-6 text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl">
              <Award className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white flex items-center gap-2">
                AI Whiteboard Reviewer
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                  Step 8
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Evaluation of student-drawn formulas, shapes, and circuit connections
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {!reviewResult ? (
          <div className="space-y-4">
            {/* Detected Elements Summary */}
            <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="font-semibold text-slate-300 flex items-center justify-between">
                <span>Detected Student Contributions</span>
                <span className="text-emerald-400 font-mono">
                  {diff?.totalUserElements || 0} element(s)
                </span>
              </div>
              <pre className="text-[11px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed max-h-36 overflow-auto">
                {diff?.summaryDescription}
              </pre>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRunReview}
                disabled={isLoading || diff?.totalUserElements === 0}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Grading Your Solution...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Submit for AI Review
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Evaluation Results View */
          <div className="space-y-4">
            {/* Score & Status Badge */}
            <div className="p-3.5 bg-slate-950 rounded-xl border border-emerald-500/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-xs font-bold text-white capitalize">
                    {reviewResult.status.replace('_', ' ')}
                  </div>
                  <div className="text-[10px] text-slate-400">AI Assessment</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-emerald-400 font-mono">
                  {reviewResult.scorePercent}%
                </div>
                <div className="text-[10px] text-slate-500">Score</div>
              </div>
            </div>

            {/* Spoken Feedback Subtitles */}
            <div className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
                <span>Teacher Spoken Feedback</span>
                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>Speaking</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 leading-relaxed text-xs p-2.5 bg-slate-900/90 rounded-lg border border-slate-800">
                {reviewResult.timingMarks.map((mark, idx) => {
                  const isCurrent = idx === activeWordIdx;
                  const isPassed = activeWordIdx > idx;
                  return (
                    <span
                      key={idx}
                      className={`px-1 py-0.5 rounded transition-all duration-75 ${
                        isCurrent
                          ? 'bg-emerald-500 text-slate-950 font-bold scale-105 ring-1 ring-emerald-300'
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
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
            >
              <span>Done & Continue Working</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
