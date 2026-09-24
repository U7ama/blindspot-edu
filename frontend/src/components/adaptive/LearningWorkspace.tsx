"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Volume2,
  VolumeX,
  FileSearch,
  Sparkles,
  HelpCircle,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  FileText,
  CheckSquare,
  Check,
  Send,
  CornerDownRight,
  ChevronDown,
  Compass,
} from "lucide-react";
import LecturePlayer from "./LecturePlayer";
import ProcessingCenter from "./ProcessingCenter";
import Shell, { button, secondary, panel } from "./Shell";
import {
  request,
  Recording,
  Session,
  Evidence,
  timestamp,
  Me,
  me,
} from "@/lib/adaptive";
const labels: Record<string, string> = {
  under_explained: "Under-explained in lecture",
  explained_elsewhere: "Explained elsewhere",
  inferred_prerequisite: "Inferred prerequisite",
  uncertain: "Possible prerequisite",
};
const progressLabels: Record<string, string> = {
  unchecked: "Not checked",
  needs_help: "Still needs practice",
  passed_check: "Passed this check",
  skipped: "Skipped",
};

interface SpokenHighlight {
  targetId: string;
  charIndex: number;
  charLength: number;
}

function getPreferredBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    return (
      voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Natural") ||
            v.name.includes("Google") ||
            v.name.includes("Premium") ||
            v.name.includes("Samantha")),
      ) ||
      voices.find((v) => v.lang.startsWith("en") && v.default) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      null
    );
  } catch {
    return null;
  }
}

function ReadAlongText({
  text,
  targetId,
  highlight,
  offset = 0,
}: {
  text: string;
  targetId: string;
  highlight: SpokenHighlight | null;
  offset?: number;
}) {
  if (
    !highlight ||
    highlight.targetId !== targetId ||
    highlight.charIndex < offset ||
    highlight.charIndex >= offset + text.length
  ) {
    return <>{text}</>;
  }

  const relStart = Math.max(0, highlight.charIndex - offset);
  const relEnd = Math.min(
    text.length,
    relStart + Math.max(1, highlight.charLength),
  );

  if (relStart >= relEnd || relStart >= text.length) {
    return <>{text}</>;
  }

  const before = text.slice(0, relStart);
  const word = text.slice(relStart, relEnd);
  const after = text.slice(relEnd);

  return (
    <>
      {before}
      <mark className="read-along-word">{word}</mark>
      {after}
    </>
  );
}

function getWordTokens(text: string) {
  const regex = /[\p{L}\p{N}'’_-]+/gu;
  const tokens: Array<{ charIndex: number; charLength: number; word: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    tokens.push({ charIndex: m.index, charLength: m[0].length, word: m[0] });
  }
  return tokens;
}

export default function LearningWorkspace() {
  const params = useParams();
  const id = String(params.id);
  const [record, setRecord] = useState<Recording | null>(null);
  const [state, setState] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<Evidence[]>([]);
  const [sourceMessage, setSourceMessage] = useState("");
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState<{
    explanation: string;
    steps: string[];
    provenance: string;
    related_evidence_ids: string[];
  } | null>(null);
  const [user, setUser] = useState<Me | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [spokenWord, setSpokenWord] = useState<SpokenHighlight | null>(null);
  const [speakingTarget, setSpeakingTarget] = useState<string | null>(null);
  const cadenceRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    tokens: Array<{ charIndex: number; charLength: number; word: string }>;
    index: number;
    targetId: string;
  }>({ timer: null, tokens: [], index: 0, targetId: "" });
  const voiceRef = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const narration = useRef<HTMLAudioElement | null>(null);
  const submitKey = useRef<string | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (voiceRef.current && !voiceRef.current.contains(event.target as Node)) {
        setVoiceOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setVoiceOpen(false);
      }
    }
    if (voiceOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [voiceOpen]);
  async function load() {
    try {
      const rec = await request<Recording>(`/recordings/${id}`);
      setRecord(rec);
      if (rec.status === "ready")
        setState(await request<Session>(`/recordings/${id}/session`, {}));
      setUser(await me());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function stopAudio() {
    narration.current?.pause();
    if (cadenceRef.current.timer) {
      clearTimeout(cadenceRef.current.timer);
      cadenceRef.current.timer = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setSpokenWord(null);
    setSpeakingTarget(null);
  }
  useEffect(() => {
    void load();
    return () => {
      stopAudio();
    };
  }, [id]);
  useEffect(() => {
    if (!record || !["queued", "processing"].includes(record.status)) return;
    let loading = false;
    const interval = setInterval(async () => {
      if (loading) return;
      loading = true;
      try { await load(); } finally { loading = false; }
    }, 4000);
    return () => clearInterval(interval);
  }, [id, record?.status]);
  useEffect(() => {
    submitKey.current = null;
  }, [state?.active?.question_id, state?.revision]);
  const doc = record?.document;
  const phase = doc?.phases.find((p) => p.id === state?.phase_id);
  const concept = doc?.concepts.find((c) => c.id === state?.active?.concept_id);
  const active = state?.active;
  async function act(action: string, target?: string) {
    if (!state) return;
    setBusy(true);
    setError("");
    stopAudio();
    try {
      setState(
        await request<Session>(`/recordings/${id}/command`, {
          action,
          target,
          revision: state.revision,
        }),
      );
      setReply(null);
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function answer(index: number) {
    if (!state || !active?.question) return;
    setBusy(true);
    setError("");
    submitKey.current ??= crypto.randomUUID();
    try {
      const result = await request<{ state: Session }>(
        `/recordings/${id}/answer`,
        {
          request_id: submitKey.current,
          question_id: active.question.id,
          selected_index: index,
          revision: state.revision,
        },
      );
      setState(result.state);
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function showSource(ids: string[]) {
    setError("");
    try {
      const targetIds = (ids || []).slice(0, 100);
      const result = await request<{
        type: string;
        segments?: Evidence[];
        message?: string;
      }>(`/recordings/${id}/source`, { evidence_ids: targetIds });
      setSource(result.segments || []);
      setSourceMessage(result.message || "");
      if (result.segments?.length && player.current) {
        player.current.currentTime = result.segments[0].start;
        player.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function speakBrowser(kind: "phase" | "remediation", target: string) {
    stopAudio();

    const targetId = `${kind}-${target}`;
    let textToRead = "";

    if (kind === "phase") {
      const p = doc?.phases.find((item) => item.id === target) || phase;
      if (p) {
        textToRead = p.teaching_script;
      }
    } else if (kind === "remediation") {
      const c = doc?.concepts.find((item) => item.id === target);
      if (c?.remediation) {
        const explanation = active?.retry
          ? c.remediation.simpler_explanation
          : c.remediation.explanation;
        textToRead = `${explanation} ${c.remediation.worked_example}`;
      }
    }

    if (!textToRead.trim()) {
      setError("No explanation text is available to narrate.");
      return;
    }

    const tokens = getWordTokens(textToRead);
    if (tokens.length === 0) return;

    setSpeakingTarget(targetId);

    // 1. Instant first word highlight for immediate visual feedback
    setSpokenWord({
      targetId,
      charIndex: tokens[0].charIndex,
      charLength: tokens[0].charLength,
    });

    cadenceRef.current = {
      timer: null,
      tokens,
      index: 0,
      targetId,
    };

    // 2. Universal Cadence Driver (ensures live word highlighting across all platforms)
    function advanceCadence(idx: number) {
      if (idx >= tokens.length) {
        stopAudio();
        return;
      }
      cadenceRef.current.index = idx;
      setSpokenWord({
        targetId,
        charIndex: tokens[idx].charIndex,
        charLength: tokens[idx].charLength,
      });

      const token = tokens[idx];
      let durationMs = Math.max(260, Math.min(520, 260 + (token.charLength - 3) * 25));
      const nextChar = textToRead[token.charIndex + token.charLength];
      if (nextChar === "." || nextChar === "!" || nextChar === "?") {
        durationMs += 250;
      } else if (nextChar === "," || nextChar === ";" || nextChar === ":") {
        durationMs += 130;
      }

      cadenceRef.current.timer = setTimeout(() => {
        advanceCadence(idx + 1);
      }, durationMs);
    }

    let firstDuration = Math.max(260, Math.min(520, 260 + (tokens[0].charLength - 3) * 25));
    const firstNextChar = textToRead[tokens[0].charIndex + tokens[0].charLength];
    if (firstNextChar === "." || firstNextChar === "!" || firstNextChar === "?") firstDuration += 250;
    else if (firstNextChar === "," || firstNextChar === ";" || firstNextChar === ":") firstDuration += 130;

    cadenceRef.current.timer = setTimeout(() => {
      advanceCadence(1);
    }, firstDuration);

    // 3. Audio Speech Synthesis Integration (with onboundary audio-sync and GC protection)
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.rate = 1.0;
        utterance.lang = "en-US";
        const voice = getPreferredBrowserVoice();
        if (voice) {
          utterance.voice = voice;
        }

        utterance.onboundary = (event: SpeechSynthesisEvent) => {
          if (event.name === "word" || !event.name) {
            let idx = event.charIndex;
            while (idx < textToRead.length && /\s/.test(textToRead[idx])) {
              idx++;
            }
            let len = event.charLength;
            if (!len || len <= 0) {
              const match = textToRead.slice(idx).match(/^[\p{L}\p{N}'’_-]+/u);
              len = match ? match[0].length : (textToRead.slice(idx).match(/^\S+/)?.[0].length || 1);
            } else {
              const rawSlice = textToRead.slice(idx, idx + len);
              const wordMatch = rawSlice.match(/^[\p{L}\p{N}'’_-]+/u);
              if (wordMatch) {
                len = wordMatch[0].length;
              }
            }
            // Authoritative audio boundary event updates active word
            setSpokenWord({
              targetId,
              charIndex: idx,
              charLength: len,
            });
            const matchedIdx = tokens.findIndex((t) => t.charIndex >= idx);
            if (matchedIdx >= 0) {
              cadenceRef.current.index = matchedIdx;
            }
          }
        };

        utterance.onend = () => {
          stopAudio();
        };

        utterance.onerror = (e) => {
          // If canceled or interrupted explicitly, stop.
          // If synthesis-failed (e.g. Linux desktop without speech daemon), cadence timer keeps visual read-along flowing!
          if (e.error === "canceled" || e.error === "interrupted") {
            stopAudio();
          }
        };

        (window as unknown as { _activeUtterance: unknown })._activeUtterance = utterance;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Cadence timer continues seamlessly
      }
    }
  }

  async function speak(kind: "phase" | "remediation", target: string) {
    setBusy(true);
    setError("");
    stopAudio();
    player.current?.pause();

    const targetId = `${kind}-${target}`;
    const activeVoice = user?.preferences?.voice || "Browser";

    // If active voice is Browser (default), directly play native speech with live word highlighting
    if (activeVoice === "Browser") {
      try {
        speakBrowser(kind, target);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      const result = await request<{ audio_url: string }>(
        `/recordings/${id}/narration`,
        { kind, target },
      );
      const audio = new Audio(result.audio_url);
      narration.current = audio;
      setSpeakingTarget(targetId);
      audio.onended = () => setSpeakingTarget(null);
      audio.onerror = () => setSpeakingTarget(null);
      await audio.play();
    } catch {
      // If cloud TTS is unavailable (e.g. 503 Service Unavailable), fallback gracefully to browser voice with highlighting
      try {
        speakBrowser(kind, target);
      } catch {
        setError("You can continue reading the lesson text.");
      }
    } finally {
      setBusy(false);
    }
  }
  async function ask() {
    setBusy(true);
    setError("");
    try {
      setReply(
        await request(`/recordings/${id}/question`, { question: query }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <main className="mx-auto max-w-7xl px-5 sm:px-8 pt-8 sm:pt-10 pb-20 sm:pb-28">
        <Link className="text-sm text-[var(--muted-ink)] inline-flex items-center gap-1.5 hover:text-[var(--accent-ink)] transition-colors" href="/workspace">
          <ArrowLeft className="w-4 h-4" /> All lectures
        </Link>
        {error && (
          <div
            role="alert"
            className="my-5 rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-200"
          >
            {error}
          </div>
        )}
        {!record ? (
          <div className="mt-7 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="h-3.5 w-36 rounded bg-[var(--surface-soft)] animate-pulse" />
                <div className="h-9 w-72 sm:w-96 rounded-lg bg-[var(--surface-soft)] animate-pulse" />
                <div className="h-4 w-48 rounded bg-[var(--surface-soft)] animate-pulse" />
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)_300px]">
              <div className="space-y-3">
                <div className="h-3 w-24 rounded bg-[var(--surface-soft)] mb-4 animate-pulse" />
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]/50 animate-pulse"
                  />
                ))}
              </div>
              <div
                className={`${panel} min-h-[360px] flex flex-col justify-between`}
              >
                <div className="space-y-4">
                  <div className="h-3 w-32 rounded bg-[var(--surface-soft)] animate-pulse" />
                  <div className="h-7 w-2/3 rounded bg-[var(--surface-soft)] animate-pulse" />
                  <div className="space-y-2 pt-2">
                    <div className="h-4 w-full rounded bg-[var(--surface-soft)] animate-pulse" />
                    <div className="h-4 w-5/6 rounded bg-[var(--surface-soft)] animate-pulse" />
                    <div className="h-4 w-4/6 rounded bg-[var(--surface-soft)] animate-pulse" />
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <div className="h-10 w-36 rounded-xl bg-[var(--surface-soft)] animate-pulse" />
                  <div className="h-10 w-24 rounded-xl bg-[var(--surface-soft)] animate-pulse" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="aspect-video w-full rounded-2xl bg-[var(--surface-soft)] animate-pulse border border-[var(--line)]" />
                <div className={`${panel} h-44 animate-pulse space-y-3`}>
                  <div className="h-4 w-32 rounded bg-[var(--surface-soft)]" />
                  <div className="h-3 w-full rounded bg-[var(--surface-soft)]" />
                  <div className="h-3 w-4/5 rounded bg-[var(--surface-soft)]" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="my-7 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-[var(--accent-ink)]">
                  {record.public
                    ? "Public lecture · saved lesson"
                    : "Your lecture"}
                </p>
                <h1 className="mt-2 text-2xl sm:text-4xl font-semibold tracking-tight break-words [overflow-wrap:anywhere]">
                  {record.title}
                </h1>
                <p className="mt-2 text-sm text-[var(--muted-ink)]">
                  {timestamp(record.duration)} ·{" "}
                  {record.status === "ready"
                    ? "Evidence-linked learning"
                    : record.status}
                </p>
              </div>
              {state && (
                <button
                  className={`${secondary} inline-flex items-center gap-1.5`}
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Restart this lesson and reset its check progress?",
                      )
                    )
                      void act("restart");
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restart lesson
                </button>
              )}
            </div>
            {["queued", "processing", "failed"].includes(record.status) ? (
              <ProcessingCenter
                record={record}
                user={user}
                retrying={busy}
                onRetry={record.public ? undefined : async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await request(`/recordings/${id}/retry`, {});
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : record.status === "insufficient_content" ? (
              <div className="mt-4 space-y-8">
                {/* Modern Status Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Insufficient Educational Content
                      </span>
                      <span className="text-xs font-mono text-[var(--muted-ink)]">
                        Original Media Preserved
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--foreground)]">
                      Not enough educational content identified
                    </h2>
                    <p className="text-sm text-[var(--muted-ink)] max-w-2xl leading-relaxed">
                      We transcribed and analyzed your recording, but could not detect structured teaching concepts, clear worked examples, or educational phases to assemble a verified lesson.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href="/workspace" className={`${button} inline-flex items-center gap-2 text-sm`}>
                      <Compass className="w-4 h-4" />
                      Browse Courses
                    </Link>
                  </div>
                </div>

                {/* 2-Column Responsive Layout: Left = Guidance & Next Steps, Right = Compact Player */}
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_460px] items-start">
                  {/* Left Column: Pedagogical Guarantees & Actions */}
                  <div className="space-y-6">
                    <div className={`${panel} space-y-4`}>
                      <h3 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        Why does Blindspot stop here?
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2 text-xs">
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]/60 p-4 space-y-2">
                          <strong className="text-[var(--foreground)] block text-sm">
                            No Hallucinated Curriculum
                          </strong>
                          <p className="text-[var(--muted-ink)] leading-relaxed">
                            Blindspot strictly adheres to source evidence. When lecture explanations are absent or too brief, we refuse to invent fake prerequisites or quizzes.
                          </p>
                        </div>
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]/60 p-4 space-y-2">
                          <strong className="text-[var(--foreground)] block text-sm">
                            Full Media & Transcript Preserved
                          </strong>
                          <p className="text-[var(--muted-ink)] leading-relaxed">
                            Your audio/video and timestamped transcript are permanently saved and searchable in the review player on the right.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`${panel} space-y-4`}>
                      <h3 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[var(--accent-ink)]" />
                        Recommended Next Steps
                      </h3>
                      <ul className="space-y-3 text-xs text-[var(--muted-ink)]">
                        <li className="flex items-start gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-ink)]/10 text-[var(--accent-ink)] font-mono text-[11px] font-bold">1</span>
                          <span><strong>Try a concept-focused recording:</strong> Videos explaining an algorithm, system architecture, mathematical rule, or code example yield the richest interactive lessons.</span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-ink)]/10 text-[var(--accent-ink)] font-mono text-[11px] font-bold">2</span>
                          <span><strong>Review the raw transcript:</strong> Inspect the transcript segments in the player on the right to verify audio capture accuracy.</span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-ink)]/10 text-[var(--accent-ink)] font-mono text-[11px] font-bold">3</span>
                          <span><strong>Explore pre-loaded public lectures:</strong> Check out the complete courses in the catalog to experience full multi-phase lessons and prerequisite remediation.</span>
                        </li>
                      </ul>
                      <div className="pt-2 flex flex-wrap gap-3">
                        <Link href="/workspace" className={`${button} inline-flex items-center gap-1.5 text-xs`}>
                          <BookOpen className="w-3.5 h-3.5" />
                          Explore Course Catalog
                        </Link>
                        <Link href="/" className={`${secondary} inline-flex items-center gap-1.5 text-xs`}>
                          <ArrowLeft className="w-3.5 h-3.5" />
                          Record New Lecture
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Compact Media Player & Transcript */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1 text-xs font-mono text-[var(--muted-ink)]">
                      <span className="uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[var(--accent-ink)]" />
                        Original Recording Review
                      </span>
                      <span>{record.segments?.length || 0} transcript segments</span>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-xl">
                      <LecturePlayer
                        src={`/api/v1/recordings/${id}/media`}
                        title={record.title}
                        segments={record.segments || []}
                        phases={[]}
                        mediaRef={player}
                        onPlay={stopAudio}
                      />
                    </div>
                    <p className="text-[11px] text-center text-[var(--muted-ink)]">
                      Full recording and searchable transcript preserved without alterations.
                    </p>
                  </div>
                </div>
              </div>
            ) : record.status !== "ready" ? (
              <section className={panel}>
                <h2 className="text-xl">
                  {record.status === "failed"
                    ? "Processing needs attention"
                    : "Preparing your lesson"}
                </h2>
                <p className="mt-3 text-[var(--muted-ink)]">
                  {record.error ||
                    "Your recording is queued for transcription and evidence checks. You can leave this page and return."}
                </p>
              </section>
            ) : doc && phase && state ? (
              <>
              <div className="workspace-watch">
                <LecturePlayer src={`/api/v1/recordings/${id}/media`} title={record.title} segments={doc.segments} phases={doc.phases} mediaRef={player} onPlay={stopAudio}/>
                <section className="workspace-overview">
                  <p className="eyebrow">YOUR LEARNING PATH</p>
                  <h2>Watch. Connect.<br/>Put it into practice.</h2>
                  <p>Explore the original recording above or follow the guided lesson below. Chapters seek to supporting excerpts; they don’t mark a lesson complete.</p>
                  <div className="workspace-stats"><div><strong>{doc.phases.length}</strong><span>lesson phases</span></div><div><strong>{doc.concepts.filter(c=>c.remediation).length}</strong><span>prerequisite checks</span></div><div><strong>{Object.values(state.progress).filter(s=>s==="passed_check").length}</strong><span>checks passed</span></div></div>
                  <div className="workspace-position"><span>{state.ended ? "Lesson complete" : `Current phase ${doc.phases.findIndex(p=>p.id===phase.id)+1} of ${doc.phases.length}`}</span><strong>{phase.title}</strong></div>
                  <a className={button} href="#guided-lesson">Continue guided lesson <ArrowRight size={15}/></a>
                </section>
              </div>
              <div id="guided-lesson" className="lesson-section-title"><BookOpen size={18}/><h2>Your guided lesson</h2><span>Read, check and build on what you know</span></div>
              <div className="lesson-layout">
                <aside className="lesson-roadmap space-y-3">
                  <p className="mb-4 text-xs font-mono uppercase text-[var(--muted-ink)]">
                    Lesson roadmap
                  </p>
                  {doc.phases.map((p, i) => (
                    <button
                      key={p.id}
                      disabled={busy}
                      aria-current={p.id === phase.id ? "step" : undefined}
                      onClick={() => void act("go_to_phase", p.id)}
                      className={`block w-full rounded-xl border p-4 text-left text-sm ${p.id === phase.id ? "border-rose-800 bg-[#701a24]/20" : "border-[var(--line)] text-[var(--muted-ink)] hover:bg-[var(--surface-soft)]"}`}
                    >
                      <span className="mr-2 font-mono text-[var(--muted-ink)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {p.title}
                    </button>
                  ))}
                  <p className="pt-3 text-xs leading-5 text-[var(--muted-ink)]">
                    Explore any phase freely to review key concepts, inspect source evidence, and test your understanding at your own pace.
                  </p>
                </aside>
                <div className="space-y-5">
                  {state.ended ? (
                    <section className={panel}>
                      <p className="text-xs uppercase tracking-widest text-[var(--accent-ink)]">
                        Lesson complete
                      </p>
                      <h2 className="mt-3 text-2xl">
                        Keep the next step visible.
                      </h2>
                      <p className="mt-3 text-[var(--muted-ink)]">
                        You reached the end. Your check results are preserved
                        below; revisit any phase from the roadmap.
                      </p>
                    </section>
                  ) : (
                    <section className={panel}>
                      <span className="text-xs font-mono text-[var(--success)]">
                        Lecture explanation
                      </span>
                      <h2 className="mt-3 text-2xl font-medium">
                        {phase.title}
                      </h2>
                      <p className="mt-5 whitespace-pre-wrap leading-8 text-[var(--ink-soft)]">
                        <ReadAlongText
                          text={phase.teaching_script}
                          targetId={`phase-${phase.id}`}
                          highlight={spokenWord}
                        />
                      </p>
                      <div className="mt-6 flex flex-wrap gap-2">
                        <button
                          className={`${secondary} inline-flex items-center gap-1.5`}
                          disabled={busy}
                          onClick={() => void showSource(phase.evidence_ids)}
                        >
                          <FileSearch className="w-4 h-4" />
                          Inspect lecture evidence
                        </button>
                        <button
                          className={`${secondary} inline-flex items-center gap-1.5`}
                          disabled={busy}
                          onClick={() => void speak("phase", phase.id)}
                        >
                          <Volume2
                            className={`w-4 h-4 ${
                              speakingTarget === `phase-${phase.id}`
                                ? "text-[var(--accent-ink)] animate-pulse"
                                : ""
                            }`}
                          />
                          {speakingTarget === `phase-${phase.id}` ? "Narrating…" : "Listen"}
                        </button>
                        <button
                          className={`${secondary} inline-flex items-center gap-1.5`}
                          onClick={() => stopAudio()}
                        >
                          <VolumeX className="w-4 h-4" />
                          Stop audio
                        </button>
                      </div>
                    </section>
                  )}
                  {!state.ended && phase.prerequisite_ids.length > 0 && (
                    <section className={panel}>
                      <h3 className="font-medium">Before you continue</h3>
                      <p className="mt-2 text-sm text-[var(--muted-ink)]">
                        An assumed prerequisite may already be familiar. Check
                        it or choose to review.
                      </p>
                      <div className="mt-4 space-y-4">
                        {phase.prerequisite_ids.map((cid) => {
                          const c = doc.concepts.find((c) => c.id === cid);
                          if (!c) return null;
                          return (
                            <div
                              key={cid}
                              className="rounded-xl border border-[var(--line)] p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="font-medium">{c.name}</h4>
                                <span className="text-xs text-[var(--accent-ink)]">
                                  {
                                    progressLabels[
                                      state.progress[cid] || "unchecked"
                                    ]
                                  }
                                </span>
                              </div>
                              <p className="mt-2 text-xs text-[var(--muted-ink)]">
                                {labels[c.coverage]}
                              </p>
                              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                                {c.reason}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {c.remediation && (
                                  <>
                                    <button
                                      className={`${button} inline-flex items-center gap-1.5`}
                                      disabled={busy}
                                      onClick={() =>
                                        void act(
                                          state.progress[cid] === "needs_help"
                                            ? "teach"
                                            : "check",
                                          cid,
                                        )
                                      }
                                    >
                                      {state.progress[cid] === "needs_help" ? (
                                        <>
                                          <BookOpen className="w-4 h-4" />
                                          Review prerequisite
                                        </>
                                      ) : (
                                        <>
                                          <HelpCircle className="w-4 h-4" />
                                          Check my knowledge
                                        </>
                                      )}
                                    </button>
                                    <button
                                      className={`${secondary} inline-flex items-center gap-1.5`}
                                      disabled={busy}
                                      onClick={() => void act("teach", cid)}
                                    >
                                      <Sparkles className="w-4 h-4" />
                                      Teach me
                                    </button>
                                    <button
                                      className={`${secondary} inline-flex items-center gap-1.5`}
                                      disabled={busy}
                                      onClick={() => void act("skip", cid)}
                                    >
                                      <SkipForward className="w-4 h-4" />
                                      Continue without passing
                                    </button>
                                  </>
                                )}
                                <button
                                  className={`${secondary} inline-flex items-center gap-1.5`}
                                  onClick={() =>
                                    void showSource(c.evidence_ids)
                                  }
                                >
                                  <FileText className="w-4 h-4" />
                                  Related excerpt
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                  {active?.mode === "question" && active.question && (
                    <section
                      key={active.question.id}
                      className={`${panel} border-rose-900`}
                    >
                      <p className="text-xs uppercase tracking-widest text-[var(--accent-ink)]">
                        {active.question.purpose === "diagnostic"
                          ? "Prerequisite check"
                          : "Apply what you learned"}
                      </p>
                      <h3 className="mt-4 text-xl">
                        {active.question.question}
                      </h3>
                      <div className="mt-5 space-y-3">
                        {active.question.options.map((option, i) => (
                          <button
                            key={i}
                            disabled={busy}
                            onClick={() => void answer(i)}
                            className="block w-full rounded-xl border border-[var(--line)] p-4 text-left text-sm hover:border-rose-600 disabled:opacity-50"
                          >
                            <span className="mr-3 text-[var(--muted-ink)]">
                              {String.fromCharCode(65 + i)}
                            </span>
                            {option}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {active?.mode === "lesson" && concept?.remediation && (
                    <section className={`${panel} border-rose-900`}>
                      <p className="text-xs text-[var(--warning)]">
                        Supplementary teaching · not an explanation from the
                        recording
                      </p>
                      <h3 className="mt-3 text-2xl">{concept.name}</h3>
                      <p className="mt-4 leading-7 text-[var(--ink-soft)]">
                        <ReadAlongText
                          text={
                            active.retry
                              ? concept.remediation.simpler_explanation
                              : concept.remediation.explanation
                          }
                          targetId={`remediation-${concept.id}`}
                          highlight={spokenWord}
                          offset={0}
                        />
                      </p>
                      <div className="mt-5 rounded-xl bg-[var(--surface-soft)] p-5">
                        <h4 className="text-sm font-medium text-[var(--ink)]">
                          Worked example
                        </h4>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--muted-ink)]">
                          <ReadAlongText
                            text={concept.remediation.worked_example}
                            targetId={`remediation-${concept.id}`}
                            highlight={spokenWord}
                            offset={
                              (active.retry
                                ? concept.remediation.simpler_explanation
                                : concept.remediation.explanation
                              ).length + 1
                            }
                          />
                        </p>
                      </div>
                      {concept.remediation.steps.length > 0 && (
                        <ol
                          aria-label="Visual explanation"
                          className="mt-4 grid gap-3 sm:grid-cols-2"
                        >
                          {concept.remediation.steps.map((step, i) => (
                            <li
                              key={i}
                              className="rounded-xl border border-[var(--line)] p-4 text-sm flex items-start gap-2"
                            >
                              <span className="text-[var(--accent-ink)] font-mono font-bold flex items-center gap-1">
                                {i + 1}
                                <ArrowRight className="w-3.5 h-3.5 inline text-[var(--accent-ink)]" />
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          className={`${button} inline-flex items-center gap-1.5`}
                          disabled={busy}
                          onClick={() => void act("reassess", concept.id)}
                        >
                          <RotateCcw className="w-4 h-4" />
                          Try a different question
                        </button>
                        <button
                          className={`${secondary} inline-flex items-center gap-1.5`}
                          disabled={busy}
                          onClick={() => void speak("remediation", concept.id)}
                        >
                          <Volume2
                            className={`w-4 h-4 ${
                              speakingTarget === `remediation-${concept.id}`
                                ? "text-[var(--accent-ink)] animate-pulse"
                                : ""
                            }`}
                          />
                          {speakingTarget === `remediation-${concept.id}`
                            ? "Narrating…"
                            : "Listen to explanation"}
                        </button>
                        <button
                          className={`${secondary} inline-flex items-center gap-1.5`}
                          onClick={() => stopAudio()}
                        >
                          <VolumeX className="w-4 h-4" />
                          Stop audio
                        </button>
                      </div>
                    </section>
                  )}
                  {active?.mode === "feedback" && (
                    <section className={panel}>
                      <h3
                        className={`text-xl flex items-center gap-2 ${active.correct ? "text-[var(--success)]" : "text-[var(--warning)]"}`}
                      >
                        {active.correct ? (
                          <>
                            <CheckCircle2 className="w-6 h-6 text-[var(--success)]" />
                            Passed this check
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-6 h-6 text-[var(--warning)]" />
                            Let’s work on the missing step
                          </>
                        )}
                      </h3>
                      <p className="mt-3 leading-7 text-[var(--ink-soft)]">
                        {active.explanation}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {!active.correct && active.concept_id && (
                          <button
                            className={`${button} inline-flex items-center gap-1.5`}
                            disabled={busy}
                            onClick={() => void act("teach", active.concept_id)}
                          >
                            <Sparkles className="w-4 h-4" />
                            Explain with an example
                          </button>
                        )}
                        <button
                          className={`${secondary} inline-flex items-center gap-1.5`}
                          disabled={busy}
                          onClick={() => void act("return")}
                        >
                          <ArrowLeft className="w-4 h-4" />
                          {active.correct
                            ? "Return to the lesson"
                            : "Return — still needs practice"}
                        </button>
                      </div>
                    </section>
                  )}
                  {!state.ended && (
                    <div className="flex flex-wrap gap-3">
                      {phase.quiz && (
                        <button
                          className={`${secondary} inline-flex items-center gap-1.5`}
                          disabled={busy}
                          onClick={() => void act("quiz")}
                        >
                          <CheckSquare className="w-4 h-4" />
                          Check this phase
                        </button>
                      )}
                      <button
                        className={`${button} inline-flex items-center gap-1.5`}
                        disabled={busy}
                        onClick={() => void act("next")}
                      >
                        {phase.id === doc.phases.at(-1)?.id ? (
                          <>
                            Finish lesson
                            <Check className="w-4 h-4 ml-1" />
                          </>
                        ) : (
                          <>
                            Next phase
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  <section className={panel}>
                    <h3 className="text-lg">Ask about this concept</h3>
                    <form
                      className="mt-4 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void ask();
                      }}
                    >
                      <input
                        aria-label="Question about the current lesson"
                        maxLength={1500}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-sm"
                        placeholder="Which step is unclear?"
                      />
                      <button
                        className={`${button} inline-flex items-center gap-1.5`}
                        disabled={busy || !query.trim()}
                      >
                        <Send className="w-4 h-4" />
                        Ask
                      </button>
                    </form>
                    {reply && (
                      <div className="mt-5">
                        <p className="text-xs text-[var(--warning)]">
                          {reply.provenance} · not verified as lecture content
                        </p>
                        <p className="mt-3 whitespace-pre-wrap leading-7 text-[var(--ink-soft)]">
                          {reply.explanation}
                        </p>
                        {reply.steps.length > 0 && (
                          <ol className="mt-4 space-y-2">
                            {reply.steps.map((s, i) => (
                              <li
                                className="rounded-lg border border-[var(--line)] p-3 text-sm"
                                key={i}
                              >
                                {i + 1}. {s}
                              </li>
                            ))}
                          </ol>
                        )}
                        <button
                          className={`${secondary} mt-4`}
                          onClick={() =>
                            void showSource(reply.related_evidence_ids)
                          }
                        >
                          Related lecture context
                        </button>
                      </div>
                    )}
                  </section>
                </div>
                <aside className="space-y-5">
                  <section className={`${panel} !p-4`}>
                    <h3 className="text-sm font-medium">Evidence notebook</h3>
                    <p className="mt-3 text-xs leading-5 text-[var(--muted-ink)]">Choose “Inspect lecture evidence” to collect the supporting excerpts here. Select a timestamp to seek the player.</p>
                    {sourceMessage && (
                      <p role="status" className="mt-3 text-sm text-[var(--warning)]">
                        {sourceMessage}
                      </p>
                    )}
                    {source.map((s) => (
                      <button
                        key={s.id}
                        className="mt-4 block w-full rounded-lg border border-[var(--line)] p-3 text-left"
                        onClick={() => {
                          if (player.current) {
                            player.current.currentTime = s.start;
                            player.current.scrollIntoView({behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"center"});
                          }
                        }}
                      >
                        <span className="text-xs font-mono text-[var(--accent-ink)]">
                          {timestamp(s.start)}–{timestamp(s.end)}
                        </span>
                        <p className="mt-2 text-xs leading-6 text-[var(--ink-soft)]">
                          {s.text}
                        </p>
                      </button>
                    ))}
                  </section>
                  <section className={`${panel} !p-4`}>
                    <h3 className="text-sm font-medium">Concept connections</h3>
                    {doc.concepts.length === 0 ? (
                      <p className="mt-3 text-xs text-[var(--muted-ink)]">
                        No gaps identified in this completed analysis.
                      </p>
                    ) : (
                      doc.concepts.map((c) => (
                        <div
                          key={c.id}
                          className="mt-4 border-t border-[var(--line)] pt-4"
                        >
                          <p className="text-sm">{c.name}</p>
                          <p className="mt-1 text-xs text-[var(--muted-ink)]">
                            {labels[c.coverage]}
                          </p>
                          <p className="mt-1 text-xs text-[var(--accent-ink)]">
                            {
                              progressLabels[
                                state.progress[c.id] || "unchecked"
                              ]
                            }
                          </p>
                          {doc.phases
                            .filter((p) => p.prerequisite_ids.includes(c.id))
                            .map((p) => (
                              <p
                                key={p.id}
                                className="mt-2 text-xs text-[var(--muted-ink)] inline-flex items-center gap-1"
                              >
                                <CornerDownRight className="w-3 h-3 text-[var(--accent-ink)]" />
                                Before {p.title}
                              </p>
                            ))}
                          {c.explanation_evidence_ids.length > 0 && (
                            <button
                              className="mt-2 text-xs text-[var(--success)] underline inline-flex items-center gap-1"
                              onClick={() =>
                                void showSource(c.explanation_evidence_ids)
                              }
                            >
                              <Volume2 className="w-3 h-3" />
                              Hear where it is explained
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </section>
                  <section className={`${panel} !p-4`}>
                    <label className="text-sm font-medium text-[var(--foreground)] flex items-center gap-1.5" id="voice-label">
                      <Volume2 className="w-3.5 h-3.5 text-[var(--accent-ink)]" />
                      Narration voice
                    </label>
                    <div className="relative mt-2.5" ref={voiceRef}>
                      <button
                        type="button"
                        aria-labelledby="voice-label"
                        aria-haspopup="listbox"
                        aria-expanded={voiceOpen}
                        onClick={() => setVoiceOpen((prev) => !prev)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 cursor-pointer ${
                          voiceOpen
                            ? "border-[var(--accent-ink)] bg-[var(--surface-soft)] ring-1 ring-[var(--accent-ink)]/25"
                            : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent-ink)]/60 hover:bg-[var(--surface-soft)]/50"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-[var(--foreground)]">
                          <span className="w-2 h-2 rounded-full bg-[var(--accent-ink)]"></span>
                          {user?.preferences?.voice === "Matthew"
                            ? "Matthew · English (Polly)"
                            : user?.preferences?.voice === "Joanna"
                            ? "Joanna · English (Polly)"
                            : "Browser · Word highlight"}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-[var(--muted-ink)] transition-transform duration-200 ${
                            voiceOpen ? "rotate-180 text-[var(--accent-ink)]" : ""
                          }`}
                        />
                      </button>

                      {voiceOpen && (
                        <div
                          role="listbox"
                          aria-labelledby="voice-label"
                          className="absolute left-0 right-0 bottom-full mb-2 z-50 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-2xl shadow-black/25 dark:shadow-black/70 ring-1 ring-black/5 dark:ring-white/5 animate-in fade-in zoom-in-95 duration-150"
                        >
                          {[
                            {
                              value: "Browser",
                              label: "Browser Voice (Native)",
                              desc: "Fast speech with live word highlighting",
                            },
                            {
                              value: "Joanna",
                              label: "Joanna (Polly)",
                              desc: "Warm & natural female cloud voice",
                            },
                            {
                              value: "Matthew",
                              label: "Matthew (Polly)",
                              desc: "Crisp & authoritative male cloud voice",
                            },
                          ].map((v) => {
                            const isSelected = (user?.preferences?.voice || "Browser") === v.value;
                            return (
                              <button
                                key={v.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={async () => {
                                  setVoiceOpen(false);
                                  stopAudio();
                                  try {
                                    const prefs = await request<Me["preferences"]>(
                                      "/preferences",
                                      { voice: v.value, language: "English" },
                                    );
                                    setUser((u) => (u ? { ...u, preferences: prefs } : u));
                                  } catch (e) {
                                    setError((e as Error).message);
                                  }
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors duration-150 cursor-pointer ${
                                  isSelected
                                    ? "bg-[var(--surface-soft)] font-semibold text-[var(--accent-ink)]"
                                    : "text-[var(--foreground)] hover:bg-[var(--surface-soft)]/70"
                                }`}
                              >
                                <div>
                                  <div className="font-medium text-[var(--foreground)]">{v.label}</div>
                                  <div className="text-[10px] text-[var(--muted-ink)]">{v.desc}</div>
                                </div>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-[var(--accent-ink)] shrink-0 stroke-[2.5]" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted-ink)]">
                      Changes apply only to this learner.
                    </p>
                  </section>
                </aside>
              </div>
              </>
            ) : (
              <p>Preparing session…</p>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}
