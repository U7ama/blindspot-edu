'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Wand2,
  X,
  Radio,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Zap,
  GraduationCap,
  Layers,
} from 'lucide-react';
import { MultiStageCourseRecord, WhiteboardLessonBeat } from '@/lib/whiteboard/types';
import { API_BASE_URL } from '@/lib/api';

interface AILessonGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLessonGenerated: (lesson: WhiteboardLessonBeat) => void;
  onCourseGenerated?: (course: MultiStageCourseRecord) => void;
}

const PRESET_TOPICS = [
  {
    id: 'physics',
    title: "Newton's 2nd Law & Force Vectors",
    prompt: "Explain Newton's Second Law (F = m * a) visually with a mass block and applied force arrow.",
    tag: 'Physics',
  },
  {
    id: 'algorithms',
    title: 'Binary Search Algorithm Steps',
    prompt: 'Explain how Binary Search eliminates half the search space using midpoint comparisons.',
    tag: 'CS',
  },
  {
    id: 'biology',
    title: 'Photosynthesis Light Reactions',
    prompt: 'Explain photosynthesis light-dependent reactions showing sunlight, chloroplast, and ATP synthesis.',
    tag: 'Biology',
  },
  {
    id: 'web',
    title: 'HTTP Request-Response Lifecycle',
    prompt: 'Explain how a client browser sends an HTTP GET request to a web server and receives a 200 OK response.',
    tag: 'Networking',
  },
];

export const AILessonGeneratorModal: React.FC<AILessonGeneratorModalProps> = ({
  isOpen,
  onClose,
  onLessonGenerated,
  onCourseGenerated,
}) => {
  const [prompt, setPrompt] = useState<string>(PRESET_TOPICS[0].prompt);
  const [generationType, setGenerationType] = useState<'multi_stage' | 'single_beat'>('multi_stage');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    try {
      setIsGenerating(true);
      setErrorMsg(null);

      if (generationType === 'multi_stage') {
        setGenerationStep('Planning 3-4 stage masterclass curriculum & layout...');
        const res = await fetch(`${API_BASE_URL}/api/whiteboard/course/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: prompt }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Course generation failed with HTTP ${res.status}`);
        }

        const data = await res.json();
        const courseRecord: MultiStageCourseRecord = {
          syllabus: data.syllabus,
          stages: { 1: data.stage1 },
          currentStageIndex: 1,
        };

        setGenerationStep('Stage 1 ready! Pre-generating remaining stages in background...');
        setTimeout(() => {
          setIsGenerating(false);
          if (onCourseGenerated) {
            onCourseGenerated(courseRecord);
          }
          onClose();
        }, 400);
      } else {
        setGenerationStep('Designing vector layout & teaching narrative with LLM...');
        const res = await fetch(`${API_BASE_URL}/api/whiteboard/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Generation failed with HTTP ${res.status}`);
        }

        setGenerationStep('Synthesizing neural voice & extracting timing marks...');
        const lesson: WhiteboardLessonBeat = await res.json();

        setGenerationStep('Synchronizing speech with vector draw commands...');
        setTimeout(() => {
          setIsGenerating(false);
          onLessonGenerated(lesson);
          onClose();
        }, 400);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to generate AI lesson');
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-indigo-500/40 rounded-2xl shadow-2xl p-5 text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-sky-500 rounded-xl shadow-md text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white flex items-center gap-2">
                Generate Live Lesson with AI
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Step 5
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                The LLM writes the narrative, positions vector shapes, and aligns timing marks.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Generation Type Selector */}
        <div className="flex items-center gap-2 p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setGenerationType('multi_stage')}
            disabled={isGenerating}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
              generationType === 'multi_stage'
                ? 'bg-gradient-to-r from-indigo-600 to-sky-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GraduationCap className="w-4 h-4 text-amber-300" />
            <span>Multi-Stage Masterclass (Deep Dive)</span>
          </button>

          <button
            type="button"
            onClick={() => setGenerationType('single_beat')}
            disabled={isGenerating}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
              generationType === 'single_beat'
                ? 'bg-gradient-to-r from-indigo-600 to-sky-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4 text-sky-300" />
            <span>Single Concept (Fast 1-Beat)</span>
          </button>
        </div>

        {/* Preset Prompt Buttons */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Quick Topics
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_TOPICS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPrompt(p.prompt)}
                disabled={isGenerating}
                className={`p-2.5 rounded-xl border text-left transition-all text-xs flex flex-col gap-1 ${
                  prompt === p.prompt
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{p.title}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                    {p.tag}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 line-clamp-1">{p.prompt}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Topic Input Area */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Teaching Prompt or Concept
          </label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isGenerating}
            placeholder="Type any concept to explain visually on the whiteboard..."
            className="w-full bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 resize-none font-sans"
          />
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Progress State */}
        {isGenerating && (
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
            <span className="text-xs text-indigo-200 font-medium">{generationStep}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Powered by Groq LLM + Edge-TTS
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-3.5 py-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 disabled:opacity-40 text-white rounded-xl font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  Generate Live Lesson
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
