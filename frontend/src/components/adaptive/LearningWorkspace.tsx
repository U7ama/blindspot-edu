"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
  const player = useRef<HTMLVideoElement>(null);
  const narration = useRef<HTMLAudioElement | null>(null);
  const submitKey = useRef<string | null>(null);
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
  useEffect(() => {
    void load();
    return () => {
      narration.current?.pause();
    };
  }, [id]);
  useEffect(() => {
    if (record && ["queued", "processing"].includes(record.status)) {
      const timer = setTimeout(() => void load(), 3000);
      return () => clearTimeout(timer);
    }
  }, [record]);
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
    narration.current?.pause();
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
      const result = await request<{
        type: string;
        segments?: Evidence[];
        message?: string;
      }>(`/recordings/${id}/source`, { evidence_ids: ids });
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
  async function speak(kind: "phase" | "remediation", target: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ audio_url: string }>(
        `/recordings/${id}/narration`,
        { kind, target },
      );
      narration.current?.pause();
      narration.current = new Audio(result.audio_url);
      await narration.current.play();
    } catch (e) {
      setError((e as Error).message + " You can continue reading.");
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
      <main className="mx-auto max-w-7xl px-5 py-8">
        <Link className="text-sm text-stone-400" href="/workspace">
          ← All lectures
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
          <p className="mt-10">{error ? "The lecture could not be loaded." : "Loading lecture…"}</p>
        ) : (
          <>
            <div className="my-7 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-rose-300">
                  {record.public
                    ? "Public sample · saved lesson"
                    : "Your lecture"}
                </p>
                <h1 className="mt-2 text-3xl font-semibold break-words">
                  {record.title}
                </h1>
                <p className="mt-2 text-sm text-stone-500">
                  {timestamp(record.duration)} ·{" "}
                  {record.status === "ready"
                    ? "Evidence-linked learning"
                    : record.status}
                </p>
              </div>
              {state && (
                <button
                  className={secondary}
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
                  Restart lesson
                </button>
              )}
            </div>
            {record.status !== "ready" ? (
              <section className={panel}>
                <h2 className="text-xl">
                  {record.status === "failed"
                    ? "Processing needs attention"
                    : "Preparing your lesson"}
                </h2>
                <p className="mt-3 text-stone-400">
                  {record.error ||
                    "Your recording is queued for transcription and evidence checks. You can leave this page and return."}
                </p>
                {record.status === "failed" && !record.public && (
                  <button
                    className={`${button} mt-5`}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await request(`/recordings/${id}/retry`, {});
                        await load();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Retry processing
                  </button>
                )}
              </section>
            ) : doc && phase && state ? (
              <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)_300px]">
                <aside className="space-y-3">
                  <p className="mb-4 text-xs font-mono uppercase text-stone-500">
                    Lesson roadmap
                  </p>
                  {doc.phases.map((p, i) => (
                    <button
                      key={p.id}
                      disabled={busy}
                      onClick={() => void act("go_to_phase", p.id)}
                      className={`block w-full rounded-xl border p-4 text-left text-sm ${p.id === phase.id ? "border-rose-800 bg-[#701a24]/20" : "border-white/10 text-stone-400 hover:bg-white/5"}`}
                    >
                      <span className="mr-2 font-mono text-stone-500">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {p.title}
                    </button>
                  ))}
                  <p className="pt-3 text-xs leading-5 text-stone-500">
                    Navigation never awards credit. A passed check is evidence
                    about that question, not a mastery claim.
                  </p>
                </aside>
                <div className="space-y-5">
                  {state.ended ? (
                    <section className={panel}>
                      <p className="text-xs uppercase tracking-widest text-rose-300">
                        Lesson complete
                      </p>
                      <h2 className="mt-3 text-2xl">
                        Keep the next step visible.
                      </h2>
                      <p className="mt-3 text-stone-400">
                        You reached the end. Your check results are preserved
                        below; revisit any phase from the roadmap.
                      </p>
                    </section>
                  ) : (
                    <section className={panel}>
                      <span className="text-xs font-mono text-emerald-300">
                        Lecture explanation
                      </span>
                      <h2 className="mt-3 text-2xl font-medium">
                        {phase.title}
                      </h2>
                      <p className="mt-5 whitespace-pre-wrap leading-8 text-stone-300">
                        {phase.teaching_script}
                      </p>
                      <div className="mt-6 flex flex-wrap gap-2">
                        <button
                          className={secondary}
                          disabled={busy}
                          onClick={() => void showSource(phase.evidence_ids)}
                        >
                          Inspect lecture evidence
                        </button>
                        <button
                          className={secondary}
                          disabled={busy}
                          onClick={() => void speak("phase", phase.id)}
                        >
                          Listen
                        </button>
                        <button
                          className={secondary}
                          onClick={() => narration.current?.pause()}
                        >
                          Stop audio
                        </button>
                      </div>
                    </section>
                  )}
                  {!state.ended && phase.prerequisite_ids.length > 0 && (
                    <section className={panel}>
                      <h3 className="font-medium">Before you continue</h3>
                      <p className="mt-2 text-sm text-stone-400">
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
                              className="rounded-xl border border-white/10 p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="font-medium">{c.name}</h4>
                                <span className="text-xs text-rose-200">
                                  {
                                    progressLabels[
                                      state.progress[cid] || "unchecked"
                                    ]
                                  }
                                </span>
                              </div>
                              <p className="mt-2 text-xs text-stone-500">
                                {labels[c.coverage]}
                              </p>
                              <p className="mt-2 text-sm leading-6 text-stone-400">
                                {c.reason}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {c.remediation && (
                                  <>
                                    <button
                                      className={button}
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
                                      {state.progress[cid] === "needs_help"
                                        ? "Review prerequisite"
                                        : "Check my knowledge"}
                                    </button>
                                    <button
                                      className={secondary}
                                      disabled={busy}
                                      onClick={() => void act("teach", cid)}
                                    >
                                      Teach me
                                    </button>
                                    <button
                                      className={secondary}
                                      disabled={busy}
                                      onClick={() => void act("skip", cid)}
                                    >
                                      Continue without passing
                                    </button>
                                  </>
                                )}
                                <button
                                  className={secondary}
                                  onClick={() =>
                                    void showSource(c.evidence_ids)
                                  }
                                >
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
                      <p className="text-xs uppercase tracking-widest text-rose-300">
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
                            className="block w-full rounded-xl border border-white/15 p-4 text-left text-sm hover:border-rose-600 disabled:opacity-50"
                          >
                            <span className="mr-3 text-stone-500">
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
                      <p className="text-xs text-amber-300">
                        Supplementary teaching · not an explanation from the
                        recording
                      </p>
                      <h3 className="mt-3 text-2xl">{concept.name}</h3>
                      <p className="mt-4 leading-7 text-stone-300">
                        {active.retry
                          ? concept.remediation.simpler_explanation
                          : concept.remediation.explanation}
                      </p>
                      <div className="mt-5 rounded-xl bg-black/30 p-5">
                        <h4 className="text-sm font-medium text-stone-200">
                          Worked example
                        </h4>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-400">
                          {concept.remediation.worked_example}
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
                              className="rounded-xl border border-white/10 p-4 text-sm"
                            >
                              <span className="mr-2 text-rose-300">
                                {i + 1} →
                              </span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      )}
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => void act("reassess", concept.id)}
                        >
                          Try a different question
                        </button>
                        <button
                          className={secondary}
                          disabled={busy}
                          onClick={() => void speak("remediation", concept.id)}
                        >
                          Listen to explanation
                        </button>
                      </div>
                    </section>
                  )}
                  {active?.mode === "feedback" && (
                    <section className={panel}>
                      <h3
                        className={`text-xl ${active.correct ? "text-emerald-300" : "text-amber-300"}`}
                      >
                        {active.correct
                          ? "Passed this check"
                          : "Let’s work on the missing step"}
                      </h3>
                      <p className="mt-3 leading-7 text-stone-300">
                        {active.explanation}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {!active.correct && active.concept_id && (
                          <button
                            className={button}
                            disabled={busy}
                            onClick={() => void act("teach", active.concept_id)}
                          >
                            Explain with an example
                          </button>
                        )}
                        <button
                          className={secondary}
                          disabled={busy}
                          onClick={() => void act("return")}
                        >
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
                          className={secondary}
                          disabled={busy}
                          onClick={() => void act("quiz")}
                        >
                          Check this phase
                        </button>
                      )}
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => void act("next")}
                      >
                        {phase.id === doc.phases.at(-1)?.id
                          ? "Finish lesson"
                          : "Next phase →"}
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
                        className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 p-3 text-sm"
                        placeholder="Which step is unclear?"
                      />
                      <button
                        className={button}
                        disabled={busy || !query.trim()}
                      >
                        Ask
                      </button>
                    </form>
                    {reply && (
                      <div className="mt-5">
                        <p className="text-xs text-amber-300">
                          {reply.provenance} · not verified as lecture content
                        </p>
                        <p className="mt-3 whitespace-pre-wrap leading-7 text-stone-300">
                          {reply.explanation}
                        </p>
                        {reply.steps.length > 0 && (
                          <ol className="mt-4 space-y-2">
                            {reply.steps.map((s, i) => (
                              <li
                                className="rounded-lg border border-white/10 p-3 text-sm"
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
                    <h3 className="text-sm font-medium">Original recording</h3>
                    <video
                      ref={player}
                      controls
                      preload="metadata"
                      className="mt-4 w-full rounded-lg bg-black"
                      src={`/api/v2/recordings/${id}/media`}
                    />
                    <p className="mt-3 text-xs leading-5 text-stone-500">
                      Evidence buttons seek to the original excerpt.
                      Supplementary explanations are labelled separately.
                    </p>
                    {sourceMessage && (
                      <p role="status" className="mt-3 text-sm text-amber-200">
                        {sourceMessage}
                      </p>
                    )}
                    {source.map((s) => (
                      <button
                        key={s.id}
                        className="mt-4 block w-full rounded-lg border border-white/10 p-3 text-left"
                        onClick={() => {
                          if (player.current)
                            player.current.currentTime = s.start;
                        }}
                      >
                        <span className="text-xs font-mono text-rose-300">
                          {timestamp(s.start)}–{timestamp(s.end)}
                        </span>
                        <p className="mt-2 text-xs leading-6 text-stone-300">
                          {s.text}
                        </p>
                      </button>
                    ))}
                  </section>
                  <section className={`${panel} !p-4`}>
                    <h3 className="text-sm font-medium">Concept connections</h3>
                    {doc.concepts.length === 0 ? (
                      <p className="mt-3 text-xs text-stone-400">
                        No gaps identified in this completed analysis.
                      </p>
                    ) : (
                      doc.concepts.map((c) => (
                        <div
                          key={c.id}
                          className="mt-4 border-t border-white/10 pt-4"
                        >
                          <p className="text-sm">{c.name}</p>
                          <p className="mt-1 text-xs text-stone-500">
                            {labels[c.coverage]}
                          </p>
                          <p className="mt-1 text-xs text-rose-200">
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
                                className="mt-2 text-xs text-stone-400"
                              >
                                ↳ Before {p.title}
                              </p>
                            ))}
                          {c.explanation_evidence_ids.length > 0 && (
                            <button
                              className="mt-2 text-xs text-emerald-300 underline"
                              onClick={() =>
                                void showSource(c.explanation_evidence_ids)
                              }
                            >
                              Hear where it is explained
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </section>
                  <section className={`${panel} !p-4`}>
                    <label className="text-sm" htmlFor="voice">
                      Narration voice
                    </label>
                    <select
                      id="voice"
                      className="mt-3 w-full rounded-lg bg-neutral-900 p-2 text-sm"
                      value={user?.preferences.voice || "Joanna"}
                      onChange={async (e) => {
                        try {
                          const prefs = await request<Me["preferences"]>(
                            "/preferences",
                            { voice: e.target.value, language: "English" },
                          );
                          setUser((u) =>
                            u ? { ...u, preferences: prefs } : u,
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <option value="Joanna">Joanna · English</option>
                      <option value="Matthew">Matthew · English</option>
                    </select>
                    <p className="mt-2 text-xs text-stone-500">
                      Changes apply only to this learner.
                    </p>
                  </section>
                </aside>
              </div>
            ) : (
              <p>Preparing session…</p>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}
