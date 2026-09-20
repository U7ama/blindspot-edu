"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Sparkles,
  Bot,
  User,
  Lightbulb,
  CheckCircle2,
  ListOrdered,
  Volume2,
  VolumeX,
  Loader2,
  RotateCcw,
  BookOpen,
  ArrowRight,
  Presentation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, QAResponse, FlowStep, resolveAudioUrl } from "@/lib/api";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  data?: QAResponse;
}

interface ChatTabProps {
  lectureId?: number | null;
  currentPhaseOrder?: number;
  currentPhaseTitle?: string;
  onVoiceSpeak?: (text: string, audioUrl?: string | null) => void;
  onSwitchToVisualLesson?: (
    topic: string,
    explanation: string,
    flowSteps?: FlowStep[],
    analogy?: string,
    keyTakeaway?: string
  ) => void;
}

const DEFAULT_SUGGESTIONS = [
  "🎨 Teach me visually on whiteboard",
  "Explain this in simpler terms",
  "Give me a real-world analogy",
  "What are common pitfalls here?",
];

export const ChatTab: React.FC<ChatTabProps> = ({
  lectureId,
  currentPhaseOrder,
  currentPhaseTitle,
  onVoiceSpeak,
  onSwitchToVisualLesson,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-msg",
      sender: "assistant",
      text: "Hi! I'm your Blindspot Edu tutor grounded in this lecture. Ask me any question about the current concept, request real-world analogies, or ask for step-by-step breakdowns!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [inputQuery, setInputQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handlePlayVoice = (audioUrl?: string | null, messageId?: string, text?: string) => {
    if (playingAudioId === messageId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setPlayingAudioId(null);
      return;
    }

    const speakWithSynthesis = () => {
      if (text && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.onstart = () => setPlayingAudioId(messageId || "audio");
        utterance.onend = () => setPlayingAudioId(null);
        utterance.onerror = () => setPlayingAudioId(null);
        window.speechSynthesis.speak(utterance);
      } else if (text && onVoiceSpeak) {
        onVoiceSpeak(text);
      }
    };

    const resolved = resolveAudioUrl(audioUrl);
    if (!resolved) {
      speakWithSynthesis();
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    audioRef.current.src = resolved;
    audioRef.current
      .play()
      .then(() => {
        setPlayingAudioId(messageId || "audio");
      })
      .catch((err) => {
        console.warn("Audio playback failed, attempting SpeechSynthesis fallback:", err);
        speakWithSynthesis();
      });

    audioRef.current.onended = () => {
      setPlayingAudioId(null);
    };
    audioRef.current.onerror = () => {
      speakWithSynthesis();
    };
  };

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery("");
    setIsLoading(true);

    try {
      let qaResult: QAResponse | null = null;

      if (lectureId) {
        // 1. Try dedicated /api/lectures/{id}/qa endpoint
        try {
          qaResult = await api.askLectureQuestion(
            lectureId,
            textToSend,
            currentPhaseOrder
          );
        } catch (qaErr) {
          console.warn("Direct QA endpoint not yet loaded or 404, falling back to session orchestrator command:", qaErr);
        }

        // 2. Fallback to live session command (always available in orchestrator)
        if (!qaResult) {
          try {
            const events = await api.sendCommand(
              lectureId,
              `sess_chat_${Date.now()}`,
              "question",
              textToSend
            );
            const speakEvent = events.find((e) => e.type === "speaking");
            if (speakEvent && speakEvent.payload) {
              const payload = speakEvent.payload as Record<string, unknown>;
              qaResult = {
                question: textToSend,
                phase_order: currentPhaseOrder,
                explanation: (payload.text as string) || "Here is the explanation based on the lecture.",
                key_takeaway: (payload.key_takeaway as string) || null,
                analogy: (payload.analogy as string) || null,
                flow_steps: (payload.flow_steps as FlowStep[]) || null,
                audio_url: (payload.audio_url as string) || null,
              };
            }
          } catch (cmdErr) {
            console.warn("Session command fallback note:", cmdErr);
          }
        }
      }

      // 3. Fallback to smart pedagogical response if offline / local mock
      if (!qaResult) {
        await new Promise((res) => setTimeout(res, 400));
        qaResult = {
          question: textToSend,
          phase_order: currentPhaseOrder,
          explanation: `In this section on ${currentPhaseTitle || "the lesson"}, understanding the underlying principle is key. When we analyze this mechanism, each step builds directly on the core foundation.`,
          key_takeaway: `Master the foundational relationship of ${currentPhaseTitle || "this topic"} to predict downstream effects.`,
          analogy: "Like calibrating a thermostat: small adjustments continuously bring the system back into balance.",
          flow_steps: [
            { step_number: 1, title: "Initial State", detail: "Identify baseline conditions and active constraints." },
            { step_number: 2, title: "Transformation", detail: "Apply the governing principle to evaluate how values shift." },
            { step_number: 3, title: "Resolution", detail: "Check whether equilibrium or desired output is achieved." },
          ],
        };
      }

      const assistantMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: "assistant",
        text: qaResult.explanation,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        data: qaResult,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Check if user requested visual teaching or AI flagged visual intent
      const isVisualRequest =
        textToSend.toLowerCase().includes("visual") ||
        textToSend.toLowerCase().includes("whiteboard") ||
        textToSend.toLowerCase().includes("draw") ||
        textToSend.toLowerCase().includes("diagram") ||
        textToSend.toLowerCase().includes("graph") ||
        Boolean(qaResult.visual_intent);

      if (isVisualRequest && onSwitchToVisualLesson) {
        onSwitchToVisualLesson(
          qaResult.whiteboard_topic || currentPhaseTitle || "Interactive Visual Lesson",
          qaResult.explanation,
          qaResult.flow_steps || undefined,
          qaResult.analogy || undefined,
          qaResult.key_takeaway || undefined
        );
      }

      if (onVoiceSpeak && qaResult.explanation) {
        onVoiceSpeak(qaResult.explanation, qaResult.audio_url);
      }
    } catch (err) {
      console.error("Q&A query processing error:", err);
      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        text: "I encountered a slight hiccup answering that question. Feel free to rephrase or try again!",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full w-full flex flex-col min-h-0 bg-neutral-950 text-neutral-200 select-text">
      {/* Context Badge Banner */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-neutral-900/30 shrink-0 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          <span className="text-neutral-400 truncate text-[11px]">
            Context:{" "}
            <strong className="text-neutral-200 font-medium">
              {currentPhaseTitle || "Full Lecture"}
            </strong>
          </span>
        </div>
        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider shrink-0">
          qa.py
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {messages.map((msg) => {
          const isUser = msg.sender === "user";
          const hasVisualAids = Boolean(
            msg.data?.visual_intent ||
            (msg.data?.flow_steps && msg.data.flow_steps.length > 0) ||
            msg.text.toLowerCase().includes("whiteboard") ||
            msg.text.toLowerCase().includes("visual")
          );

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "flex flex-col gap-1.5 max-w-[92%]",
                isUser ? "ml-auto items-end" : "mr-auto items-start"
              )}
            >
              {/* Sender Header */}
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-500 px-1">
                {isUser ? (
                  <>
                    <span>You</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-neutral-400" />
                    <span className="text-neutral-300 font-medium">AI Tutor</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </>
                )}
              </div>

              {/* Message Body */}
              <div
                className={cn(
                  "p-3.5 sm:p-4 rounded-2xl text-xs leading-relaxed transition-all shadow-sm",
                  isUser
                    ? "bg-[#701a24] text-white border border-[#881337] rounded-br-sm"
                    : "bg-neutral-900/90 text-neutral-200 border border-white/[0.08] rounded-bl-sm space-y-3.5 backdrop-blur-md"
                )}
              >
                {/* Primary Verbal Explanation */}
                <p className="whitespace-pre-wrap font-normal text-left">
                  {msg.text}
                </p>

                {/* Structured Rich Aids if returned from qa.py */}
                {msg.data && (
                  <div className="space-y-3 pt-2 border-t border-white/10 text-left">
                    {/* Interactive Live Whiteboard Launch Button */}
                    {hasVisualAids && onSwitchToVisualLesson && (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() =>
                          onSwitchToVisualLesson(
                            msg.data?.whiteboard_topic || currentPhaseTitle || "Interactive Visual Lesson",
                            msg.text,
                            msg.data?.flow_steps || undefined,
                            msg.data?.analogy || undefined,
                            msg.data?.key_takeaway || undefined
                          )
                        }
                        className="w-full flex items-center justify-between p-2.5 rounded-lg bg-gradient-to-r from-[#701a24]/30 via-neutral-900 to-neutral-900 border border-[#881337]/50 hover:border-[#881337] text-neutral-200 hover:text-white transition-all cursor-pointer shadow-sm group"
                      >
                        <div className="flex items-center gap-2">
                          <Presentation className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-semibold text-amber-200">
                            🎨 Open Live AI Whiteboard Lesson
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-neutral-400 group-hover:text-amber-300">
                          <span>View Board</span>
                          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </motion.button>
                    )}

                    {/* Key Takeaway */}
                    {msg.data.key_takeaway && (
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] font-mono text-emerald-400 block font-semibold uppercase tracking-wider">
                            Key Takeaway
                          </span>
                          <p className="text-neutral-300 text-xs mt-0.5">
                            {msg.data.key_takeaway}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Analogy */}
                    {msg.data.analogy && (
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] font-mono text-amber-400 block font-semibold uppercase tracking-wider">
                            Intuitive Analogy
                          </span>
                          <p className="text-neutral-300 text-xs mt-0.5">
                            {msg.data.analogy}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Visual Flow Steps */}
                    {msg.data.flow_steps && msg.data.flow_steps.length > 0 && (
                      <div className="space-y-1.5 p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 font-semibold uppercase tracking-wider mb-1">
                          <ListOrdered className="w-3 h-3 text-neutral-400" />
                          Step-by-Step Flow
                        </div>
                        <div className="space-y-1.5">
                          {msg.data.flow_steps.map((step) => (
                            <div
                              key={`step-${step.step_number}`}
                              className="flex items-start gap-2 text-xs bg-neutral-950/60 p-2 rounded-md border border-white/5"
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-mono font-bold text-neutral-200">
                                {step.step_number}
                              </span>
                              <div>
                                <span className="font-medium text-neutral-200 block">
                                  {step.title}
                                </span>
                                <span className="text-neutral-400 text-[11px] leading-snug">
                                  {step.detail}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Voice Read Aloud Action Button */}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => handlePlayVoice(msg.data?.audio_url, msg.id, msg.text)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-neutral-300 hover:text-white transition-all cursor-pointer"
                      >
                        {playingAudioId === msg.id ? (
                          <>
                            <VolumeX className="w-3 h-3 text-rose-400" />
                            <span>Stop Audio</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3 text-neutral-400" />
                            <span>Read Aloud</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}

        {/* Loading / Thinking Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-900/60 p-3 rounded-xl border border-white/5 max-w-xs"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />
            <span>Consulting lecture context via qa.py...</span>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-4 py-2 border-t border-white/5 bg-neutral-950/80 overflow-x-auto flex items-center gap-1.5 scrollbar-none shrink-0">
        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mr-1 shrink-0">
          Suggested:
        </span>
        {DEFAULT_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => handleSend(suggestion)}
            className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 text-[11px] text-neutral-300 hover:text-white transition-all whitespace-nowrap cursor-pointer shrink-0"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {/* Interactive Input Bar */}
      <div className="p-3 sm:p-4 border-t border-white/5 bg-neutral-950 shrink-0">
        <div className="relative flex items-center bg-neutral-900/80 border border-white/10 rounded-xl focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/20 transition-all">
          <textarea
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            rows={1}
            disabled={isLoading}
            className="w-full bg-transparent px-3.5 py-2 text-xs text-neutral-200 placeholder-neutral-500 resize-none focus:outline-none max-h-24 min-h-[36px] leading-normal"
          />

          <div className="pr-2 shrink-0">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              disabled={!inputQuery.trim() || isLoading}
              onClick={() => handleSend()}
              className={cn(
                "h-7 w-7 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-sm",
                inputQuery.trim() && !isLoading
                  ? "bg-neutral-100 hover:bg-white text-neutral-950"
                  : "bg-white/5 text-neutral-600 cursor-not-allowed"
              )}
              title="Send question (Enter)"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatTab;
