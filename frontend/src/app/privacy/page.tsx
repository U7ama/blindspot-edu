import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  ArrowLeft,
  Server,
  Mail,
  Trash2,
  CheckCircle2,
  ArrowUpRight,
  EyeOff,
  Scale,
} from "lucide-react";
import Shell from "@/components/adaptive/Shell";
import { secondary, panel } from "@/lib/ui-tokens";

export const metadata = {
  title: "Privacy Protocol — Blindspot Edu",
  description:
    "Learn how Blindspot Edu protects learner privacy with anonymous sessions, private S3 storage, and optional notifications.",
};

export default function PrivacyPage() {
  return (
    <Shell>
      <main className="site-frame py-8 sm:py-10">
        {/* Navigation Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-ink)] hover:text-[var(--accent-ink)] transition-colors group"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-1" />
            <span>Return to Home</span>
          </Link>
        </div>

        {/* Page Heading matching workspace/landing */}
        <div className="pb-8 border-b border-[var(--line)]">
          <p className="eyebrow">DATA PROTECTION & PRIVACY PROTOCOL</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--ink)]">
            Privacy Policy & Data Protocol
          </h1>
          <p className="mt-3 text-sm sm:text-base text-[var(--muted-ink)] max-w-3xl leading-relaxed">
            Blindspot Edu is engineered to respect student and educator privacy. We believe learning tools
            should be frictionless, transparent, and free of behavioral surveillance.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--muted-ink)]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--accent-ink)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-ink)]" />
              Production Release adaptive-v1
            </span>
            <span>&bull;</span>
            <span>Effective: September 2026</span>
            <span>&bull;</span>
            <span>Anonymous learner sessions</span>
          </div>
        </div>

        {/* 2-Column Grid Layout matching Workspace */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Main Legal Content */}
          <div className="space-y-6">
            {/* Pillar 1: Anonymous Learner Sessions */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Lock className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Protocol 01</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    Zero-Friction Anonymous Learner Sessions
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                We do not require account registration, passwords, social logins, or personal profile creation. When you visit Blindspot Edu, your browser is issued an anonymous learner session cookie containing a securely generated random token.
              </p>
              <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-xs text-[var(--ink)] space-y-2">
                <p>
                  <strong>What is saved to your session:</strong> Your progress along lecture phases, completed diagnostic checks, prerequisite check status, and preferred narration settings (such as Amazon Polly voice preferences).
                </p>
                <p>
                  <strong>What is never collected:</strong> Your real name, physical address, academic institution records, or passwords.
                </p>
              </div>
            </article>

            {/* Pillar 2: Audio & Video Processing Protocol */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Server className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Protocol 02</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    Audio & Video Processing Protocol
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                When you upload a lecture recording, import a public YouTube video, or record in-browser media:
              </p>
              <ul className="mt-3 space-y-2.5 text-xs sm:text-sm text-[var(--muted-ink)]">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[var(--ink)]">Encrypted Media Storage:</strong> Uploaded audio and video files are stored in private Amazon S3 buckets (`SSE-AES256`) with strict Block Public Access policies enforced.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[var(--ink)]">On-Host Speech Recognition:</strong> Audio transcription executes locally on the EC2 host using Faster-Whisper. Audio files are not transmitted to third-party transcription services.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[var(--ink)]">Pedagogical LLM Processing:</strong> Generated transcripts are analyzed for prerequisite concepts, phase boundaries, and diagnostics via commercial API endpoints with <strong>Alibaba Cloud Model Studio (Qwen 3.7 Flash)</strong>. Bedrock is an available adapter but is not the active production provider. Provider handling is governed by the applicable API terms; we do not claim a verified provider-wide no-training guarantee.
                  </span>
                </li>
              </ul>
            </article>

            {/* Pillar 3: Transactional Email & Zero Retention */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Mail className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Protocol 03</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    Email Notifications & Retention
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                Providing an email address on the upload form is entirely optional. If you choose to provide an email:
              </p>
              <ul className="mt-3 space-y-2.5 text-xs sm:text-sm text-[var(--muted-ink)]">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    It is used exclusively to send a <strong>single one-time transactional message</strong> notifying you when your lecture processing completes successfully.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Backup copies and provider records may retain data beyond active queue cleanup. Emails are dispatched via Amazon Simple Email Service (SES) under our verified domain identity (<code className="text-[var(--accent-ink)]">@blindspot-edu.online</code>).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[var(--ink)]">Active Queue Cleanup:</strong> We do not send marketing newsletters. Once dispatched (or after reaching the 3 retry attempt limit), the recipient address field in the active database queue is cleared.
                  </span>
                </li>
              </ul>
            </article>

            {/* Pillar 4: Infrastructure & Subprocessors */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <EyeOff className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Protocol 04</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    Infrastructure & Subprocessors
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                Blindspot Edu uses the following service providers:
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3.5">
                  <div className="font-semibold text-xs text-[var(--accent-ink)]">Amazon Web Services</div>
                  <div className="text-[11px] text-[var(--muted-ink)] mt-1 leading-relaxed">
                    Hosting (EC2 in us-east-1), encrypted storage (S3), email dispatch (SES), and neural speech synthesis (Polly).
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3.5">
                  <div className="font-semibold text-xs text-[var(--accent-ink)]">Alibaba Model Studio</div>
                  <div className="text-[11px] text-[var(--muted-ink)] mt-1 leading-relaxed">
                    Commercial MaaS API (ap-southeast-1) for Qwen 3.7 Flash pedagogical decomposition.
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3.5">
                  <div className="font-semibold text-xs text-[var(--accent-ink)]">Cloudflare</div>
                  <div className="text-[11px] text-[var(--muted-ink)] mt-1 leading-relaxed">
                    DNS resolution for blindspot-edu.online. Application traffic connects directly to the AWS host.
                  </div>
                </div>
              </div>
            </article>

            {/* Pillar 5: Learner Control & Erasure */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Trash2 className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Protocol 05</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    Data Control & Right to Erasure
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                Because learner accounts are tied to your browser session:
              </p>
              <ul className="mt-3 space-y-2 text-xs sm:text-sm text-[var(--muted-ink)]">
                <li>
                  <strong className="text-[var(--ink)]">Clearing Cookies:</strong> Clearing your browser cookies or site data immediately detaches your device from your anonymous session key.
                </li>
                <li>
                  <strong className="text-[var(--ink)]">Local Recording Drafts:</strong> In-browser studio recordings stored in client cache remain entirely on your device until uploaded or discarded.
                </li>
                <li>
                  <strong className="text-[var(--ink)]">Explicit Erasure Requests:</strong> If you need any specific lecture recording or processed artifact deleted, submit a request via our project repository issue tracker with your workspace URL.
                </li>
              </ul>
            </article>
          </div>

          {/* Right Sidebar matching Workspace layout */}
          <aside className="space-y-6">
            <div className={`${panel} space-y-4`}>
              <h3 className="text-base font-semibold tracking-tight text-[var(--ink)]">
                Summary of Guarantees
              </h3>
              <ul className="space-y-3 text-xs text-[var(--muted-ink)]">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Zero tracking:</strong> No analytics trackers or commercial advertising pixels.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Encrypted at rest:</strong> All audio and video encrypted with SSE-AES256 on AWS.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Commercial API terms:</strong> Transcript excerpts are sent to the configured inference provider under its applicable API terms.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Ephemeral email:</strong> Notification emails purged from active queues once sent.</span>
                </li>
              </ul>
              <div className="pt-4 border-t border-[var(--line)]">
                <Link
                  href="/terms"
                  className={`${secondary} w-full inline-flex items-center justify-center gap-1.5 text-xs`}
                >
                  <Scale className="w-3.5 h-3.5 text-[var(--accent-ink)] shrink-0" />
                  <span>Review Terms of Service</span>
                </Link>
              </div>
            </div>

            <div className={`${panel} space-y-3`}>
              <h3 className="text-base font-semibold tracking-tight text-[var(--ink)]">
                Privacy & Data Inquiries
              </h3>
              <p className="text-xs text-[var(--muted-ink)] leading-relaxed">
                For support, privacy, or deletion requests, email the developer privately. Do not post private lecture details in a public issue tracker:
              </p>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-center">
                <a
                  href="mailto:usamaaslam8726@gmail.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono font-medium text-[var(--accent-ink)] hover:underline break-all"
                >
                  usamaaslam8726@gmail.com
                </a>
                <div className="text-[10px] text-[var(--muted-ink)] mt-1">
                  Private support contact
                </div>
              </div>
              <div className="pt-2">
                <Link
                  href="/workspace"
                  className="w-full inline-flex items-center justify-center gap-1 text-xs text-[var(--accent-ink)] hover:underline font-medium"
                >
                  <span>Open Study Workspace</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </Shell>
  );
}
