"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
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
  Play,
  GraduationCap,
} from "lucide-react";
import LecturePlayer from "./LecturePlayer";
import { createReadAlong } from "@/lib/read-along";
import ProcessingCenter from "./ProcessingCenter";
import Shell, { button, secondary, panel } from "./Shell";
import {
  request,
  Recording,
  ProcessingProgress,
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

export default function LearningWorkspace() {
  const params = useParams();
  const id = String(params.id);
  const [record, setRecord] = useState<Recording | null>(null);
  const [showVerifiedReplay, setShowVerifiedReplay] = useState(false);
  const [state, setState] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<Evidence[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [scrolledPastOverview, setScrolledPastOverview] = useState(false);
  const [hudMounted, setHudMounted] = useState(false);
  const activeCardRef = useRef<HTMLElement>(null);
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
  const readAlong = useRef<ReturnType<typeof createReadAlong> | null>(null);
  const speechGeneration = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
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
      if (rec.status === "ready") {
        const key = `blindspot-review:${id}`;
        try {
          const requestedAt = Number(sessionStorage.getItem(key) || 0);
          if (requestedAt && Date.now() - requestedAt < 10 * 60 * 1000) {
            const progress = await request<ProcessingProgress>(`/recordings/${id}/progress`);
            if (progress.history.some(event => event.stage === "reuse_verified")) setShowVerifiedReplay(true);
            else sessionStorage.removeItem(key);
          }
        } catch { /* A blocked storage API or progress request must not hide a ready lesson. */ }
        setState(await request<Session>(`/recordings/${id}/session`, {}));
      }
      setUser(await me());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function stopAudio() {
    narration.current?.pause();
    speechGeneration.current++;
    readAlong.current?.stop();
    readAlong.current = null;
    utteranceRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setSpokenWord(null);
    setSpeakingTarget(null);
  }
  useEffect(() => {
    setShowVerifiedReplay(false);
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
  useEffect(() => setHudMounted(true), []);
  const doc = record?.document;
  const phase = doc?.phases.find((p) => p.id === state?.phase_id);
  const concept = doc?.concepts.find((c) => c.id === state?.active?.concept_id);
  const active = state?.active;
  useEffect(() => {
    if (!doc || !phase || !state) {
      setScrolledPastOverview(false);
      return;
    }
    const handleScroll = () => {
      const guidedLesson = document.getElementById("guided-lesson");
      setScrolledPastOverview(Boolean(guidedLesson && guidedLesson.getBoundingClientRect().top <= window.innerHeight - 96));
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [id, doc, phase, state]);
  const actionableConcepts = doc?.concepts.filter((c) => Boolean(c.remediation)) || [];
  const crossRefConcepts = doc?.concepts.filter((c) => !c.remediation) || [];
  const totalGaps = actionableConcepts.length;
  const clearedGaps = actionableConcepts.filter(
    (c) => state?.progress[c.id] === "passed_check"
  ).length;
  const gapsPercent = totalGaps > 0 ? Math.round((clearedGaps / totalGaps) * 100) : 0;
  const allGapsCleared = totalGaps > 0 && clearedGaps === totalGaps;
  const phasePrereqIds = phase?.prerequisite_ids || [];
  const phasePrereqTotal = phasePrereqIds.length;
  const phasePrereqCleared = phasePrereqIds.filter(
    (cid) => state?.progress[cid] === "passed_check"
  ).length;
  const phasePrereqPending = phasePrereqTotal - phasePrereqCleared;
  useEffect(() => {
    if (active?.mode) {
      const timer = setTimeout(() => {
        activeCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [active?.mode, active?.question?.id, active?.concept_id]);
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
    setSelectedOption(index);
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
      setSelectedOption(null);
    } catch (e) {
      setError((e as Error).message);
      setSelectedOption(null);
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
        player.current.play?.().catch(() => {});
        document.getElementById("lecture-player")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        document.getElementById("evidence-notebook")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Browser narration is unavailable. Choose another voice or read the lesson text.");
      return;
    }
    const generation = speechGeneration.current;
    setSpeakingTarget(targetId);
    readAlong.current = createReadAlong(textToRead, word => {
      if (generation === speechGeneration.current) setSpokenWord({ targetId, ...word });
    });
    try {
      window.speechSynthesis.resume();
      const utterance = new SpeechSynthesisUtterance(textToRead);
      utterance.rate = 1.0;
      utterance.lang = "en-US";
      const voice = getPreferredBrowserVoice();
      if (voice) utterance.voice = voice;
      utterance.onboundary = event => {
        if (generation === speechGeneration.current) readAlong.current?.boundary(event);
      };
      utterance.onend = () => {
        if (generation === speechGeneration.current) stopAudio();
      };
      utterance.onerror = event => {
        if (generation !== speechGeneration.current) return;
        stopAudio();
        if (event.error !== "canceled" && event.error !== "interrupted") {
          setError("Browser narration could not play. Choose another voice or read the lesson text.");
        }
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } catch {
      if (generation === speechGeneration.current) {
        stopAudio();
        setError("Browser narration could not play. Choose another voice or read the lesson text.");
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
    const generation = speechGeneration.current;

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
      if (generation !== speechGeneration.current) return;
      const audio = new Audio(result.audio_url);
      narration.current = audio;
      setSpeakingTarget(targetId);
      audio.onended = () => { if (generation === speechGeneration.current) stopAudio(); };
      audio.onerror = () => { if (generation === speechGeneration.current) stopAudio(); };
      await audio.play();
    } catch {
      if (generation !== speechGeneration.current) return;
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
      <main className="site-frame pt-8 sm:pt-10 pb-20 sm:pb-28">
        <Link className="text-sm text-[var(--muted-ink)] inline-flex items-center gap-1.5 hover:text-[var(--accent-ink)] transition-colors" href="/workspace">
          <ArrowLeft className="w-4 h-4" /> All lectures
        </Link>
        {error && (
          <div
            role="alert"
            className="my-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
          >
            {error}
          </div>
        )}
        {record?.content_warnings?.map((warning) => (
          <div key={warning} role="status" className="my-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {warning}
          </div>
        ))}
        {!record && error ? (
          <div className={`${panel} mt-7 p-6`}>
            <h1 className="text-xl font-semibold">Unable to open this lesson</h1>
            <p className="mt-2 text-sm text-[var(--muted-ink)]">Try again or return to your lecture library.</p>
            <button className={`${secondary} mt-4`} onClick={() => { setError(""); void load(); }}>Try again</button>
          </div>
        ) : !record ? (
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
                  onClick={async () => {
                    if (
                      window.confirm(
                        "Restart this lesson and reset its check progress?",
                      )
                    ) {
                      await act("restart");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restart lesson
                </button>
              )}
            </div>
            {record.status === "ready" && showVerifiedReplay ? (
              <ProcessingCenter record={record} user={user} replayVerified onOpenVerified={() => {
                sessionStorage.removeItem(`blindspot-review:${id}`);
                setShowVerifiedReplay(false);
              }}/>
            ) : ["queued", "processing", "failed"].includes(record.status) ? (
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
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)]">
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
                      <h3 className="text-base font-semibold text-[var(--ink)] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        Why does Blindspot stop here?
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2 text-xs">
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]/60 p-4 space-y-2">
                          <strong className="text-[var(--ink)] block text-sm">
                            No Hallucinated Curriculum
                          </strong>
                          <p className="text-[var(--muted-ink)] leading-relaxed">
                            Blindspot strictly adheres to source evidence. When lecture explanations are absent or too brief, we refuse to invent fake prerequisites or quizzes.
                          </p>
                        </div>
                        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]/60 p-4 space-y-2">
                          <strong className="text-[var(--ink)] block text-sm">
                            Full Media & Transcript Preserved
                          </strong>
                          <p className="text-[var(--muted-ink)] leading-relaxed">
                            Your audio/video and timestamped transcript are saved and searchable in the review player on the right.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`${panel} space-y-4`}>
                      <h3 className="text-base font-semibold text-[var(--ink)] flex items-center gap-2">
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
              {/* Keep the dock outside the animated main element so it stays fixed while scrolling. */}
              {hudMounted && createPortal(
              <aside
                aria-label="Progress HUD"
                className={`progress-hud transition-all duration-300 ease-out ${
                  scrolledPastOverview
                    ? "translate-x-0 opacity-100"
                    : "translate-x-14 opacity-0 pointer-events-none"
                }`}
              >
                <div className="progress-hud-card flex flex-col items-center rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-md shadow-xl shadow-black/10 dark:shadow-black/50 p-2.5 transition-all">
                  {/* Circular Progress Gauge */}
                  <button
                    type="button"
                    className="relative flex flex-col items-center group cursor-pointer rounded-lg"
                    aria-label={`Go to guided lesson, ${clearedGaps} of ${totalGaps} checks passed`}
                    onClick={() => {
                      document.getElementById("guided-lesson")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    <div className="relative w-10 h-10 flex items-center justify-center">
                      <svg className="w-10 h-10 -rotate-90 transform" viewBox="0 0 40 40">
                        <circle
                          cx="20"
                          cy="20"
                          r="15"
                          className="stroke-[var(--line)]"
                          strokeWidth="3.5"
                          fill="transparent"
                        />
                        <circle
                          cx="20"
                          cy="20"
                          r="15"
                          className={`${allGapsCleared ? "stroke-emerald-500" : "stroke-[var(--accent-ink)]"} transition-all duration-500`}
                          strokeWidth="3.5"
                          strokeDasharray={94.2}
                          strokeDashoffset={94.2 - (94.2 * gapsPercent) / 100}
                          strokeLinecap="round"
                          fill="transparent"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        {allGapsCleared ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-[var(--ink)]">
                            {totalGaps ? `${gapsPercent}%` : "—"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-center">
                      <span className="block text-[10px] font-mono font-bold text-[var(--ink)] leading-none">
                        {clearedGaps}/{totalGaps}
                      </span>
                      <span className="block text-[8px] font-mono uppercase text-[var(--muted-ink)] tracking-wider mt-0.5">
                        PASSED
                      </span>
                    </div>

                    {/* Tooltip to the left */}
                    <div className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line)] shadow-xl text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      <span className="font-semibold text-[var(--ink)]">Prerequisite Progress: </span>
                      <span className="font-mono text-[var(--accent-ink)] font-bold">{totalGaps ? `${clearedGaps} of ${totalGaps} checks passed (${gapsPercent}%)` : "No prerequisite checks available"}</span>
                    </div>
                  </button>

                  <div className="progress-hud-divider my-2 w-8 h-px bg-[var(--line)]" />

                  {/* Vertical Gap Checkpoints */}
                  <div className="progress-hud-checkpoints flex flex-col items-center gap-2">
                    {actionableConcepts.map((c, idx) => {
                      const status = state.progress[c.id] || "unchecked";
                      const isPassed = status === "passed_check";
                      const isNeedsHelp = status === "needs_help";
                      return (
                        <div key={c.id} className="relative group">
                          <button
                            onClick={() => void act(isNeedsHelp ? "teach" : "check", c.id)}
                            disabled={busy}
                            aria-label={`${c.name} - ${isPassed ? "Passed this check" : isNeedsHelp ? "Needs practice" : "Not checked"}`}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all hover:scale-105 cursor-pointer ${
                              isPassed
                                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40"
                                : isNeedsHelp
                                ? "bg-amber-500/20 text-amber-800 dark:text-amber-400 border border-amber-500/40 animate-pulse"
                                : "bg-[var(--surface-soft)] text-rose-700 dark:text-rose-400 border border-rose-500/40"
                            }`}
                          >
                            {isPassed ? (
                              <Check className="w-4 h-4 stroke-[3]" />
                            ) : isNeedsHelp ? (
                              <AlertCircle className="w-4 h-4" />
                            ) : (
                              <span>{idx + 1}</span>
                            )}
                          </button>

                          {/* Tooltip to the left */}
                          <div className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line)] shadow-xl text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            <p className="font-semibold text-[var(--ink)]">{c.name}</p>
                            <p className="text-[10px] text-[var(--muted-ink)] font-mono">
                              {isPassed ? "Passed this check · Retest" : isNeedsHelp ? "Needs practice · Review example" : "Not checked · Start check"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="progress-hud-divider my-2 w-8 h-px bg-[var(--line)]" />

                  {/* Current Phase Badge */}
                  <div className="relative group">
                    <button
                      onClick={() => {
                        const target = document.getElementById("phase-prerequisites") || document.getElementById("current-phase-section");
                        target?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-[var(--surface-soft)] hover:bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] font-mono text-xs font-semibold transition cursor-pointer"
                      title={`Phase ${doc.phases.findIndex((p) => p.id === phase.id) + 1} of ${doc.phases.length}: ${phase.title}`}
                    >
                      P{doc.phases.findIndex((p) => p.id === phase.id) + 1}
                    </button>
                    <div className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line)] shadow-xl text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      <p className="font-semibold text-[var(--ink)]">
                        Phase {doc.phases.findIndex((p) => p.id === phase.id) + 1}: {phase.title}
                      </p>
                      <p className="text-[10px] text-[var(--muted-ink)] font-mono">
                        {phasePrereqTotal === 0 ? "No phase checks available" : phasePrereqPending === 0 ? "Phase checks passed" : `${phasePrereqPending} phase checks remaining`}
                      </p>
                    </div>
                  </div>

                  {/* Active Quiz/Check Pulse Button */}
                  {active?.mode && (
                    <div className="relative group mt-1.5">
                      <button
                        onClick={() => {
                          activeCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="h-8 w-8 rounded-xl bg-[var(--accent-ink)] text-white flex items-center justify-center shadow-md hover:scale-105 transition cursor-pointer"
                        title="Jump to active check"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line)] shadow-xl text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        <span className="font-semibold text-[var(--ink)]">Return to Active Check</span>
                      </div>
                    </div>
                  )}

                  {/* Back to top */}
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="mt-1.5 h-8 w-8 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] hover:bg-[var(--surface)] text-[var(--muted-ink)] hover:text-[var(--ink)] flex items-center justify-center transition cursor-pointer"
                    title="Back to top"
                    aria-label="Back to top"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                </div>
              </aside>, document.body)}

              <div className="workspace-watch">
                <LecturePlayer src={`/api/v1/recordings/${id}/media`} title={record.title} segments={doc.segments} phases={doc.phases} mediaRef={player} onPlay={stopAudio}/>
                <section className="workspace-overview">
                  <p className="eyebrow">YOUR LEARNING PATH</p>
                  <h2>Watch. Connect.<br/>Put it into practice.</h2>
                  <p>Explore the original recording above or follow the guided lesson below. Chapters seek to supporting excerpts; they don’t mark a lesson complete.</p>
                  <div className="workspace-stats">
                    <div><strong>{doc.phases.length}</strong><span>lesson phases</span></div>
                    <div><strong>{totalGaps}</strong><span>prerequisite gaps</span></div>
                    <div><strong className={allGapsCleared ? "text-emerald-500" : "text-amber-500"}>{clearedGaps}</strong><span>checks passed</span></div>
                  </div>

                  {/* Readiness Banner in Overview */}
                  <div className="mb-5 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]/70 p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--ink)] flex items-center gap-1.5">
                        <CheckCircle2 className={`w-3.5 h-3.5 ${allGapsCleared ? "text-emerald-500" : "text-amber-500"}`} />
                        Prerequisite checks
                      </span>
                      <span className={`font-mono font-bold ${allGapsCleared ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {totalGaps ? `${clearedGaps}/${totalGaps} passed (${gapsPercent}%)` : "No checks available"}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--line)]/60 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${allGapsCleared ? "bg-emerald-500" : "bg-gradient-to-r from-amber-500 to-rose-600"}`}
                        style={{ width: `${gapsPercent}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[var(--muted-ink)]">
                      {totalGaps === 0
                        ? "No prerequisite checks are available for this saved lesson."
                        : allGapsCleared
                        ? "You passed each available prerequisite check for this lecture."
                        : `${totalGaps - clearedGaps} prerequisite checks remain. Review them whenever you need support.`}
                    </p>
                  </div>

                  <div className="workspace-position"><span>{state.ended ? "Lesson complete" : `Current phase ${doc.phases.findIndex(p=>p.id===phase.id)+1} of ${doc.phases.length}`}</span><strong>{phase.title}</strong></div>
                  <button
                    type="button"
                    className={button}
                    onClick={() => {
                      document.getElementById("guided-lesson")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    Continue guided lesson <ArrowRight size={15}/>
                  </button>
                </section>
              </div>
              <div className="workspace-guided-content">
              <div id="guided-lesson" className="lesson-section-title"><BookOpen size={18}/><h2>Your guided lesson</h2><span>Read, check and build on what you know</span></div>

              {/* Prerequisite check progress */}
              <div className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider bg-[var(--accent-ink)]/10 text-[var(--accent-ink)] border border-[var(--accent-ink)]/20">
                        Prerequisite check progress
                      </span>
                      <span className="text-xs text-[var(--muted-ink)] font-mono">
                        {totalGaps === 0 ? "No Checks Available" : allGapsCleared ? "All Checks Passed" : `${totalGaps - clearedGaps} Checks Remaining`}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold tracking-tight text-[var(--ink)]">
                      {totalGaps === 0
                        ? "No prerequisite checks available"
                        : allGapsCleared
                        ? "All available prerequisite checks passed"
                        : `Prerequisite checks: ${clearedGaps} of ${totalGaps} passed (${gapsPercent}%)`}
                    </h3>
                    <p className="text-xs text-[var(--muted-ink)] max-w-2xl leading-relaxed">
                      {allGapsCleared
                        ? "You passed the available checks. You can revisit the examples and source excerpts at any time."
                        : "Lecturers may assume background knowledge. Use these short checks and worked examples to find and practice any steps you need before continuing."}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {allGapsCleared ? (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        <span>Checks passed</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-semibold text-sm">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                        <span>{totalGaps - clearedGaps} {totalGaps - clearedGaps === 1 ? "Check" : "Checks"} Remaining</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Full-width Progress Bar */}
                <div className="mt-4 space-y-1.5">
                  <div className="h-3 w-full rounded-full bg-[var(--surface-soft)] border border-[var(--line)] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${allGapsCleared ? "bg-emerald-500" : "bg-gradient-to-r from-amber-500 to-rose-600"}`}
                      style={{ width: `${gapsPercent}%` }}
                    />
                  </div>
                </div>

                {/* Quick Interactive Prerequisite Gap Chips */}
                <div className="mt-4 pt-4 border-t border-[var(--line)] flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-[var(--muted-ink)] mr-1">
                    Prerequisite checks:
                  </span>
                  {actionableConcepts.map((c) => {
                    const isPassed = state.progress[c.id] === "passed_check";
                    const isNeedsHelp = state.progress[c.id] === "needs_help";
                    return (
                      <button
                        key={c.id}
                        disabled={busy}
                        onClick={() => void act(isNeedsHelp ? "teach" : "check", c.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isPassed
                            ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                            : isNeedsHelp
                            ? "bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
                            : "bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent-ink)]"
                        }`}
                        title={isPassed ? "Re-test knowledge" : isNeedsHelp ? "Review worked example" : "Check my knowledge"}
                      >
                        {isPassed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : isNeedsHelp ? (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        ) : (
                          <HelpCircle className="w-3.5 h-3.5 text-[var(--accent-ink)]" />
                        )}
                        <span>{c.name}</span>
                        <span className="text-[10px] font-mono opacity-80">
                          {isPassed ? "· Passed" : isNeedsHelp ? "· Needs practice" : "· Check knowledge"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="lesson-layout">
                <aside className="lesson-roadmap space-y-3">
                  <p className="mb-4 text-xs font-mono uppercase text-[var(--muted-ink)]">
                    Lesson roadmap
                  </p>
                  {doc.phases.map((p, i) => {
                    const pPrereqs = p.prerequisite_ids || [];
                    const pCleared = pPrereqs.filter(cid => state.progress[cid] === "passed_check").length;
                    const pPending = pPrereqs.length - pCleared;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={busy}
                        aria-current={p.id === phase.id ? "step" : undefined}
                        onClick={async () => {
                          if (p.id !== phase.id) {
                            await act("go_to_phase", p.id);
                          }
                          document.getElementById("current-phase-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className={`block w-full rounded-xl border p-3.5 text-left text-sm transition-all cursor-pointer ${
                          p.id === phase.id
                            ? "border-[var(--accent-ink)] bg-[var(--accent-ink)]/15 shadow-sm ring-1 ring-[var(--accent-ink)]/25"
                            : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-ink)] hover:bg-[var(--surface-soft)] hover:border-[var(--accent-ink)]/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-mono text-xs text-[var(--muted-ink)] mt-0.5">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className={`flex-1 font-semibold text-xs leading-5 ${p.id === phase.id ? "text-[var(--accent-ink)]" : "text-[var(--ink)]"}`}>
                            {p.title}
                          </span>
                        </div>
                        {pPrereqs.length > 0 ? (
                          <div className="mt-2 pl-5">
                            {pPending === 0 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Prereqs cleared
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                                <AlertCircle className="w-3 h-3 text-amber-500" /> {pPending} {pPending === 1 ? "gap" : "gaps"} to clear
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 pl-5">
                            <span className="text-[10px] text-[var(--muted-ink)]">No prerequisites</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                  <p className="pt-3 text-xs leading-5 text-[var(--muted-ink)]">
                    Explore any phase freely to review key concepts, inspect source evidence, and test your understanding at your own pace.
                  </p>
                </aside>
                <div className="space-y-5">
                  {state.ended ? (
                    <section id="current-phase-section" className={`${panel} scroll-mt-24`}>
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
                    <section id="current-phase-section" className={`${panel} scroll-mt-24`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-mono text-[var(--success)]">
                          Lecture explanation
                        </span>
                        {phasePrereqTotal > 0 && (
                          phasePrereqPending === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              All phase prerequisites cleared
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                              {phasePrereqPending} prerequisite {phasePrereqPending === 1 ? "check" : "checks"} available
                            </span>
                          )
                        )}
                      </div>
                      <h2 className="mt-3 text-2xl font-medium">
                        {phase.title}
                      </h2>

                      {/* Prominent Callout Banner if this phase has unverified prerequisites */}
                      {phasePrereqPending > 0 && (
                        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                                Background knowledge for this phase
                              </p>
                              <p className="text-xs text-[var(--ink)] mt-0.5">
                                This phase may need background knowledge that the recording does not explain. Use the checks and examples below if you need them.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              document.getElementById("phase-prerequisites")?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="text-xs font-semibold text-amber-600 dark:text-amber-400 underline hover:no-underline inline-flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0"
                          >
                            Go to checkpoints <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

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
                    <section id="phase-prerequisites" className={`${panel} border-amber-500/30 scroll-mt-24`}>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-[var(--ink)] flex items-center gap-2">
                            <HelpCircle className="w-5 h-5 text-[var(--accent-ink)]" />
                            Before You Continue: Prerequisite Checkpoints
                          </h3>
                          <p className="mt-1 text-xs text-[var(--muted-ink)] max-w-xl">
                            The instructor assumes you know these concepts to follow this phase. Test your knowledge or let Blindspot teach you with worked examples to clear any blind spot.
                          </p>
                        </div>
                        <div>
                          {phasePrereqPending === 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              All {phasePrereqTotal} Prerequisite Checks Passed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-400 border border-amber-500/30">
                              <AlertCircle className="w-4 h-4 text-amber-500" />
                              {phasePrereqPending} of {phasePrereqTotal} Remaining
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-5 space-y-4">
                        {phase.prerequisite_ids.map((cid) => {
                          const c = doc.concepts.find((c) => c.id === cid);
                          if (!c) return null;
                          const status = state.progress[cid] || "unchecked";
                          const isPassed = status === "passed_check";
                          const isNeedsHelp = status === "needs_help";

                          return (
                            <div
                              key={cid}
                              className={`rounded-xl border p-5 transition-all ${
                                isPassed
                                  ? "border-emerald-500/40 bg-emerald-500/5"
                                  : isNeedsHelp
                                  ? "border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/20"
                                  : "border-[var(--line)] bg-[var(--surface-soft)]/50 hover:border-[var(--accent-ink)]/50"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="space-y-1">
                                  <h4 className="font-semibold text-base text-[var(--ink)]">
                                    {c.name}
                                  </h4>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--surface)] text-[var(--muted-ink)] border border-[var(--line)]">
                                      {labels[c.coverage]}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  {isPassed ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Verified Mastered
                                    </span>
                                  ) : isNeedsHelp ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-400 border border-amber-500/40">
                                      <AlertCircle className="w-3.5 h-3.5" />
                                      Needs Practice
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                                      <HelpCircle className="w-3.5 h-3.5 text-rose-500" />
                                      Action Required · Not Checked
                                    </span>
                                  )}
                                </div>
                              </div>

                              <p className="mt-3 text-xs leading-relaxed text-[var(--muted-ink)]">
                                <strong>Why this matters:</strong> {c.reason}
                              </p>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {c.remediation && (
                                  <>
                                    {isPassed ? (
                                      <>
                                        <button
                                          className={`${secondary} inline-flex items-center gap-1.5 text-xs`}
                                          disabled={busy}
                                          onClick={() => void act("check", cid)}
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                          Re-test knowledge
                                        </button>
                                        <button
                                          className={`${secondary} inline-flex items-center gap-1.5 text-xs`}
                                          disabled={busy}
                                          onClick={() => void act("teach", cid)}
                                        >
                                          <Sparkles className="w-3.5 h-3.5" />
                                          Review worked example
                                        </button>
                                      </>
                                    ) : isNeedsHelp ? (
                                      <>
                                        <button
                                          className={`${button} inline-flex items-center gap-1.5 text-xs`}
                                          disabled={busy}
                                          onClick={() => void act("teach", cid)}
                                        >
                                          <BookOpen className="w-3.5 h-3.5" />
                                          Review worked example & practice
                                        </button>
                                        <button
                                          className={`${secondary} inline-flex items-center gap-1.5 text-xs`}
                                          disabled={busy}
                                          onClick={() => void act("check", cid)}
                                        >
                                          <HelpCircle className="w-3.5 h-3.5" />
                                          Try diagnostic check again
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          className={`${button} inline-flex items-center gap-1.5 text-xs`}
                                          disabled={busy}
                                          onClick={() => void act("check", cid)}
                                        >
                                          <HelpCircle className="w-3.5 h-3.5" />
                                          Check my knowledge (Quick Quiz)
                                        </button>
                                        <button
                                          className={`${secondary} inline-flex items-center gap-1.5 text-xs`}
                                          disabled={busy}
                                          onClick={() => void act("teach", cid)}
                                        >
                                          <Sparkles className="w-3.5 h-3.5" />
                                          Teach me first (Worked Example)
                                        </button>
                                        <button
                                          className={`${secondary} inline-flex items-center gap-1.5 text-xs text-[var(--muted-ink)]`}
                                          disabled={busy}
                                          onClick={() => void act("skip", cid)}
                                        >
                                          <SkipForward className="w-3.5 h-3.5" />
                                          Skip check
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                                <button
                                  className={`${secondary} inline-flex items-center gap-1.5 text-xs`}
                                  onClick={() => void showSource(c.evidence_ids)}
                                >
                                  <FileText className="w-3.5 h-3.5" />
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
                      ref={activeCardRef}
                      className={`${panel} border-[var(--accent-ink)]/60 scroll-mt-24`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-widest text-[var(--accent-ink)] font-semibold flex items-center gap-1.5">
                          {active.question.purpose === "diagnostic" ? (
                            <>
                              <HelpCircle className="w-4 h-4 text-[var(--accent-ink)]" />
                              Prerequisite check
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 text-[var(--accent-ink)]" />
                              Apply what you learned
                            </>
                          )}
                        </p>
                        <span className="text-xs text-[var(--muted-ink)] font-mono">
                          Select one answer
                        </span>
                      </div>
                      <h3 className="mt-4 text-xl font-medium leading-snug text-[var(--ink)]">
                        {active.question.question}
                      </h3>
                      <div className="mt-5 space-y-3">
                        {active.question.options.map((option, i) => (
                          <button
                            key={i}
                            disabled={busy}
                            onClick={() => void answer(i)}
                            className={`block w-full rounded-xl border p-4 text-left text-sm transition-all duration-150 cursor-pointer ${
                              selectedOption === i
                                ? "border-rose-600 bg-rose-500/15 ring-2 ring-rose-500/30 text-[var(--ink)]"
                                : "border-[var(--line)] bg-[var(--surface)] hover:border-rose-500/60 hover:bg-[var(--surface-soft)] text-[var(--ink)]"
                            } disabled:opacity-60`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-mono font-semibold ${
                                  selectedOption === i
                                    ? "border-rose-600 bg-rose-600 text-white shadow-sm"
                                    : "border-[var(--line)] bg-[var(--surface-soft)] text-[var(--muted-ink)]"
                                }`}>
                                  {String.fromCharCode(65 + i)}
                                </span>
                                <span className="leading-relaxed">{option}</span>
                              </div>
                              {busy && selectedOption === i && (
                                <span className="text-xs font-mono text-[var(--accent-ink)] animate-pulse shrink-0">
                                  Submitting…
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {active?.mode === "lesson" && concept?.remediation && (
                    <section ref={activeCardRef} className={`${panel} border-[var(--accent-ink)]/50 scroll-mt-24`}>
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
                    <section ref={activeCardRef} className={`${panel} scroll-mt-24`}>
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
                          onClick={async () => {
                            await act("return");
                            const target = document.getElementById("phase-prerequisites") || document.getElementById("current-phase-section") || document.getElementById("guided-lesson");
                            target?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          <ArrowLeft className="w-4 h-4" />
                          {active.correct
                            ? "Return to the lesson"
                            : "Return — still needs practice"}
                        </button>
                      </div>
                    </section>
                  )}
                  {!state.ended && !active?.mode && (
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
                        onClick={async () => {
                          await act("next");
                          document.getElementById("current-phase-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
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
                  <section id="evidence-notebook" className={`${panel} !p-4 scroll-mt-24`}>
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
                        type="button"
                        className="mt-4 block w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-soft)] p-3 text-left transition-colors cursor-pointer"
                        onClick={() => {
                          if (player.current) {
                            player.current.currentTime = s.start;
                            player.current.play?.().catch(() => {});
                            document.getElementById("lecture-player")?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }
                        }}
                      >
                        <span className="text-xs font-mono text-[var(--accent-ink)] flex items-center gap-1.5 font-semibold">
                          <Play className="w-3 h-3 fill-current" />
                          {timestamp(s.start)}–{timestamp(s.end)}
                        </span>
                        <p className="mt-2 text-xs leading-6 text-[var(--ink-soft)]">
                          {s.text}
                        </p>
                      </button>
                    ))}
                  </section>
                  <section id="concept-map-panel" className={`${panel} !p-4 space-y-4 scroll-mt-24`}>
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-[var(--ink)]">
                          <Sparkles className="w-4 h-4 text-[var(--accent-ink)]" />
                          Concept Map & Knowledge Gaps
                        </h3>
                        <span className="text-[11px] font-mono font-medium text-[var(--muted-ink)]">
                          {clearedGaps}/{totalGaps} cleared
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-[var(--muted-ink)] leading-relaxed">
                        Clear actionable gaps below to eliminate blind spots. Items covered in the recording require no prerequisite check.
                      </p>
                    </div>

                    {/* Group 1: Actionable Prerequisite Gaps */}
                    <div className="pt-2 border-t border-[var(--line)]">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent-ink)] font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Prerequisite Checks ({clearedGaps}/{totalGaps} Passed)
                      </span>
                      <p className="mt-1 text-[11px] text-[var(--muted-ink)]">
                        Assumed background concepts. Pass the checks or learn with worked examples.
                      </p>

                      <div className="mt-3 space-y-3">
                        {actionableConcepts.map((c) => {
                          const status = state.progress[c.id] || "unchecked";
                          const isPassed = status === "passed_check";
                          const isNeedsHelp = status === "needs_help";

                          return (
                            <div
                              key={c.id}
                              className={`rounded-xl border p-3 text-xs transition-all ${
                                isPassed
                                  ? "border-emerald-500/30 bg-emerald-500/5"
                                  : isNeedsHelp
                                  ? "border-amber-500/40 bg-amber-500/10"
                                  : "border-[var(--line)] bg-[var(--surface-soft)]/40 hover:border-[var(--accent-ink)]/40"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <strong className="font-semibold text-sm text-[var(--ink)] leading-snug">
                                  {c.name}
                                </strong>
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-[10px] font-mono text-[var(--muted-ink)]">
                                  {labels[c.coverage]}
                                </span>
                              </div>
                              <div className="mt-1.5">
                                {isPassed ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Passed this check
                                  </span>
                                ) : isNeedsHelp ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                    <AlertCircle className="w-3 h-3 text-amber-500" /> Needs Practice
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-full">
                                    <HelpCircle className="w-3 h-3 text-rose-500" /> Action Required · Not Checked
                                  </span>
                                )}
                              </div>
                              {doc.phases
                                .filter((p) => p.prerequisite_ids.includes(c.id))
                                .map((p) => (
                                  <p
                                    key={p.id}
                                    className="mt-2 text-[11px] text-[var(--muted-ink)] flex items-center gap-1"
                                  >
                                    <CornerDownRight className="w-3 h-3 text-[var(--accent-ink)] shrink-0" />
                                    <span>Required before: <strong>{p.title}</strong></span>
                                  </p>
                                ))}
                              <div className="mt-2.5 flex items-center gap-1.5">
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void act(
                                      isNeedsHelp ? "teach" : "check",
                                      c.id,
                                    )
                                  }
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--accent-ink)] text-white hover:opacity-90 disabled:opacity-50 transition inline-flex items-center gap-1"
                                >
                                  {isPassed ? (
                                    <>
                                      <RotateCcw className="w-3 h-3" /> Re-test
                                    </>
                                  ) : isNeedsHelp ? (
                                    <>
                                      <BookOpen className="w-3 h-3" /> Practice
                                    </>
                                  ) : (
                                    <>
                                      <CheckSquare className="w-3 h-3" /> Check gap
                                    </>
                                  )}
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => void act("teach", c.id)}
                                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--surface-soft)] disabled:opacity-50 transition inline-flex items-center gap-1"
                                >
                                  <Sparkles className="w-3 h-3 text-[var(--accent-ink)]" />
                                  Teach me
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Group 2: Lecture Cross-References (Covered in recording) */}
                    {crossRefConcepts.length > 0 && (
                      <div className="pt-3 border-t border-[var(--line)]">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-sky-700 dark:text-sky-400 font-semibold flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          Lecture concepts & possible prerequisites
                        </span>
                        <p className="mt-1 text-[11px] text-[var(--muted-ink)]">
                          Coverage labels distinguish explained concepts from possible prerequisites without an available check.
                        </p>

                        <div className="mt-3 space-y-3">
                          {crossRefConcepts.map((c) => (
                            <div
                              key={c.id}
                              className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]/30 p-3 text-xs"
                            >
                              <strong className="font-semibold text-sm text-[var(--ink)] block">
                                {c.name}
                              </strong>
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-800 dark:text-sky-300 bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 rounded-full">
                                  {c.coverage === "explained_elsewhere" ? <Check className="w-3 h-3" /> : <HelpCircle className="w-3 h-3" />} {labels[c.coverage]}
                                </span>
                              </div>
                              <p className="mt-1.5 text-[11px] text-[var(--muted-ink)] leading-relaxed">
                                {c.reason}
                              </p>
                              {c.explanation_evidence_ids.length > 0 && (
                                <button
                                  className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium underline inline-flex items-center gap-1.5 hover:opacity-80"
                                  onClick={() =>
                                    void showSource(c.explanation_evidence_ids)
                                  }
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                  Hear where instructor explains it
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                  <section className={`${panel} !p-4`}>
                    <label className="text-sm font-medium text-[var(--ink)] flex items-center gap-1.5" id="voice-label">
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
                        <span className="flex items-center gap-2 text-[var(--ink)]">
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
                                    : "text-[var(--ink)] hover:bg-[var(--surface-soft)]/70"
                                }`}
                              >
                                <div>
                                  <div className="font-medium text-[var(--ink)]">{v.label}</div>
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
