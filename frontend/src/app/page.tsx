import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDown,
  Video,
  ShieldCheck,
  Clock,
  Search,
  Sparkles,
  Compass,
  Upload,
  RotateCcw,
  Bell,
  Mail,
  Volume2,
  CheckCircle2,
  Brain,
  PlayCircle,
  FileText,
  Headphones,
  Lock,
  Layers,
  Radio,
  Zap,
} from "lucide-react";
import Shell from "@/components/adaptive/Shell";
import { button, secondary } from "@/lib/ui-tokens";
import JourneyPreview from "@/components/adaptive/JourneyPreview";

export default function Home() {
  return (
    <Shell>
      <main className="mx-auto max-w-7xl px-5 sm:px-8">
        {/* Hero Section */}
        <section className="hero-layout">
          <div className="hero-copy">
            <p className="hero-kicker">
              <span className="live-dot" /> LESS REWATCHING. MORE UNDERSTANDING.
            </p>
            <h1>
              Your lecture.
              <br />
              The missing steps.
              <br />
              <em>Finally connected.</em>
            </h1>
            <p className="hero-description">
              Go beyond replaying a recording. Discover the knowledge it assumes, learn the steps
              you need, and find your way back—with the original evidence beside you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className={`${button} inline-flex items-center gap-1.5 whitespace-nowrap`}
                href="/workspace"
              >
                <span>Start learning</span>{" "}
                <ArrowUpRight className="w-4 h-4 shrink-0 inline-block align-middle" />
              </Link>
              <a
                className={`${secondary} inline-flex items-center gap-1.5 whitespace-nowrap`}
                href="#features"
              >
                <span>Explore all features</span>{" "}
                <ArrowDown className="w-4 h-4 shrink-0 inline-block align-middle" />
              </a>
            </div>
            <div className="hero-footnote">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Video className="w-3.5 h-3.5 text-rose-400 shrink-0 inline-block align-middle" />{" "}
                Audio & video
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 inline-block align-middle" />{" "}
                Evidence connected
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 inline-block align-middle" />{" "}
                Your pace
              </span>
            </div>
          </div>
          <JourneyPreview />
        </section>

        {/* 3-Step Pedagogical Flow */}
        <section id="how-it-works" className="how-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FROM RECORDING TO CONNECTION</p>
              <h2>A little clarity changes everything.</h2>
            </div>
            <p>
              Keep what you know.
              <br />
              Build what comes next.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              [
                "01",
                <Search key="01" className="w-5 h-5 text-rose-400 shrink-0" />,
                "Find the missing step",
                "See what was explained, assumed, or covered elsewhere in the recording.",
              ],
              [
                "02",
                <Sparkles key="02" className="w-5 h-5 text-amber-400 shrink-0" />,
                "Make it click",
                "Try a short diagnostic. Get a focused explanation and worked example when you need one.",
              ],
              [
                "03",
                <Compass key="03" className="w-5 h-5 text-emerald-400 shrink-0" />,
                "Keep moving forward",
                "Try another question and resume your lecture. The original excerpts stay within reach.",
              ],
            ].map(([n, icon, title, text]) => (
              <article key={n as string} className="ui-panel rounded-2xl p-6 sm:p-8 feature-card">
                <div className="feature-top">
                  <span className="feature-icon flex items-center justify-center">
                    {icon as React.ReactNode}
                  </span>
                  <span>{n as string} /</span>
                </div>
                <h3>{title as string}</h3>
                <p>{text as string}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Comprehensive Platform Capabilities */}
        <section id="features" className="py-12 border-t border-[var(--line)]">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BUILT FOR COMPLETE MASTERY</p>
              <h2>Every feature designed for active learning.</h2>
            </div>
            <p>
              From raw lecture recordings to interactive learning,
              <br className="hidden sm:inline" /> backed by verifiable instructor receipts.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-6">
            {/* Feature 1: Multi-Source Lecture Ingestion */}
            <article className="ui-panel rounded-2xl p-6 sm:p-7 feature-card flex flex-col justify-between">
              <div>
                <div className="feature-top">
                  <span className="feature-icon flex items-center justify-center">
                    <Upload className="w-5 h-5 text-rose-400 shrink-0" />
                  </span>
                  <span className="text-[11px] font-mono text-[var(--accent-ink)] uppercase">Ingestion</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-[var(--ink)] mt-4">
                  Multi-Source Ingestion
                </h3>
                <p className="text-xs leading-relaxed text-[var(--muted-ink)] mt-2">
                  Bring your lectures in whatever format works best for you without tedious conversion.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-[var(--ink)]">
                  <li className="flex items-start gap-2">
                    <Video className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span><strong>Direct file upload:</strong> MP4, WebM, MP3, WAV, M4A, FLAC up to 100 MB.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Radio className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span><strong>YouTube video import:</strong> Paste public YouTube URLs with auto stream extraction.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span><strong>Direct media links:</strong> Ingest direct HTTPS audio and MP4 lecture streams.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Video className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span><strong>Live in-browser recording:</strong> Capture webcam and microphone with live audio meters.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 mt-4 border-t border-[var(--line)] text-[11px] text-[var(--muted-ink)]">
                Includes automated media normalization & background validation
              </div>
            </article>

            {/* Feature 2: Exact-Point Resume & Fault Tolerance */}
            <article className="ui-panel rounded-2xl p-6 sm:p-7 feature-card flex flex-col justify-between">
              <div>
                <div className="feature-top">
                  <span className="feature-icon flex items-center justify-center">
                    <RotateCcw className="w-5 h-5 text-amber-400 shrink-0" />
                  </span>
                  <span className="text-[11px] font-mono text-[var(--accent-ink)] uppercase">Reliability</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-[var(--ink)] mt-4">
                  Exact-Point Resume
                </h3>
                <p className="text-xs leading-relaxed text-[var(--muted-ink)] mt-2">
                  Completed transcripts and eligible AI responses are reused where available.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-[var(--ink)]">
                  <li className="flex items-start gap-2">
                    <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span><strong>Staged processing:</strong> Ingestion → Transcription → Pedagogical compilation → Checkpoints.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span><strong>Stage-level retry:</strong> Retries reuse saved work; unfinished or invalid generation steps may repeat.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span><strong>Transcript &amp; response caching:</strong> Completed transcripts and concept extractions persist on disk.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span><strong>Transparent diagnostics:</strong> Clear error messages with actionable resolution guidance.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 mt-4 border-t border-[var(--line)] text-[11px] text-[var(--muted-ink)]">
                Asynchronous worker queue powered by FastAPI & systemd
              </div>
            </article>

            {/* Feature 3: Multi-Channel Notifications */}
            <article className="ui-panel rounded-2xl p-6 sm:p-7 feature-card flex flex-col justify-between">
              <div>
                <div className="feature-top">
                  <span className="feature-icon flex items-center justify-center">
                    <Bell className="w-5 h-5 text-emerald-400 shrink-0" />
                  </span>
                  <span className="text-[11px] font-mono text-[var(--accent-ink)] uppercase">Alerts</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-[var(--ink)] mt-4">
                  Multi-Channel Alerts
                </h3>
                <p className="text-xs leading-relaxed text-[var(--muted-ink)] mt-2">
                  Stay updated on compilation progress without staring at a progress bar.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-[var(--ink)]">
                  <li className="flex items-start gap-2">
                    <Bell className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>In-app live polling:</strong> Real-time progress percentage, stage cues, and animated states.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Spoken voice cues:</strong> Web Audio synthesis announces when your lecture is ready.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>Amazon SES emails:</strong> Receive a completion email with direct link to your workspace.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>In-app error cues:</strong> Clear visual breakdown if media has unreadable audio or formatting errors.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 mt-4 border-t border-[var(--line)] text-[11px] text-[var(--muted-ink)]">
                Verified sending identity via Amazon Simple Email Service (SES)
              </div>
            </article>

            {/* Feature 4: Gap Detection & Active Diagnostic Q&A */}
            <article className="ui-panel rounded-2xl p-6 sm:p-7 feature-card flex flex-col justify-between">
              <div>
                <div className="feature-top">
                  <span className="feature-icon flex items-center justify-center">
                    <Brain className="w-5 h-5 text-cyan-400 shrink-0" />
                  </span>
                  <span className="text-[11px] font-mono text-[var(--accent-ink)] uppercase">Pedagogy</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-[var(--ink)] mt-4">
                  Gap Detection & Q&A
                </h3>
                <p className="text-xs leading-relaxed text-[var(--muted-ink)] mt-2">
                  Identify what the lecture assumed vs. what it explained, and test your readiness.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-[var(--ink)]">
                  <li className="flex items-start gap-2">
                    <Brain className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <span><strong>Inferred prerequisites:</strong> Uncover hidden concept dependencies before tough topics.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <span><strong>Diagnostic checkpoints:</strong> Interactive multiple-choice questions for each phase.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <span><strong>Worked pedagogical feedback:</strong> Instant, step-by-step reasoning for all answers.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Compass className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <span><strong>Check status tracking:</strong> Checkpoint evidence updates from Unchecked to Passed.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 mt-4 border-t border-[var(--line)] text-[11px] text-[var(--muted-ink)]">
                Ground-truth pedagogical compiler with strict anti-hallucination rules
              </div>
            </article>

            {/* Feature 5: Synchronized Evidence Player & Studio Narration */}
            <article className="ui-panel rounded-2xl p-6 sm:p-7 feature-card flex flex-col justify-between">
              <div>
                <div className="feature-top">
                  <span className="feature-icon flex items-center justify-center">
                    <PlayCircle className="w-5 h-5 text-indigo-400 shrink-0" />
                  </span>
                  <span className="text-[11px] font-mono text-[var(--accent-ink)] uppercase">Evidence</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-[var(--ink)] mt-4">
                  Player & Transcripts
                </h3>
                <p className="text-xs leading-relaxed text-[var(--muted-ink)] mt-2">
                  Listen, read, and cross-reference every concept with the original instructor's words.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-[var(--ink)]">
                  <li className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span><strong>Verbatim synchronized transcript:</strong> Click any segment timestamp to seek playback.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Headphones className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span><strong>Word-by-word karaoke tracking:</strong> Active words illuminate in real time as audio plays.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span><strong>Inspect lecture evidence:</strong> 1-click jump from concept cards to source timestamps.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Volume2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span><strong>Amazon Polly narration:</strong> Switch between browser voice and studio voices (Joanna & Matthew).</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 mt-4 border-t border-[var(--line)] text-[11px] text-[var(--muted-ink)]">
                Word-level timestamps powered by Whisper speech alignment
              </div>
            </article>

            {/* Feature 6: Privacy-Preserving Frictionless Study */}
            <article className="ui-panel rounded-2xl p-6 sm:p-7 feature-card flex flex-col justify-between">
              <div>
                <div className="feature-top">
                  <span className="feature-icon flex items-center justify-center">
                    <Lock className="w-5 h-5 text-violet-400 shrink-0" />
                  </span>
                  <span className="text-[11px] font-mono text-[var(--accent-ink)] uppercase">Privacy</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-[var(--ink)] mt-4">
                  Frictionless Workspace
                </h3>
                <p className="text-xs leading-relaxed text-[var(--muted-ink)] mt-2">
                  Zero sign-up barrier, no password fatigue, and private learner workspaces.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-[var(--ink)]">
                  <li className="flex items-start gap-2">
                    <Lock className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                    <span><strong>Anonymous learner sessions:</strong> Progress and answers saved safely in your browser.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Layers className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                    <span><strong>Public lecture library:</strong> Pre-compiled lectures in CS and Math ready to study.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                    <span><strong>Interactive waveform:</strong> Dynamic scrubbing, frequency bars, and preview loops.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                    <span><strong>No behavioral tracking:</strong> Your recordings are processed strictly for your study session.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 mt-4 border-t border-[var(--line)] text-[11px] text-[var(--muted-ink)]">
                Theme-aware Light and Dark modes with instant client-side switching
              </div>
            </article>
          </div>
        </section>

        {/* Technical Architecture Strip */}
        <section className="py-10 border-t border-[var(--line)]">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <p className="eyebrow">PRODUCTION CLOUD ARCHITECTURE</p>
                <h3 className="text-xl font-semibold tracking-tight text-[var(--ink)] mt-1">
                  Engineered with AWS & Modern AI Infrastructure
                </h3>
                <p className="text-xs text-[var(--muted-ink)] mt-2 max-w-2xl leading-relaxed">
                  Blindspot Edu couples state-of-the-art speech models and pedagogical reasoning with a
                  hardened AWS backend to support interactive learning.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-center">
                  <div className="text-xs font-bold text-[var(--accent-ink)]">Faster-Whisper</div>
                  <div className="text-[10px] text-[var(--muted-ink)] mt-0.5">On-Host Alignment</div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-center">
                  <div className="text-xs font-bold text-[var(--accent-ink)]">Alibaba Model Studio</div>
                  <div className="text-[10px] text-[var(--muted-ink)] mt-0.5">Pedagogical LLM</div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-center">
                  <div className="text-xs font-bold text-[var(--accent-ink)]">Amazon S3 &amp; SES</div>
                  <div className="text-[10px] text-[var(--muted-ink)] mt-0.5">Storage &amp; Email Outbox</div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-center">
                  <div className="text-xs font-bold text-[var(--accent-ink)]">Polly &amp; Caddy</div>
                  <div className="text-[10px] text-[var(--muted-ink)] mt-0.5">Neural Audio &amp; TLS</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Evidence Banner Call to Action */}
        <section className="evidence-banner flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 sm:gap-8">
          <div className="max-w-xl">
            <p className="eyebrow">TEACHING WITH RECEIPTS</p>
            <h2>Know where the explanation comes from.</h2>
            <p>
              Lecture evidence and supplementary teaching are labelled separately. You can always
              inspect the original excerpt to verify every concept.
            </p>
          </div>
          <Link
            className={`${secondary} inline-flex items-center gap-1.5 whitespace-nowrap shrink-0`}
            href="/workspace"
          >
            <span>Open your workspace</span>{" "}
            <ArrowUpRight className="w-4 h-4 shrink-0 inline-block align-middle" />
          </Link>
        </section>
      </main>
    </Shell>
  );
}
