import Link from "next/link";
import {
  Scale,
  FileCheck,
  ArrowLeft,
  AlertCircle,
  ShieldAlert,
  BookOpen,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import Shell from "@/components/adaptive/Shell";
import { secondary, panel } from "@/lib/ui-tokens";

export const metadata = {
  title: "Terms of Service — Blindspot Edu",
  description:
    "Terms of Service and conditions for using the Blindspot Edu adaptive learning platform.",
};

export default function TermsPage() {
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
          <p className="eyebrow">USER AGREEMENT & SERVICE TERMS</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--ink)]">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm sm:text-base text-[var(--muted-ink)] max-w-3xl leading-relaxed">
            Please read these terms carefully before accessing or using Blindspot Edu. By using our platform,
            you agree to be bound by these provisions and our data protection principles.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--muted-ink)]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--accent-ink)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-ink)]" />
              Production Release adaptive-v1
            </span>
            <span>&bull;</span>
            <span>Effective: September 2026</span>
            <span>&bull;</span>
            <span>Educational use only</span>
          </div>
        </div>

        {/* 2-Column Grid Layout matching Workspace */}
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Main Legal Content */}
          <div className="space-y-6">
            {/* Section 1: Acceptance */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <FileCheck className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Section 01</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    Acceptance of Terms
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                By accessing, browsing, uploading recordings to, or utilizing Blindspot Edu (&ldquo;the Service&rdquo;, &ldquo;we&rdquo;, or &ldquo;our&rdquo;), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service and our accompanying Privacy Protocol. If you do not agree, do not access or use the Service.
              </p>
            </article>

            {/* Section 2: Pedagogical Purpose & Non-Accreditation */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <BookOpen className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Section 02</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    Pedagogical Purpose & Non-Accreditation
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                Blindspot Edu is an adaptive comprehension companion designed to illuminate assumed prerequisites and link explanations back to original lecture evidence.
              </p>
              <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-4 text-xs text-[var(--ink)] space-y-2">
                <p className="font-semibold text-[var(--accent-ink)]">
                  Grounding & Accreditation Disclosure:
                </p>
                <p>
                  <strong>Navigation never awards academic credit.</strong> Passing an in-app check provides evidence regarding understanding of that specific diagnostic question, not an accredited mastery claim or official course grade.
                </p>
                <p>
                  Blindspot Edu is not an accredited university, degree-granting institution, or official examination board.
                </p>
              </div>
            </article>

            {/* Section 3: User Media & Content Rights */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldAlert className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Section 03</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    User Media & Permissions
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                You are solely responsible for all audio, video, URLs, or materials you upload, stream, record, or submit to the Service:
              </p>
              <ul className="mt-3 space-y-2.5 text-xs sm:text-sm text-[var(--muted-ink)]">
                <li>
                  <strong className="text-[var(--ink)]">Permission Required:</strong> You represent and warrant that you own or have obtained all necessary permissions, licenses, and consents from course instructors or copyright holders to record and process lecture media for educational study.
                </li>
                <li>
                  <strong className="text-[var(--ink)]">Prohibited Material:</strong> You agree not to upload materials that are defamatory, harassing, copyright-infringing, or containing malicious software.
                </li>
                <li>
                  <strong className="text-[var(--ink)]">Third-Party Platforms:</strong> When importing public YouTube videos or remote HTTPS links, you are responsible for complying with the respective platform&rsquo;s terms of service.
                </li>
              </ul>
            </article>

            {/* Section 4: Operational Limits & Fair Access */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <AlertCircle className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Section 04</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    Service Quotas & Fair Access
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                To guarantee operational stability and fair resource access for all university learners:
              </p>
              <ul className="mt-3 space-y-2 text-xs sm:text-sm text-[var(--muted-ink)]">
                <li>File uploads are restricted to supported formats (MP4, WebM, MP3, WAV, M4A, FLAC) up to 100 MB.</li>
                <li>Recording duration limits apply per lecture (up to 60 minutes).</li>
                <li>We reserve the right to throttle, cancel, or reject automated abuse that circumvents quotas or degrades shared worker infrastructure.</li>
              </ul>
            </article>

            {/* Section 5: Intellectual Property */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Scale className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Section 05</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    Intellectual Property
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                <strong>Your Media:</strong> You retain ownership of all intellectual property rights you hold in your uploaded recordings. You grant Blindspot Edu a limited license solely to transcode, transcribe, and analyze the content to deliver your study workspace.
              </p>
              <p className="mt-3 text-xs sm:text-sm leading-relaxed text-[var(--muted-ink)]">
                <strong>Platform IP:</strong> Blindspot Edu, its branding, pedagogical compiler architecture, audio waveform scrubber, and interface code are protected proprietary property of Blindspot Edu.
              </p>
            </article>

            {/* Section 6: Limitation of Liability */}
            <article className={panel}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  <AlertCircle className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-ink)]">Section 06</span>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                    Warranties & Limitation of Liability
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-xs sm:text-sm text-[var(--muted-ink)] leading-relaxed uppercase tracking-wider">
                THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND. TO THE FULLEST EXTENT PERMISSIBLE BY LAW, BLINDSPOT EDU DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED.
              </p>
              <p className="mt-3 text-xs sm:text-sm text-[var(--muted-ink)] leading-relaxed">
                Lecture explanations link to supporting excerpts and timestamps; added teaching is labelled supplementary. AI models can make errors. Learners should always cross-reference critical topics with official syllabus textbooks and primary faculty instructions.
              </p>
            </article>
          </div>

          {/* Right Sidebar matching Workspace layout */}
          <aside className="space-y-6">
            <div className={`${panel} space-y-4`}>
              <h3 className="text-base font-semibold tracking-tight text-[var(--ink)]">
                Key Terms at a Glance
              </h3>
              <ul className="space-y-3 text-xs text-[var(--muted-ink)]">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Permission:</strong> Only upload lectures you have permission to process.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Study Aid:</strong> Designed to assist understanding, not grant university degrees.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Limits:</strong> 100 MB file upload limit and 60-minute duration ceiling.</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Ownership:</strong> You own your recordings; we only process them for you.</span>
                </li>
              </ul>
              <div className="pt-4 border-t border-[var(--line)]">
                <Link
                  href="/privacy"
                  className={`${secondary} w-full inline-flex items-center justify-center gap-1.5 text-xs`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Review Privacy Protocol</span>
                </Link>
              </div>
            </div>

            <div className={`${panel} space-y-3`}>
              <h3 className="text-base font-semibold tracking-tight text-[var(--ink)]">
                Questions & Legal Notices
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
