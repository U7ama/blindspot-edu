/**
 * frontend/lib/whiteboard/sessionManager.ts
 *
 * Session Persistence & Auto-Save Manager (Step 9 / Blueprint §8).
 * Manages auto-saving canvas state and event timeline to both the backend and localStorage,
 * ensuring zero progress loss on page refresh.
 */

import {
  CanvasObject,
  SessionEvent,
  SessionSummary,
  ViewportTransform,
  WhiteboardSessionRecord,
} from './types';
import { API_BASE_URL as APP_API_BASE_URL } from '@/lib/api';

const LOCAL_STORAGE_KEY = 'blindspot_active_whiteboard_session';
const API_BASE_URL = `${APP_API_BASE_URL}/api/whiteboard`;

export class WhiteboardSessionManager {
  private static saveTimeout: NodeJS.Timeout | null = null;

  /**
   * Debounced auto-save function. Saves to localStorage immediately, and syncs with backend after delay.
   */
  public static autoSave(
    session: WhiteboardSessionRecord,
    onSaved?: (savedSession: WhiteboardSessionRecord) => void
  ) {
    // 1. Instant local persistence
    this.saveToLocalStorage(session);

    // 2. Debounced backend persistence
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        const saved = await this.saveToBackend(session);
        onSaved?.(saved);
      } catch (err) {
        console.warn('Backend auto-save failed, session kept in localStorage:', err);
      }
    }, 1000);
  }

  /**
   * Saves session record to backend storage.
   */
  public static async saveToBackend(
    session: WhiteboardSessionRecord
  ): Promise<WhiteboardSessionRecord> {
    const res = await fetch(`${API_BASE_URL}/session/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });

    if (!res.ok) {
      throw new Error(`Failed to save session (HTTP ${res.status})`);
    }

    return await res.json();
  }

  /**
   * Fetches all saved sessions from backend.
   */
  public static async listSessions(): Promise<SessionSummary[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions`);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('Failed to fetch sessions list:', err);
      return [];
    }
  }

  /**
   * Loads a specific session from the backend by ID.
   */
  public static async loadSession(sessionId: string): Promise<WhiteboardSessionRecord | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/session/${sessionId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn(`Failed to fetch session ${sessionId}:`, err);
      return null;
    }
  }

  /**
   * Saves session to localStorage.
   */
  public static saveToLocalStorage(session: WhiteboardSessionRecord) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('localStorage save failed:', e);
    }
  }

  /**
   * Retrieves active session from localStorage.
   */
  public static loadFromLocalStorage(): WhiteboardSessionRecord | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('localStorage read failed:', e);
      return null;
    }
  }

  /**
   * Clears active session from localStorage.
   */
  public static clearLocalStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }
}