'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  Zap,
  Layers,
  FileCode,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  CommandBatch,
  DrawCommand,
  CanvasObject,
  ViewportTransform,
} from '@/lib/whiteboard/types';
import {
  applyCommand,
  TEST_BATCH_CIRCUIT,
  TEST_BATCH_BST,
} from '@/lib/whiteboard/commandInterpreter';

interface CommandPlayerProps {
  objects: CanvasObject[];
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>;
  onCommitAction: (newObjects: CanvasObject[]) => void;
  setViewport: React.Dispatch<React.SetStateAction<ViewportTransform>>;
  onTriggerHighlight: (targetId: string, color: string, durationMs: number) => void;
}

export const CommandPlayer: React.FC<CommandPlayerProps> = ({
  objects,
  setObjects,
  onCommitAction,
  setViewport,
  onTriggerHighlight,
}) => {
  const [selectedBatch, setSelectedBatch] = useState<CommandBatch>(TEST_BATCH_CIRCUIT);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0); // 0.5, 1, 2
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [customJsonInput, setCustomJsonInput] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Snapshot history per step to support step-back
  const stepSnapshotsRef = useRef<CanvasObject[][]>([[]]);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentStepIndexRef = useRef<number>(currentStepIndex);

  useEffect(() => {
    currentStepIndexRef.current = currentStepIndex;
  }, [currentStepIndex]);

  // Initialize or switch batch
  const loadBatch = (batch: CommandBatch) => {
    setIsPlaying(false);
    if (playTimerRef.current) clearInterval(playTimerRef.current);

    setSelectedBatch(batch);
    setCurrentStepIndex(0);
    stepSnapshotsRef.current = [[]];
    setObjects([]);
    onCommitAction([]);

    if (batch.initialViewport) {
      setViewport(batch.initialViewport);
    }
  };

  // Step Forward
  const stepForward = () => {
    if (currentStepIndex >= selectedBatch.commands.length) return;

    const cmd = selectedBatch.commands[currentStepIndex];
    const currentObjs = stepSnapshotsRef.current[currentStepIndex] || objects;
    const nextObjs = applyCommand(currentObjs, cmd);

    // If highlight command
    if (cmd.op === 'highlight') {
      onTriggerHighlight(cmd.targetId, cmd.color || '#818CF8', cmd.durationMs || 1500);
    } else if (cmd.op === 'pan_zoom') {
      setViewport((v) => ({
        ...v,
        x: cmd.x,
        y: cmd.y,
        scale: cmd.scale || v.scale,
      }));
    }

    const nextSnapshots = [...stepSnapshotsRef.current];
    nextSnapshots[currentStepIndex + 1] = nextObjs;
    stepSnapshotsRef.current = nextSnapshots;

    setObjects(nextObjs);
    onCommitAction(nextObjs);
    setCurrentStepIndex((prev) => prev + 1);
  };

  // Step Backward
  const stepBackward = () => {
    if (currentStepIndex <= 0) return;

    const targetIndex = currentStepIndex - 1;
    const prevObjs = stepSnapshotsRef.current[targetIndex] || [];

    setObjects(prevObjs);
    onCommitAction(prevObjs);
    setCurrentStepIndex(targetIndex);
  };

  // Reset to Beginning
  const resetPlayback = () => {
    setIsPlaying(false);
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    setCurrentStepIndex(0);
    stepSnapshotsRef.current = [[]];
    setObjects([]);
    onCommitAction([]);
  };

  // Automated Playback Loop
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    const intervalMs = Math.max(900 / playbackSpeed, 200);

    playTimerRef.current = setInterval(() => {
      const idx = currentStepIndexRef.current;
      if (idx >= selectedBatch.commands.length) {
        setIsPlaying(false);
        return;
      }

      const cmd = selectedBatch.commands[idx];
      const currentObjs = stepSnapshotsRef.current[idx] || objects;
      const nextObjs = applyCommand(currentObjs, cmd);

      if (cmd.op === 'highlight') {
        onTriggerHighlight(cmd.targetId, cmd.color || '#818CF8', cmd.durationMs || 1500);
      } else if (cmd.op === 'pan_zoom') {
        setViewport((v) => ({
          ...v,
          x: cmd.x,
          y: cmd.y,
          scale: cmd.scale || v.scale,
        }));
      }

      const nextSnapshots = [...stepSnapshotsRef.current];
      nextSnapshots[idx + 1] = nextObjs;
      stepSnapshotsRef.current = nextSnapshots;

      setObjects(nextObjs);
      onCommitAction(nextObjs);

      const nextIdx = idx + 1;
      setCurrentStepIndex(nextIdx);

      if (nextIdx >= selectedBatch.commands.length) {
        setIsPlaying(false);
      }
    }, intervalMs);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, playbackSpeed, selectedBatch, objects, onCommitAction, setObjects, setViewport, onTriggerHighlight]);

  // Load Custom JSON batch
  const handleLoadCustomJson = () => {
    try {
      setJsonError(null);
      const parsed = JSON.parse(customJsonInput);
      let batch: CommandBatch;

      if (Array.isArray(parsed)) {
        batch = {
          id: `custom-${Date.now()}`,
          title: 'Custom Command Batch',
          description: 'User-defined JSON draw command batch',
          commands: parsed as DrawCommand[],
        };
      } else if (parsed && Array.isArray(parsed.commands)) {
        batch = parsed as CommandBatch;
      } else {
        throw new Error('JSON must be an array of DrawCommands or a CommandBatch object with a .commands array.');
      }

      loadBatch(batch);
      setIsCustomModalOpen(false);
    } catch (err: any) {
      setJsonError(err.message || 'Invalid JSON format');
    }
  };

  const totalCommands = selectedBatch.commands.length;
  const currentCommand = selectedBatch.commands[currentStepIndex - 1] || null;

  return (
    <>
      {/* Floating Bottom Command Dock */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
        {/* Command Pill Card */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-900/95 backdrop-blur-xl border border-slate-800/90 rounded-2xl shadow-2xl text-slate-200">
          {/* Preset Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950/70 px-2 py-1 rounded-xl border border-slate-800/60 text-xs">
            <button
              onClick={() => loadBatch(TEST_BATCH_CIRCUIT)}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium flex items-center gap-1 ${
                selectedBatch.id === TEST_BATCH_CIRCUIT.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Zap className="w-3 h-3 text-amber-400" />
              Circuit Batch
            </button>
            <button
              onClick={() => loadBatch(TEST_BATCH_BST)}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium flex items-center gap-1 ${
                selectedBatch.id === TEST_BATCH_BST.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Sparkles className="w-3 h-3 text-indigo-400" />
              BST Batch
            </button>
            <button
              onClick={() => {
                setCustomJsonInput(JSON.stringify(TEST_BATCH_CIRCUIT.commands, null, 2));
                setIsCustomModalOpen(true);
              }}
              className="px-2 py-1 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800/50 transition-all font-medium flex items-center gap-1"
              title="Paste custom JSON batch"
            >
              <FileCode className="w-3 h-3" />
              Custom
            </button>
          </div>

          <div className="w-[1px] h-6 bg-slate-800" />

          {/* Stepping & Play Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={resetPlayback}
              title="Reset Sequence"
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={stepBackward}
              disabled={currentStepIndex <= 0}
              title="Step Backward"
              className="p-2 rounded-xl hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 hover:text-slate-200 transition-colors"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (currentStepIndex >= totalCommands) {
                  resetPlayback();
                  setTimeout(() => setIsPlaying(true), 50);
                } else {
                  setIsPlaying(!isPlaying);
                }
              }}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
              title={isPlaying ? 'Pause Sequence' : 'Play Sequence'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={stepForward}
              disabled={currentStepIndex >= totalCommands}
              title="Step Forward"
              className="p-2 rounded-xl hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-400 hover:text-slate-200 transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <div className="w-[1px] h-6 bg-slate-800" />

          {/* Step Indicator & Speed */}
          <div className="flex items-center gap-2">
            <div className="text-xs font-mono bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800/80">
              <span className="text-indigo-400 font-semibold">{currentStepIndex}</span>
              <span className="text-slate-600"> / </span>
              <span className="text-slate-400">{totalCommands}</span>
            </div>

            {/* Speed toggle */}
            <button
              onClick={() => {
                const nextSpeed = playbackSpeed === 0.5 ? 1.0 : playbackSpeed === 1.0 ? 2.0 : 0.5;
                setPlaybackSpeed(nextSpeed);
              }}
              className="px-2 py-1 text-[11px] font-mono rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 transition-colors font-medium border border-slate-700/50"
              title="Cycle Speed (0.5x, 1x, 2x)"
            >
              {playbackSpeed}x
            </button>
          </div>
        </div>

        {/* Active Command Tooltip Banner */}
        {currentCommand && (
          <div className="px-3 py-1 bg-slate-900/90 backdrop-blur-md border border-indigo-500/30 rounded-xl text-[11px] text-slate-300 font-mono flex items-center gap-2 shadow-lg animate-fade-in">
            <span className="text-indigo-400 font-bold uppercase">{currentCommand.op}</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-200">
              {currentCommand.op === 'add_shape'
                ? `shape: ${currentCommand.label || currentCommand.id} (${currentCommand.subtype})`
                : currentCommand.op === 'add_text'
                ? `text: "${currentCommand.text}"`
                : currentCommand.op === 'connect_arrow'
                ? `arrow: ${String(currentCommand.from)} -> ${String(currentCommand.to)}`
                : currentCommand.op === 'highlight'
                ? `highlight target: ${currentCommand.targetId}`
                : currentCommand.op === 'update_shape'
                ? `update target: ${currentCommand.targetId}`
                : JSON.stringify(currentCommand)}
            </span>
          </div>
        )}
      </div>

      {/* Custom JSON Batch Modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm text-white">Paste Custom JSON Draw Command Batch</h3>
              </div>
              <button
                onClick={() => setIsCustomModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded bg-slate-800"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Paste an array of structured JSON draw commands ({`[{ "op": "add_shape", ... }]`}). The Command Interpreter will parse and execute them step-by-step.
            </p>

            <textarea
              rows={10}
              value={customJsonInput}
              onChange={(e) => setCustomJsonInput(e.target.value)}
              className="w-full bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="Paste JSON array here..."
            />

            {jsonError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{jsonError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsCustomModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLoadCustomJson}
                className="px-4 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-indigo-600/30"
              >
                <Check className="w-3.5 h-3.5" />
                Load & Play Batch
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
