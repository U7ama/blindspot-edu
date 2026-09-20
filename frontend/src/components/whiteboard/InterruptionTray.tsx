'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Hand,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Play,
  RotateCcw,
  X,
  Volume2,
  HelpCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import {
  CanvasObject,
  InterruptionResponse,
  InterruptionState,
  TimingMark,
  WhiteboardLessonBeat,
} from '@/lib/whiteboard/types';
import { SpeechRecognizer } from '@/lib/whiteboard/speechRecognizer';
import { API_BASE_URL } from '@/lib/api';
import { AudioSyncEngine } from '@/lib/whiteboard/audioSyncEngine';
import { applyCommand } from '@/lib/whiteboard/commandInterpreter';
import { compileDeicticContext } from '@/lib/whiteboard/perceptionEngine';

interface InterruptionTrayProps {
  isOpen: boolean;
  onClose: () => void;
  currentBoardObjects: CanvasObject[];
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>;
  onCommitAction: (newObjects: CanvasObject[]) => void;
  activeLesson: WhiteboardLessonBeat | null;
  currentTimestampMs: number;
  onResumeLesson: () => void;
  onTriggerHighlight: (targetId: string, color: string, durationMs: number) => void;
  selectedObject?: CanvasObject | null;
}

const DEFAULT_QUESTIONS = [
  'Why is this component placed here?',
  'What does this arrow represent?',
  'Can you clarify the formula being used?',
  'What happens if we change the values?',
];

export const InterruptionTray: React.FC<InterruptionTrayProps> = ({
  isOpen,
  onClose,
  currentBoardObjects,
  setObjects,
  onCommitAction,
  activeLesson,
  currentTimestampMs,
  onResumeLesson,
  onTriggerHighlight,
  selectedObject,
}) => {
  const [questionText, setQuestionText] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [state, setState] = useState<InterruptionState>('INTERRUPTED_LISTENING');
  const [qaResponse, setQaResponse] = useState<InterruptionResponse | null>(null);
  const [activeWordIdx, setActiveWordIdx] = useState<number>(-1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const answerAudioEngineRef = useRef<AudioSyncEngine | null>(null);

  const deicticInfo = compileDeicticContext(selectedObject || null, currentBoardObjects);

  // Dynamic context questions when an object is selected
  const contextQuestions = selectedObject
    ? [
        `What is this ${deicticInfo?.label || selectedObject.type} and what is its purpose?`,
        `Why is this ${deicticInfo?.label || selectedObject.type} connected here?`,
        `What happens if we remove or change this ${selectedObject.type}?`,
        'Can you give another example of this?',
      ]
    : DEFAULT_QUESTIONS;

  // Initialize SpeechRecognizer
  useEffect(() => {
    recognizerRef.current = new SpeechRecognizer();
    return () => {
      recognizerRef.current?.stop();
      answerAudioEngineRef.current?.stop();
    };
  }, []);

  // When tray opens, reset state
  useEffect(() => {
    if (isOpen) {
      setState('INTERRUPTED_LISTENING');
      setQaResponse(null);
      setActiveWordIdx(-1);
      setErrorMsg(null);
      if (selectedObject) {
        setQuestionText(`What is this ${deicticInfo?.label || selectedObject.type}?`);
      } else {
        setQuestionText('');
      }
    } else {
      recognizerRef.current?.stop();
      answerAudioEngineRef.current?.stop();
    }
  }, [isOpen, selectedObject]);

  if (!isOpen) return null;

  // Toggle Voice STT Recording
  const toggleRecording = () => {
    if (!recognizerRef.current) return;

    if (isRecording) {
      recognizerRef.current.stop();
      setIsRecording(false);
    } else {
      setErrorMsg(null);
      recognizerRef.current.start(
        (transcript, isFinal) => {
          setQuestionText(transcript);
          if (isFinal) {
            setIsRecording(false);
          }
        },
        (err) => {
          console.warn('STT Error:', err);
          setIsRecording(false);
          if (err === 'not-allowed') {
            setErrorMsg('Microphone access denied. You can type your question below.');
          }
        }
      );
      setIsRecording(true);
    }
  };

  // Submit Question to /api/whiteboard/interruption
  const handleSubmitQuestion = async () => {
    if (!questionText.trim()) return;

    try {
      setState('AI_THINKING');
      setErrorMsg(null);
      recognizerRef.current?.stop();
      setIsRecording(false);

      const focusedList = selectedObject
        ? [
            {
              id: selectedObject.id,
              type: selectedObject.type,
              label: (selectedObject.geometry as any).label || (selectedObject.geometry as any).text,
              summary: deicticInfo?.summary,
              connectedArrows: deicticInfo?.connectedArrows,
            },
          ]
        : [];

      const payload = {
        student_query: questionText,
        current_board_objects: currentBoardObjects,
        active_lesson_context: {
          lessonId: activeLesson?.id || 'lesson',
          lessonTitle: activeLesson?.title || 'Whiteboard Lesson',
          speechScript: activeLesson?.speechScript || '',
          currentTimestampMs,
        },
        focused_objects: focusedList,
      };

      const res = await fetch(`${API_BASE_URL}/api/whiteboard/interruption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Q&A failed with HTTP ${res.status}`);
      }

      const data: InterruptionResponse = await res.json();
      setQaResponse(data);
      setState('AI_ANSWERING');

      // Play answer audio & sync clarification commands
      playAnswerAudio(data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to get answer from teacher');
      setState('INTERRUPTED_LISTENING');
    }
  };

  // Play AI's clarifying voice & apply visual commands
  const playAnswerAudio = (data: InterruptionResponse) => {
    if (answerAudioEngineRef.current) {
      answerAudioEngineRef.current.stop();
    }

    let appliedObjects = [...currentBoardObjects];

    const engine = new AudioSyncEngine({
      onWordBoundary: (mark, wordIdx) => {
        setActiveWordIdx(wordIdx);

        // Check if any clarification command triggers on this word
        const match = data.clarificationCommands.find(
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
            appliedObjects = applyCommand(appliedObjects, match.command);
            setObjects(appliedObjects);
            onCommitAction(appliedObjects);
          }
        }
      },
      onEnded: () => {
        setState('READY_TO_RESUME');
        setActiveWordIdx(-1);
      },
      onError: (e) => {
        console.warn('Clarification audio error:', e);
        setState('READY_TO_RESUME');
      },
    });

    engine.load(data.audioUrl, data.timingMarks);
    engine.play();
    answerAudioEngineRef.current = engine;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl p-5 text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl">
              <Hand className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white flex items-center gap-2">
                Hand Raised — Lesson Paused
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Step 6 Q&A
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Lesson frozen at {Math.round(currentTimestampMs / 1000)}s • Ask your question below
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              onClose();
              onResumeLesson();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Close and Resume"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* State: LISTENING / ASKING */}
        {(state === 'INTERRUPTED_LISTENING' || state === 'AI_THINKING') && (
          <div className="space-y-3">
            {/* Deictic Focus Badge if object is selected */}
            {selectedObject && (
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
                  </span>
                  <span className="font-semibold text-indigo-300">
                    Pointing at: <span className="text-white">{deicticInfo?.label || selectedObject.type}</span>
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                  ID: {selectedObject.id}
                </span>
              </div>
            )}

            {/* Quick Questions */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                {selectedObject ? 'Suggested Questions for this Component' : 'Quick Questions'}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {contextQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => setQuestionText(q)}
                    className="px-2.5 py-1 bg-slate-950/80 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 text-[11px] transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Input & Voice Controls */}
            <div className="space-y-2">
              <div className="relative">
                <textarea
                  rows={3}
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="Speak into microphone or type your question..."
                  className="w-full bg-slate-950 p-3 pr-12 rounded-xl border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-amber-500 resize-none font-sans"
                />

                {/* Mic Button */}
                <button
                  onClick={toggleRecording}
                  className={`absolute right-2.5 bottom-3.5 p-2 rounded-xl border transition-all ${
                    isRecording
                      ? 'bg-rose-600 border-rose-500 text-white animate-pulse shadow-md shadow-rose-600/40'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                  title={isRecording ? 'Stop Recording' : 'Start Voice Input'}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>

              {isRecording && (
                <div className="flex items-center gap-2 text-xs text-rose-400 font-mono animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>Listening to your voice... Speak now</span>
                </div>
              )}

              {state === 'AI_THINKING' && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1 h-5">
                      <span className="w-1 h-full bg-amber-400 rounded-full animate-acoustic-bar" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-full bg-amber-400 rounded-full animate-acoustic-bar" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-full bg-amber-400 rounded-full animate-acoustic-bar" style={{ animationDelay: '300ms' }} />
                      <span className="w-1 h-full bg-amber-400 rounded-full animate-acoustic-bar" style={{ animationDelay: '100ms' }} />
                      <span className="w-1 h-full bg-amber-400 rounded-full animate-acoustic-bar" style={{ animationDelay: '250ms' }} />
                    </div>
                    <span className="text-amber-300 font-medium">
                      Reviewing board & preparing visual response...
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400/80">Sub-50ms Sync</span>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => {
                  onClose();
                  onResumeLesson();
                }}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Nevermind, Resume Lesson
              </button>

              <button
                onClick={handleSubmitQuestion}
                disabled={state === 'AI_THINKING' || !questionText.trim()}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/30 transition-all active:scale-95"
              >
                {state === 'AI_THINKING' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Teacher Thinking...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Ask Teacher
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* State: AI ANSWERING / READY TO RESUME */}
        {(state === 'AI_ANSWERING' || state === 'READY_TO_RESUME') && qaResponse && (
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-950/90 rounded-xl border border-amber-500/30 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-amber-400 font-semibold">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Teacher Clarification</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span>Speaking</span>
                </div>
              </div>

              {/* Karaoke Spoken Answer */}
              <div className="flex flex-wrap gap-1 leading-relaxed text-xs p-2.5 bg-slate-900/90 rounded-lg border border-slate-800">
                {qaResponse.timingMarks.map((mark, idx) => {
                  const isCurrent = idx === activeWordIdx;
                  const isPassed = activeWordIdx > idx;
                  return (
                    <span
                      key={idx}
                      className={`px-1 py-0.5 rounded transition-all duration-75 ${
                        isCurrent
                          ? 'bg-amber-500 text-slate-950 font-bold scale-105 ring-1 ring-amber-300'
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

              {qaResponse.clarificationCommands.length > 0 && (
                <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Applied visual focus to diagram elements</span>
                </div>
              )}
            </div>

            {/* Resume Button */}
            <button
              onClick={() => {
                onClose();
                onResumeLesson();
              }}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Resume Main Lecture</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
