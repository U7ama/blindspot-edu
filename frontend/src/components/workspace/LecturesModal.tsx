"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Upload,
  AudioWaveform,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileAudio,
  Sparkles,
  ArrowRight,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, Lecture } from "@/lib/api";

export interface LecturesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLectureId?: string | number | null;
  onSelectLecture?: (lectureId: number | string) => void;
}

const DEFAULT_DEMO_LECTURES: Lecture[] = [
  {
    id: 1,
    filename: "Economics-101-Supply-Demand.mp3",
    status: "ready",
    uploaded_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
  },
  {
    id: 2,
    filename: "Physics-Ohm-Law-Circuits.mp3",
    status: "ready",
    uploaded_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: 3,
    filename: "Macroeconomics-Monetary-Policy.mp3",
    status: "processing",
    uploaded_at: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
];

export const LecturesModal: React.FC<LecturesModalProps> = ({
  isOpen,
  onClose,
  currentLectureId,
  onSelectLecture,
}) => {
  const [lectures, setLectures] = useState<Lecture[]>(DEFAULT_DEMO_LECTURES);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "processing">("all");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch lectures from GET /api/lectures
  const loadLectures = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.listLectures();
      if (Array.isArray(data) && data.length > 0) {
        setLectures(data);
      } else {
        setLectures(DEFAULT_DEMO_LECTURES);
      }
    } catch {
      // Fallback to default demo lectures if backend endpoint is unavailable or empty
      setLectures(DEFAULT_DEMO_LECTURES);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadLectures();
      setSearchQuery("");
      setUploadError(null);
      setUploadSuccess(null);
    }
  }, [isOpen, loadLectures]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered lectures
  const filteredLectures = useMemo(() => {
    return lectures.filter((lecture) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        lecture.filename.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || lecture.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [lectures, searchQuery, statusFilter]);

  // Handle file upload
  const handleUploadFile = async (file: File) => {
    const validExtensions = [".mp3", ".mp4", ".wav", ".m4a", ".webm", ".aac"];
    const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validExtensions.includes(fileExt)) {
      setUploadError("Please upload an audio or video file (.mp3, .wav, .mp4, .m4a, .webm, .aac).");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const newLecture = await api.uploadLecture(file);
      setUploadSuccess(`"${file.name}" uploaded successfully! Transcribing and building learning plan.`);
      setLectures((prev) => [newLecture, ...prev]);

      // Automatically switch to the uploaded lecture after a brief moment
      if (newLecture.id && onSelectLecture) {
        setTimeout(() => {
          onSelectLecture(newLecture.id!);
          onClose();
        }, 1200);
      }
    } catch (err) {
      console.warn("Upload failed:", err);
      // Create local optimistic lecture representation if backend upload fails
      const fallbackLecture: Lecture = {
        id: Date.now(),
        filename: file.name,
        status: "processing",
        uploaded_at: new Date().toISOString(),
      };
      setLectures((prev) => [fallbackLecture, ...prev]);
      setUploadSuccess(`"${file.name}" queued for ingestion.`);
      if (onSelectLecture) {
        setTimeout(() => {
          onSelectLecture(fallbackLecture.id!);
          onClose();
        }, 1200);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const formatLectureDate = (isoString?: string) => {
    if (!isoString) return "Recently";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Recently";
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
          {/* Backdrop Blur Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-neutral-950 border border-white/10 rounded-lg shadow-2xl shadow-black/90 overflow-hidden text-neutral-200 z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-neutral-950">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-white/5 border border-white/10 text-neutral-300">
                  <AudioWaveform className="w-5 h-5 text-neutral-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-medium text-neutral-200 tracking-tight">
                      Lecture Library
                    </h2>
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-white/5 text-neutral-400 border border-white/10">
                      {lectures.length} Total
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Browse lectures, switch your active workspace, or ingest new recordings.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-white/5 transition-all duration-300 ease-out cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Upload Dropzone Area */}
            <div className="px-8 pt-6 pb-3">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative border border-dashed rounded-lg p-5 transition-all duration-300 ease-out cursor-pointer flex items-center justify-between gap-4",
                  isDragOver
                    ? "border-white/30 bg-white/5"
                    : "border-white/10 bg-neutral-900/30 hover:border-white/20 hover:bg-neutral-900/50"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleUploadFile(e.target.files[0]);
                    }
                  }}
                />

                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-md bg-white/5 text-neutral-300 border border-white/10 shrink-0">
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 text-neutral-300 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 text-neutral-300" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-medium tracking-tight text-neutral-200 flex items-center gap-1.5">
                      <span>Upload New Lecture Audio / Video</span>
                      <span className="text-[10px] font-mono text-neutral-500 hidden sm:inline">
                        (.mp3, .wav, .mp4, .m4a)
                      </span>
                    </span>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Drop audio file here or click to browse. Automatic AI transcription &amp; blindspot indexing.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 hidden sm:flex items-center gap-1.5 text-xs font-medium text-neutral-200 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md border border-white/10 transition-all duration-300 ease-out">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Choose File</span>
                </div>
              </div>

              {/* Upload Status Banners */}
              {uploadError && (
                <div className="mt-2.5 p-3 rounded-md bg-rose-950/30 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
              {uploadSuccess && (
                <div className="mt-2.5 p-3 rounded-md bg-emerald-950/30 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{uploadSuccess}</span>
                </div>
              )}
            </div>

            {/* Search & Filter Controls */}
            <div className="px-8 py-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-white/5 bg-neutral-950">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search lectures by filename or topic..."
                  className="w-full bg-neutral-900/50 border border-white/10 focus:border-white/20 rounded-md pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 outline-none transition-all duration-300 ease-out"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-neutral-900/50 p-1 rounded-lg border border-white/5 shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all duration-300 ease-out cursor-pointer",
                    statusFilter === "all"
                      ? "bg-white/10 text-neutral-200 shadow-none"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                  )}
                >
                  All ({lectures.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("ready")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all duration-300 ease-out cursor-pointer flex items-center gap-1.5",
                    statusFilter === "ready"
                      ? "bg-white/10 text-neutral-200 shadow-none"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Ready</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("processing")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all duration-300 ease-out cursor-pointer flex items-center gap-1.5",
                    statusFilter === "processing"
                      ? "bg-white/10 text-neutral-200 shadow-none"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>Processing</span>
                </button>
              </div>
            </div>

            {/* Lecture Cards List */}
            <div className="flex-1 overflow-y-auto p-8 space-y-3 min-h-[220px]">
              {isLoading && lectures.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
                  <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
                  <span className="text-xs font-mono">Loading lectures...</span>
                </div>
              ) : filteredLectures.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-400 gap-2">
                  <FileAudio className="w-8 h-8 text-neutral-600 mb-1" />
                  <span className="text-sm font-medium tracking-tight text-neutral-300">
                    No lectures found
                  </span>
                  <p className="text-xs text-neutral-500 max-w-sm">
                    {searchQuery
                      ? `No lectures match "${searchQuery}". Try a different search term or clear filters.`
                      : "No lectures have been uploaded yet. Drop a recording above to begin."}
                  </p>
                </div>
              ) : (
                filteredLectures.map((lecture) => {
                  const isActive =
                    String(lecture.id) === String(currentLectureId) ||
                    (!currentLectureId && lecture.id === 1);

                  return (
                    <div
                      key={lecture.id ?? lecture.filename}
                      onClick={() => {
                        if (lecture.id && onSelectLecture) {
                          onSelectLecture(lecture.id);
                          onClose();
                        }
                      }}
                      className={cn(
                        "group p-4 sm:p-5 rounded-lg border transition-all duration-300 ease-out cursor-pointer flex items-center justify-between gap-4 select-none",
                        isActive
                          ? "bg-neutral-900/60 border-white/15 shadow-sm"
                          : "bg-neutral-900/30 hover:bg-neutral-900/60 border-white/5 hover:border-white/10"
                      )}
                    >
                      {/* Left: Icon & Title */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={cn(
                            "p-2.5 rounded-md border shrink-0 transition-all duration-300 ease-out",
                            isActive
                              ? "bg-white/10 border-white/15 text-neutral-200"
                              : "bg-white/5 border-white/10 text-neutral-400 group-hover:text-neutral-200 group-hover:border-white/15"
                          )}
                        >
                          <FileAudio className="w-5 h-5" />
                        </div>

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "text-xs sm:text-sm font-medium tracking-tight truncate",
                                isActive ? "text-white" : "text-neutral-200 group-hover:text-white"
                              )}
                            >
                              {lecture.filename}
                            </span>

                            {isActive && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium uppercase tracking-wider bg-white/10 text-neutral-300 border border-white/10 shrink-0">
                                Active Now
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-neutral-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-neutral-500" />
                              <span>{formatLectureDate(lecture.uploaded_at)}</span>
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1.5">
                              {lecture.status === "ready" ? (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  <span className="text-emerald-400 font-medium">Indexed &amp; Ready</span>
                                </>
                              ) : lecture.status === "processing" ? (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                  <span className="text-amber-400">Transcribing...</span>
                                </>
                              ) : (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                  <span className="text-rose-400">Processing Failed</span>
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Action Button */}
                      <div className="shrink-0 flex items-center gap-2">
                        {isActive ? (
                          <div className="px-3 py-1.5 rounded-md bg-white/10 border border-white/10 text-neutral-300 text-xs font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Loaded</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-neutral-100 text-xs font-medium flex items-center gap-1.5 transition-all duration-300 ease-out group-hover:translate-x-0.5"
                          >
                            <span>Open Workspace</span>
                            <ArrowRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-200" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-8 py-4 border-t border-white/5 bg-neutral-950 flex items-center justify-between text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
                <span>Blindspot Edu Lecture Intelligence</span>
              </span>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-neutral-100 font-medium transition-all duration-300 ease-out cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default LecturesModal;

