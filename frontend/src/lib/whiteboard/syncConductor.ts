/**
 * frontend/lib/whiteboard/syncConductor.ts
 *
 * Speech-Canvas Synchronization Conductor (Step 4).
 * Coordinates AudioSyncEngine events with DrawCommand execution,
 * resolves word-trigger timestamps against TTS timing marks,
 * and enables instant canvas state reconstruction during timeline scrubbing.
 */

import {
  CanvasObject,
  DrawCommand,
  TimedDrawCommand,
  TimingMark,
  WhiteboardLessonBeat,
} from './types';
import { applyCommand } from './commandInterpreter';

export interface ResolvedTimedCommand {
  command: DrawCommand;
  triggerWord?: string;
  resolvedOffsetMs: number;
  hasFired: boolean;
}

export class SyncConductor {
  private lessonBeat: WhiteboardLessonBeat | null = null;
  private resolvedCommands: ResolvedTimedCommand[] = [];

  constructor(lessonBeat?: WhiteboardLessonBeat) {
    if (lessonBeat) {
      this.loadLesson(lessonBeat);
    }
  }

  public loadLesson(beat: WhiteboardLessonBeat) {
    this.lessonBeat = beat;
    this.resolvedCommands = this.resolveCommandTriggers(
      beat.timedCommands,
      beat.timingMarks || []
    );
  }

  public getResolvedCommands(): ResolvedTimedCommand[] {
    return this.resolvedCommands;
  }

  public resetFiredState() {
    this.resolvedCommands.forEach((rc) => {
      rc.hasFired = false;
    });
  }

  /**
   * Resolves trigger words (e.g. "battery") against TTS timing marks into exact ms offsets.
   */
  private resolveCommandTriggers(
    timedCommands: TimedDrawCommand[],
    timingMarks: TimingMark[]
  ): ResolvedTimedCommand[] {
    let lastMarkSearchIdx = 0;

    return timedCommands.map((tc) => {
      let offsetMs = tc.triggerOffsetMs || 0;

      if (tc.triggerWord && timingMarks.length > 0) {
        const searchWord = tc.triggerWord.toLowerCase().trim();

        // Search for matching word starting from last found position to support repeated words
        let foundIdx = -1;
        for (let i = lastMarkSearchIdx; i < timingMarks.length; i++) {
          if (timingMarks[i].word.toLowerCase().includes(searchWord)) {
            foundIdx = i;
            break;
          }
        }

        // If not found ahead, search from beginning
        if (foundIdx === -1) {
          foundIdx = timingMarks.findIndex((m) =>
            m.word.toLowerCase().includes(searchWord)
          );
        }

        if (foundIdx >= 0) {
          offsetMs = timingMarks[foundIdx].offset_ms;
          lastMarkSearchIdx = foundIdx + 1;
        }
      }

      return {
        command: tc.command,
        triggerWord: tc.triggerWord,
        resolvedOffsetMs: offsetMs,
        hasFired: false,
      };
    }).sort((a, b) => a.resolvedOffsetMs - b.resolvedOffsetMs);
  }

  /**
   * Reconstructs the exact cumulative canvas objects array for any given timestamp.
   * This is what makes scrubbing backwards/forwards seamless!
   */
  public getCanvasStateAtTime(timeMs: number): CanvasObject[] {
    let objects: CanvasObject[] = [];

    for (const rc of this.resolvedCommands) {
      if (rc.resolvedOffsetMs <= timeMs) {
        objects = applyCommand(objects, rc.command);
      }
    }

    return objects;
  }

  /**
   * Checks which commands need to be fired between prevTimeMs and currentTimeMs during playback.
   */
  public getCommandsToFire(
    prevTimeMs: number,
    currentTimeMs: number
  ): ResolvedTimedCommand[] {
    const toFire: ResolvedTimedCommand[] = [];

    for (const rc of this.resolvedCommands) {
      if (
        !rc.hasFired &&
        rc.resolvedOffsetMs > prevTimeMs &&
        rc.resolvedOffsetMs <= currentTimeMs
      ) {
        rc.hasFired = true;
        toFire.push(rc);
      }
    }

    return toFire;
  }
}