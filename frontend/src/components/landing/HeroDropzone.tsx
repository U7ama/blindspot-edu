"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useMotionTemplate,
} from "framer-motion";
import {
  Upload,
  Link2,
  FileAudio,
  FileVideo,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
} from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";
import { api, Lecture } from "@/lib/api";
import { Button } from "@/components/ui/button";

export interface HeroDropzoneProps {
  onActiveStateChange?: (isActive: boolean) => void;
  onFileSelect?: (file: File, lecture?: Lecture) => void;
  onUrlSubmit?: (url: string) => void;
  isProcessing?: boolean;
  className?: string;
  maxFileSizeBytes?: number;
  acceptedFormats?: string[];
}

export const HeroDropzone: React.FC<HeroDropzoneProps> = ({
  onActiveStateChange,
  onFileSelect,
  onUrlSubmit,
  isProcessing: externalIsProcessing = false,
  className,
  maxFileSizeBytes = 500 * 1024 * 1024, // 500 MB
  acceptedFormats = [".mp3", ".mp4", ".wav", ".m4a", ".webm", ".aac"],
}) => {
  const router = useRouter();

  // Drag states
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // URL state
  const [mediaUrl, setMediaUrl] = useState("");
  const [isUrlFocused, setIsUrlFocused] = useState(false);
  const [isUrlSubmitting, setIsUrlSubmitting] = useState(false);

  // Trailing mouse coordinates with smooth spring physics
  const mouseX = useSpring(useMotionValue(0), { stiffness: 350, damping: 35 });
  const mouseY = useSpring(useMotionValue(0), { stiffness: 350, damping: 35 });
  const [isHovered, setIsHovered] = useState(false);

  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef<number>(0);

  const isBusy = isUploading || externalIsProcessing;

  // Active state to trigger 3D orb speed up and glowing border
  const isActive = isHovered || isDragOver || isWindowDragging;

  useEffect(() => {
    onActiveStateChange?.(isActive);
  }, [isActive, onActiveStateChange]);

  const handleMouseMove = useCallback(
    ({ currentTarget, clientX, clientY }: React.MouseEvent<HTMLDivElement>) => {
      const { left, top } = currentTarget.getBoundingClientRect();
      mouseX.set(clientX - left);
      mouseY.set(clientY - top);
    },
    [mouseX, mouseY]
  );

  const radialBackground = useMotionTemplate`radial-gradient(400px circle at ${mouseX}px ${mouseY}px, rgba(112, 26, 36, 0.1), transparent 80%)`;
  const borderGlow = useMotionTemplate`radial-gradient(280px circle at ${mouseX}px ${mouseY}px, rgba(136, 19, 55, 0.35), transparent 70%)`;

  // Window drag listeners
  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current += 1;
      if (e.dataTransfer?.types.includes("Files")) {
        setIsWindowDragging(true);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsWindowDragging(false);
        setIsDragOver(false);
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsWindowDragging(false);
      setIsDragOver(false);
    };

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, []);

  const validateFile = (file: File): string | null => {
    const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
    const isValidFormat =
      acceptedFormats.includes(fileExt) ||
      file.type.startsWith("audio/") ||
      file.type.startsWith("video/");

    if (!isValidFormat) {
      return `Unsupported format. Please upload MP3, MP4, WAV, or M4A.`;
    }

    if (file.size > maxFileSizeBytes) {
      return `File exceeds ${formatFileSize(maxFileSizeBytes)} limit.`;
    }

    return null;
  };

  /**
   * Process dropped/selected file:
   * 1. Validate file
   * 2. Animate upload progress
   * 3. Send POST /api/lectures
   * 4. Navigate to /workspace/[id]
   */
  const handleFileProcess = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      setErrorMessage(error);
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);
    setUploadProgress(15);
    setIsUploading(true);

    try {
      // Progress ticker for smooth visual feedback
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 18;
        });
      }, 70);

      // Hit FastAPI backend POST /api/lectures
      const lecture = await api.uploadLecture(file);

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (onFileSelect) {
        onFileSelect(file, lecture);
      }

      // Small spring settling delay before navigating
      setTimeout(() => {
        if (lecture.id) {
          router.push(`/workspace/${lecture.id}`);
        } else {
          router.push("/workspace");
        }
      }, 400);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to upload lecture to server. Please ensure backend is running.";
      setErrorMessage(msg);
      setIsUploading(false);
      setUploadProgress(0);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setIsWindowDragging(false);
    dragCounterRef.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileProcess(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleFileProcess(file);
    }
  };

  const handleUrlSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = mediaUrl.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      setErrorMessage("Please enter a valid URL (e.g. https://...)");
      setTimeout(() => setErrorMessage(null), 3500);
      return;
    }

    setErrorMessage(null);
    setIsUrlSubmitting(true);
    onUrlSubmit?.(trimmed);

    setTimeout(() => {
      setIsUrlSubmitting(false);
    }, 1000);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setMediaUrl("");
    setErrorMessage(null);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={cn("relative w-full", className)}>
      <motion.div
        ref={dropzoneRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        layout
        initial={{ opacity: 0, y: 15 }}
        animate={{
          opacity: 1,
          scale: isDragOver ? 1.025 : isHovered ? 1.01 : 1,
          y: isDragOver ? -4 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 280,
          damping: 22,
        }}
        className={cn(
          "relative w-full rounded-lg p-6 sm:p-8",
          "backdrop-blur-md bg-neutral-900/50 border border-white/10",
          "transition-all duration-300 overflow-hidden select-none",
          isActive
            ? "shadow-[0_0_50px_-10px_rgba(112,26,36,0.3)]"
            : "shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
        )}
      >
        {/* Dynamic Trailing Mouse Radial Glow */}
        <motion.div
          className="pointer-events-none absolute -inset-px rounded-lg opacity-0 transition-opacity duration-300"
          style={{
            background: radialBackground,
            opacity: isHovered && !isDragOver ? 1 : 0,
          }}
        />

        {/* Dynamic Border Spotlight Glow on Hover */}
        <motion.div
          className="pointer-events-none absolute -inset-px rounded-lg opacity-0 transition-opacity duration-300"
          style={{
            background: borderGlow,
            opacity: isHovered && !isDragOver ? 0.6 : 0,
            maskImage:
              "linear-gradient(black, black) content-box, linear-gradient(black, black)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "1px",
          }}
        />

        {/* Dashed Border -> Solid Burgundy Line on Drag/Active */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-lg transition-all duration-300",
            isActive
              ? "border border-solid border-primary shadow-[inset_0_0_20px_rgba(112,26,36,0.2)]"
              : "border border-dashed border-white/10"
          )}
        />

        {/* Specular Highlight Line */}
        <div className="pointer-events-none absolute inset-x-6 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <AnimatePresence mode="wait">
            {!selectedFile ? (
              /* Idle / Drop / URL Input Mode */
              <motion.div
                key="idle-mode"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2 }}
                className="w-full flex flex-col items-center"
              >
                {/* Upload Icon Badge */}
                <motion.div
                  animate={{
                    y: isDragOver ? -5 : 0,
                    scale: isDragOver ? 1.06 : 1,
                  }}
                  transition={{ type: "spring", stiffness: 320, damping: 20 }}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "group relative mb-4 flex h-12 w-12 cursor-pointer items-center justify-center rounded-md",
                    "bg-primary/10 border border-primary/20",
                    "transition-all duration-200 hover:border-primary/50 hover:bg-primary/20"
                  )}
                >
                  <Upload
                    className={cn(
                      "h-5 w-5 transition-colors duration-200",
                      isActive
                        ? "text-neutral-200"
                        : "text-neutral-400 group-hover:text-neutral-200"
                    )}
                    strokeWidth={1.8}
                  />
                </motion.div>

                {/* Primary Heading & Secondary Text */}
                <h3 className="text-lg sm:text-xl font-semibold tracking-tight text-white mb-1.5">
                  {isDragOver ? "Release to drop lecture" : "Drop a lecture to begin"}
                </h3>

                <p className="text-xs sm:text-sm text-neutral-400 tracking-tight max-w-xs mb-5 font-normal">
                  Drop MP3, MP4, or WAV to generate your structured learning plan.
                </p>

                {/* Hidden Native File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptedFormats.join(",")}
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {/* Manual File Select Action Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:text-white text-xs font-medium text-neutral-300 gap-2 cursor-pointer h-8"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose local file</span>
                </Button>

                {/* Minimal Subtle Divider */}
                <div className="relative w-full max-w-xs flex items-center justify-center my-5">
                  <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
                  <span className="px-3 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                    OR
                  </span>
                  <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
                </div>

                {/* Borderless URL Input with Accent Bottom Line on Focus */}
                <form
                  onSubmit={handleUrlSubmit}
                  className="relative w-full max-w-sm px-1"
                >
                  <div className="relative flex items-center">
                    <Link2
                      className={cn(
                        "h-3.5 w-3.5 transition-colors duration-150 ml-0.5 mr-2.5 flex-shrink-0",
                        isUrlFocused ? "text-stone-300" : "text-zinc-500"
                      )}
                    />

                    <input
                      type="url"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      onFocus={() => setIsUrlFocused(true)}
                      onBlur={() => setIsUrlFocused(false)}
                      placeholder="Paste YouTube, Zoom, or media link..."
                      className={cn(
                        "w-full bg-transparent py-2 pr-8 text-xs tracking-tight text-white placeholder-zinc-500",
                        "focus:outline-none border-none",
                        "selection:bg-[#701a24]/50"
                      )}
                    />

                    {/* Quick submit button */}
                    <div className="absolute right-0 flex items-center">
                      {mediaUrl.trim().length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                        >
                          <Button
                            type="submit"
                            size="icon"
                            disabled={isUrlSubmitting}
                            className={cn(
                              "h-6 w-6 rounded-md",
                              "bg-[#701a24] text-white shadow-none",
                              "hover:bg-[#881337] active:scale-95 transition-colors duration-150 cursor-pointer"
                            )}
                            aria-label="Submit URL"
                          >
                            {isUrlSubmitting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ArrowRight className="h-3 w-3" />
                            )}
                          </Button>
                        </motion.div>
                      )}
                    </div>
                  </div>

                  {/* Static minimal bottom base line */}
                  <div className="h-[1px] w-full bg-white/[0.08]" />

                  {/* Animated bottom accent border on focus */}
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#701a24]"
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{
                      scaleX: isUrlFocused ? 1 : 0,
                      opacity: isUrlFocused ? 1 : 0,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                    }}
                    style={{
                      transformOrigin: "center",
                    }}
                  />
                </form>
              </motion.div>
            ) : (
              /* Selected / Progress Mode */
              <motion.div
                key="uploading-mode"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="w-full flex flex-col items-center py-1"
              >
                <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#701a24]/20 border border-[#701a24]/40 text-stone-200 shadow-inner">
                  {selectedFile.type.startsWith("video/") ||
                  selectedFile.name.endsWith(".mp4") ? (
                    <FileVideo className="h-7 w-7" strokeWidth={1.75} />
                  ) : (
                    <FileAudio className="h-7 w-7" strokeWidth={1.75} />
                  )}
                  {uploadProgress === 100 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500 text-black shadow"
                    >
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    </motion.div>
                  )}
                </div>

                <div className="w-full max-w-xs text-center mb-5">
                  <h4 className="text-sm font-semibold tracking-tight text-white truncate mb-0.5">
                    {selectedFile.name}
                  </h4>
                  <p className="text-[11px] text-zinc-400 font-mono tracking-tight">
                    {formatFileSize(selectedFile.size)} •{" "}
                    {isBusy
                      ? `Uploading & Processing ${uploadProgress}%`
                      : uploadProgress < 100
                      ? `Uploading ${uploadProgress}%`
                      : "Redirecting to Workspace..."}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="relative w-full max-w-xs h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-6">
                  <motion.div
                    className="h-full bg-[#701a24] rounded-full"
                    initial={{ width: "0%" }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ ease: "easeOut", duration: 0.2 }}
                  />
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                    disabled={isBusy}
                    className="h-8 rounded-md border-white/10 bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08] text-xs font-medium cursor-pointer disabled:opacity-50 gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancel</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleFileProcess(selectedFile)}
                    className={cn(
                      "h-8 rounded-md text-xs font-medium cursor-pointer gap-1.5",
                      "bg-primary text-primary-foreground hover:bg-[#881337] transition-colors duration-150",
                      isBusy && "opacity-75 cursor-not-allowed shadow-none"
                    )}
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Process Lecture</span>
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="mt-4 flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs text-red-400"
              >
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span className="tracking-tight">{errorMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default HeroDropzone;
