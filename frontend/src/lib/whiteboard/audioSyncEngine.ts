/**
 * frontend/lib/whiteboard/audioSyncEngine.ts
 *
 * High-precision Audio Synchronization Engine for the Whiteboard subsystem.
 * Handles audio playback, word-level boundary detection, sub-50ms callback
 * dispatching, and communication with the /api/whiteboard/tts endpoint.
 */

import { TimingMark, TTSWithTimingResponse } from './types';
import { API_BASE_URL, resolveAudioUrl } from '@/lib/api';

export interface AudioSyncCallbacks {
  onTimeUpdate?: (timeMs: number) => void;
  onWordBoundary?: (mark: TimingMark, wordIndex: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (err: any) => void;
}

export class AudioSyncEngine {
  private audio: HTMLAudioElement | null = null;
  private timingMarks: TimingMark[] = [];
  private callbacks: AudioSyncCallbacks = {};
  private animationFrameId: number | null = null;
  private lastFiredWordIndex: number = -1;
  private lookaheadLeadMs: number = 75; // 75ms lead calibration for sub-50ms visual sync

  // Event listener handlers for clean detachment
  private onPlayListener: (() => void) | null = null;
  private onPauseListener: (() => void) | null = null;
  private onEndedListener: (() => void) | null = null;
  private onErrorListener: ((e: any) => void) | null = null;

  constructor(callbacks?: AudioSyncCallbacks, lookaheadLeadMs: number = 75) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
    this.lookaheadLeadMs = lookaheadLeadMs;
  }

  public setCallbacks(callbacks: AudioSyncCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public setLookaheadLeadMs(ms: number) {
    this.lookaheadLeadMs = ms;
  }

  public load(audioUrl: string, timingMarks: TimingMark[]) {
    this.stop();
    if (!audioUrl) return;

    const resolvedSrc = resolveAudioUrl(audioUrl) || audioUrl;

    this.timingMarks = timingMarks;
    this.lastFiredWordIndex = -1;

    const audio = new Audio(resolvedSrc);
    audio.preload = 'auto';

    this.onPlayListener = () => {
      this.callbacks.onPlay?.();
      this.startSyncLoop();
    };

    this.onPauseListener = () => {
      this.callbacks.onPause?.();
      this.stopSyncLoop();
    };

    this.onEndedListener = () => {
      this.stopSyncLoop();
      this.callbacks.onEnded?.();
    };

    this.onErrorListener = (e: any) => {
      // Ignore errors if audio has been stopped/detached
      if (!this.audio || !this.audio.src) return;
      this.callbacks.onError?.(e);
    };

    audio.addEventListener('play', this.onPlayListener);
    audio.addEventListener('pause', this.onPauseListener);
    audio.addEventListener('ended', this.onEndedListener);
    audio.addEventListener('error', this.onErrorListener);

    this.audio = audio;
  }

  public async play() {
    if (!this.audio) return;
    try {
      await this.audio.play();
    } catch (err) {
      if (this.audio) {
        this.callbacks.onError?.(err);
      }
    }
  }

  public pause() {
    if (!this.audio) return;
    this.audio.pause();
  }

  public seek(timeMs: number) {
    if (!this.audio) return;
    this.audio.currentTime = timeMs / 1000.0;
    this.lastFiredWordIndex = this.findWordIndexAtTime(timeMs + this.lookaheadLeadMs);
    this.callbacks.onTimeUpdate?.(timeMs);
  }

  public setPlaybackRate(rate: number) {
    if (!this.audio) return;
    this.audio.playbackRate = rate;
  }

  public getCurrentTimeMs(): number {
    if (!this.audio) return 0;
    return this.audio.currentTime * 1000.0;
  }

  public getDurationMs(): number {
    if (!this.audio || isNaN(this.audio.duration)) return 0;
    return this.audio.duration * 1000.0;
  }

  public isPlaying(): boolean {
    return !!this.audio && !this.audio.paused && !this.audio.ended;
  }

  public stop() {
    this.stopSyncLoop();
    if (this.audio) {
      if (this.onPlayListener) this.audio.removeEventListener('play', this.onPlayListener);
      if (this.onPauseListener) this.audio.removeEventListener('pause', this.onPauseListener);
      if (this.onEndedListener) this.audio.removeEventListener('ended', this.onEndedListener);
      if (this.onErrorListener) this.audio.removeEventListener('error', this.onErrorListener);

      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.lastFiredWordIndex = -1;
    this.onPlayListener = null;
    this.onPauseListener = null;
    this.onEndedListener = null;
    this.onErrorListener = null;
  }

  private startSyncLoop() {
    this.stopSyncLoop();

    const loop = () => {
      if (!this.audio) return;

      const rawMs = this.audio.currentTime * 1000.0;
      this.callbacks.onTimeUpdate?.(rawMs);

      // Apply lookahead lead buffer to trigger visual command right as voice starts
      const effectiveMs = rawMs + this.lookaheadLeadMs;
      const activeWordIndex = this.findWordIndexAtTime(effectiveMs);

      if (activeWordIndex >= 0 && activeWordIndex !== this.lastFiredWordIndex) {
        this.lastFiredWordIndex = activeWordIndex;
        const mark = this.timingMarks[activeWordIndex];
        this.callbacks.onWordBoundary?.(mark, activeWordIndex);
      }

      if (!this.audio.paused && !this.audio.ended) {
        this.animationFrameId = requestAnimationFrame(loop);
      }
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopSyncLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private findWordIndexAtTime(timeMs: number): number {
    if (this.timingMarks.length === 0) return -1;

    for (let i = 0; i < this.timingMarks.length; i++) {
      const mark = this.timingMarks[i];
      if (timeMs >= mark.offset_ms && timeMs < mark.offset_ms + mark.duration_ms) {
        return i;
      }
    }

    // If past the last word but still playing
    const last = this.timingMarks[this.timingMarks.length - 1];
    if (timeMs >= last.offset_ms) {
      return this.timingMarks.length - 1;
    }

    return -1;
  }
}

/**
 * Calls backend /api/whiteboard/tts to synthesize speech and get timing marks.
 */
export async function fetchSpeechWithTiming(
  text: string,
  voice?: string
): Promise<TTSWithTimingResponse> {
  const res = await fetch(`${API_BASE_URL}/api/whiteboard/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `TTS request failed with status ${res.status}`);
  }

  return res.json();
}