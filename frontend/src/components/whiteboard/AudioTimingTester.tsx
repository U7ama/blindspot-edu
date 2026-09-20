'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Clock,
  Mic,
  Activity,
  ListOrdered,
  X,
} from 'lucide-react';
import { TimingMark, TTSWithTimingResponse } from '@/lib/whiteboard/types';
import { AudioSyncEngine, fetchSpeechWithTiming } from '@/lib/whiteboard/audioSyncEngine';

const SAMPLE_SCRIPTS = [
  {
    id: 'sample-circuit',
    title: 'Circuit Explanation Script',
    text: "Let's construct our circuit. First, we place a 9-volt DC battery on the left, and connect a 100-ohm resistor on the right.",
  },
  {
    id: 'sample-bst',
    title: 'BST Traversal Script',
    text: 'Now observe our binary search tree. Root node is 50. When inserting 30, since 30 is smaller than 50, it branches left.',
  },
  {
    id: 'sample-physics',
    title: 'Physics Motion Script',
    text: 'A projectile is launched with initial velocity V zero at an angle theta relative to the ground.',
  },
];

interface AudioTimingTesterProps {
  onClose?: () => void;
}

export const AudioTimingTester: React.FC<AudioTimingTesterProps> = ({ onClose }) => {
  const [inputText, setInputText] = useState<string>(SAMPLE_SCRIPTS[0].text);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [ttsResult, setTtsResult] = useState<TTSWithTimingResponse | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [recentEvents, setRecentEvents] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const engineRef = useRef<AudioSyncEngine | null>(null);

  useEffect(() => {
    const engine = new AudioSyncEngine({
      onTimeUpdate: (timeMs) => {
        setCurrentTimeMs(timeMs);
      },
      onWordBoundary: (mark, idx) => {
        setActiveWordIndex(idx);
        setRecentEvents((prev) => [
          `Word [${idx}]: "${mark.word}" @ ${Math.round(mark.offset_ms)}ms (dur: ${Math.round(mark.duration_ms)}ms)`,
          ...prev.slice(0, 7),
        ]);
      },
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
      onEnded: () => {
        setIsPlaying(false);
        setActiveWordIndex(-1);
      },
      onError: (err) => {
        console.error('Audio playback error:', err);
        setIsPlaying(false);
      },
    });

    engineRef.current = engine;
    return () => {
      engine.stop();
    };
  }, []);

  const handleSynthesize = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      if (engineRef.current) engineRef.current.stop();
      setIsPlaying(false);
      setActiveWordIndex(-1);
      setCurrentTimeMs(0);
      setRecentEvents([]);

      const result = await fetchSpeechWithTiming(inputText);
      setTtsResult(result);

      if (engineRef.current) {
        engineRef.current.load(result.audio_url, result.timing_marks);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to synthesize speech');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlay = async () => {
    if (!engineRef.current || !ttsResult) return;
    if (isPlaying) {
      engineRef.current.pause();
    } else {
      await engineRef.current.play();
    }
  };

  const handleReset = () => {
    if (!engineRef.current) return;
    engineRef.current.seek(0);
    setActiveWordIndex(-1);
    setCurrentTimeMs(0);
  };

  return (
    <div className="p-4 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl flex flex-col gap-4 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">TTS Timing Marks & Speech Sync</h3>
            <p className="text-[11px] text-slate-400">Step 3 Verification: sub-50ms word-level speech boundaries</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ttsResult && (
            <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20 font-mono text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{ttsResult.timing_marks.length} word marks ready</span>
            </div>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Close Modal"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Preset Script Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-slate-400 font-medium whitespace-nowrap">Presets:</span>
        {SAMPLE_SCRIPTS.map((s) => (
          <button
            key={s.id}
            onClick={() => setInputText(s.text)}
            className="px-2.5 py-1 bg-slate-950/80 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 whitespace-nowrap transition-colors flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3 text-indigo-400" />
            {s.title}
          </button>
        ))}
      </div>

      {/* Input Textarea & Synthesize Button */}
      <div className="space-y-2">
        <textarea
          rows={2}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type teaching script to synthesize with word timing marks..."
          className="w-full bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 resize-none font-sans"
        />

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Neural Engine: Edge-TTS (Christopher Neural)</span>
          <button
            onClick={handleSynthesize}
            disabled={isLoading || !inputText.trim()}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all text-xs"
          >
            <Mic className="w-3.5 h-3.5" />
            {isLoading ? 'Synthesizing...' : 'Synthesize Speech & Timing Marks'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Live Karaoke Spoken Transcript Display */}
      {ttsResult && (
        <div className="p-3.5 bg-slate-950/80 border border-indigo-500/30 rounded-xl space-y-3">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Real-time Spoken Karaoke Sync</span>
            </div>
            <div className="font-mono text-slate-300">
              {Math.round(currentTimeMs)} ms / {Math.round(ttsResult.duration_ms)} ms
            </div>
          </div>

          {/* Karaoke Words Flow */}
          <div className="flex flex-wrap gap-1.5 leading-relaxed text-sm p-3 bg-slate-900/90 rounded-lg border border-slate-800">
            {ttsResult.timing_marks.map((mark, idx) => {
              const isCurrent = idx === activeWordIndex;
              const isPassed = activeWordIndex > idx;
              return (
                <span
                  key={idx}
                  className={`px-1.5 py-0.5 rounded transition-all duration-100 ${
                    isCurrent
                      ? 'bg-indigo-500 text-white font-bold scale-110 shadow-md shadow-indigo-500/40 ring-2 ring-indigo-400'
                      : isPassed
                      ? 'text-slate-400'
                      : 'text-slate-200'
                  }`}
                  title={`Word: ${mark.word} (Offset: ${mark.offset_ms}ms)`}
                >
                  {mark.raw_word}
                </span>
              );
            })}
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors shadow-sm"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pause' : 'Play Speech'}
              </button>
              <button
                onClick={handleReset}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
                title="Reset Audio"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Event Monitor */}
            <div className="text-[10px] font-mono text-slate-400 truncate max-w-[280px]">
              {recentEvents[0] || 'Ready to trigger word callbacks'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
