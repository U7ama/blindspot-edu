'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Plus,
  Clock,
  Layers,
  Film,
  Download,
  Trash2,
  X,
  Loader2,
  Check,
} from 'lucide-react';
import { SessionSummary, WhiteboardSessionRecord } from '@/lib/whiteboard/types';
import { WhiteboardSessionManager } from '@/lib/whiteboard/sessionManager';

interface SessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSessionId: string;
  onLoadSession: (session: WhiteboardSessionRecord) => void;
  onNewSession: () => void;
}

export const SessionHistoryModal: React.FC<SessionHistoryModalProps> = ({
  isOpen,
  onClose,
  currentSessionId,
  onLoadSession,
  onNewSession,
}) => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const loadSessions = async () => {
    setIsLoading(true);
    const list = await WhiteboardSessionManager.listSessions();
    setSessions(list);
    setIsLoading(false);
  };

  if (!isOpen) return null;

  const handleSelectSession = async (sessionId: string) => {
    setIsLoading(true);
    const session = await WhiteboardSessionManager.loadSession(sessionId);
    if (session) {
      onLoadSession(session);
      onClose();
    }
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 flex flex-col gap-4 max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white flex items-center gap-2">
                Whiteboard Session Library
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                  Step 9
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Browse, restore, or export your saved whiteboard study sessions
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

        {/* Action Bar */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 font-mono">
            {sessions.length} saved session(s)
          </span>

          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Blank Session</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-96">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 gap-2 text-slate-400 text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              <span>Loading saved sessions...</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl space-y-1">
              <p>No saved sessions found yet.</p>
              <p className="text-[11px] text-slate-600">
                As you draw and learn on the whiteboard, sessions are auto-saved automatically!
              </p>
            </div>
          ) : (
            sessions.map((s) => {
              const isCurrent = s.sessionId === currentSessionId;
              const dateStr = s.updatedAt
                ? new Date(s.updatedAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Recent';

              return (
                <div
                  key={s.sessionId}
                  onClick={() => handleSelectSession(s.sessionId)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                    isCurrent
                      ? 'bg-indigo-600/10 border-indigo-500/50 shadow-sm'
                      : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-100 group-hover:text-indigo-300 transition-colors">
                        {s.title}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {dateStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3 text-slate-500" />
                        {s.objectsCount} objects
                      </span>
                      <span className="flex items-center gap-1">
                        <Film className="w-3 h-3 text-slate-500" />
                        {s.eventsCount} events
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectSession(s.sessionId);
                    }}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                  >
                    Open
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
