"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Upload, BookOpen, Clock, AlertCircle, Link2, Mic, Bell, Volume2 } from "lucide-react";
import Shell, { button, secondary, panel } from "@/components/adaptive/Shell";
import { watchRecording } from "@/components/adaptive/CompletionAlerts";
import LectureRecorder from "@/components/adaptive/LectureRecorder";
import { me, request, upload, Recording, Me, timestamp } from "@/lib/adaptive";
export default function Library() {
  const router = useRouter();
  const [items, setItems] = useState<Recording[] | null>(null);
  const [user, setUser] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"file" | "link" | "record">("file");
  const [capturing, setCapturing] = useState(false);
  const [url, setUrl] = useState("");
  const [permission, setPermission] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyBrowser, setNotifyBrowser] = useState(false);
  const [notifyVoice, setNotifyVoice] = useState(false);
  const [uploadBytes, setUploadBytes] = useState<{sent:number; total:number} | null>(null);
  const abortUpload = useRef<AbortController | null>(null);
  useEffect(() => () => abortUpload.current?.abort(), []);
  const [code, setCode] = useState("");
  async function load() {
    try {
      setUser(await me());
      setItems(await request<Recording[]>("/recordings"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function invite() {
    setBusy(true);
    setError("");
    try {
      await request("/invite", { code });
      setUser((u) => (u ? { ...u, invited: true } : u));
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function ingest(file: File) {
    setBusy(true);
    setError("");
    try {
      if (notifyEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail.trim()))
        throw new Error("Enter a valid email address before uploading, or leave the alert field blank.");
      if (user && file.size > user.limits.upload_bytes)
        throw new Error("Recording exceeds the upload size limit");
      abortUpload.current = new AbortController();
      setUploadBytes({sent:0,total:file.size});
      const record = await upload(file, (sent,total) => setUploadBytes({sent,total}), abortUpload.current.signal);
      try { sessionStorage.setItem(`blindspot-review:${record.id}`, String(Date.now())); } catch {}
      watchRecording({id:record.id,title:record.title,browser:notifyBrowser,voice:notifyVoice});
      if (notifyEmail.trim()) {
        try {
          await request(`/recordings/${record.id}/notification`, {email:notifyEmail.trim()});
        } catch (e) {
          void load();
          setError(`Recording uploaded, but the email alert could not be saved: ${(e as Error).message}. Open your recording to continue.`);
          return true;
        }
      }
      router.push(`/workspace/${record.id}`);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
      setUploadBytes(null);
      abortUpload.current = null;
    }
  }
  async function ingestLink() {
    setBusy(true);setError("");
    try {
      if (notifyEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail.trim()))
        throw new Error("Enter a valid email address before importing, or leave the alert field blank.");
      const record = await request<Recording>("/recordings/import", {url:url.trim(),permission_confirmed:permission});
      try { sessionStorage.setItem(`blindspot-review:${record.id}`, String(Date.now())); } catch {}
      watchRecording({id:record.id,title:record.title,browser:notifyBrowser,voice:notifyVoice});
      if (notifyEmail.trim()) {
        try {
          await request(`/recordings/${record.id}/notification`, {email:notifyEmail.trim()});
        } catch (e) {
          void load();
          setError(`Recording imported, but the email alert could not be saved: ${(e as Error).message}. Open your recording to continue.`);
          return;
        }
      }
      router.push(`/workspace/${record.id}`);
    } catch(e) {setError((e as Error).message);}
    finally {setBusy(false);}
  }
  return (
    <Shell>
      <main className="site-frame py-8 sm:py-10">
        <p className="text-xs font-mono uppercase tracking-widest text-[var(--accent-ink)]">
          Learning workspace
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">
          Start with a lecture.
        </h1>
        <p className="mt-3 text-sm sm:text-base text-[var(--muted-ink)] max-w-2xl">
          Your place and check results are saved in this browser. Clearing its
          cookies removes access to this anonymous learner account.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-800 bg-red-950/30 p-4 text-red-200"
          >
            {error}
          </p>
        )}
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <section className="space-y-4">
            {items === null ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className={`${panel} animate-pulse`}>
                    <div className="flex justify-between">
                      <div className="h-3 w-28 rounded bg-[var(--surface-soft)]" />
                      <div className="h-3 w-16 rounded bg-[var(--surface-soft)]" />
                    </div>
                    <div className="mt-4 h-6 w-3/4 rounded bg-[var(--surface-soft)]" />
                    <div className="mt-4 h-4 w-32 rounded bg-[var(--surface-soft)]" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className={panel}>
                <h2 className="text-lg font-medium">No lecture is available yet</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                  An administrator must publish a permission-approved lecture, or
                  an invited participant can upload a recording. No lecture
                  content is invented automatically.
                </p>
              </div>
            ) : (
              items.map((r) => (
                <Link
                  key={r.id}
                  href={`/workspace/${r.id}`}
                  className={`${panel} block hover:border-[var(--accent-ink)] transition-all group`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-ink)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-ink)]" />
                      {r.public ? "PUBLIC LECTURE" : "YOUR RECORDING"}
                    </span>
                    <span className="text-xs text-[var(--muted-ink)] capitalize">
                      {r.status === "insufficient_content" ? "More educational content needed" : r.status}
                    </span>
                  </div>
                  <h2 className="mt-3.5 text-xl font-medium tracking-tight group-hover:text-[var(--accent-ink)] transition-colors break-words [overflow-wrap:anywhere]">
                    {r.title}
                  </h2>
                  <div className="mt-3 flex items-center gap-2 text-sm text-[var(--muted-ink)]">
                    <Clock className="w-3.5 h-3.5 opacity-70" />
                    <span>{timestamp(r.duration)}</span>
                    <span>·</span>
                    {r.status === "ready" ? (
                      <span className="inline-flex items-center gap-1 text-[var(--accent-ink)] font-medium">
                        Open your lesson <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        View processing status <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </Link>
              ))
            )}
          </section>
          <aside className={`${panel} h-fit space-y-4`}>
            <div>
              <h2 className="text-lg font-medium tracking-tight">Course &amp; Lecture Access</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-ink)]">
                {user?.invited
                  ? `Upload a recording you have permission to process. Maximum ${Math.round(user.limits.upload_bytes / 1048576)} MB and ${user.limits.duration_seconds / 60} minutes.`
                  : "Public lectures are open to explore. Enter your access code to upload and process your own course recordings."}
              </p>
            </div>
            {user?.invited ? (
              <div className="recording-import">
                <div className="import-tabs" aria-label="Recording source">
                  <button aria-pressed={mode==="file"} disabled={busy || capturing} onClick={() => setMode("file")}>
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span>Upload file</span>
                  </button>
                  <button aria-pressed={mode==="link"} disabled={busy || capturing} onClick={() => setMode("link")}>
                    <Link2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Paste link</span>
                  </button>
                  <button aria-pressed={mode==="record"} disabled={busy || capturing} onClick={() => setMode("record")}>
                    <Mic className="w-3.5 h-3.5 shrink-0" />
                    <span>Record lecture</span>
                  </button>
                </div>
                <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3.5" aria-label="Completion alerts">
                  <p className="text-sm font-medium">Tell me when my lesson is ready</p>
                  <label className="flex items-center gap-2 text-sm text-[var(--muted-ink)]">
                    <input type="checkbox" checked={notifyBrowser} disabled={busy || capturing} onChange={async e => {
                      if (!e.currentTarget.checked) { setNotifyBrowser(false); return; }
                      if (!("Notification" in window) || !window.isSecureContext) { setError("Desktop notifications are unavailable in this browser."); return; }
                      const permission = await Notification.requestPermission();
                      if (permission === "granted") { setNotifyBrowser(true); setError(""); }
                      else setError("Desktop notification permission was not granted.");
                    }}/><Bell className="h-4 w-4"/> Desktop notification
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--muted-ink)]">
                    <input type="checkbox" checked={notifyVoice} disabled={busy || capturing} onChange={e => {
                      if (e.currentTarget.checked && !("speechSynthesis" in window)) { setError("Spoken alerts are unavailable in this browser."); return; }
                      setNotifyVoice(e.currentTarget.checked);
                    }}/><Volume2 className="h-4 w-4"/> Spoken alert while this app is open
                  </label>
                </div>
                {user.email_notifications_enabled && <label className="block text-sm text-[var(--muted-ink)]">
                  Email me when the lesson is ready (optional)
                  <input type="email" maxLength={254} autoComplete="email" value={notifyEmail} disabled={busy || capturing}
                    onChange={e => setNotifyEmail(e.target.value)} placeholder="you@example.com"
                    className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ink)]/50"/>
                  <span className="mt-1 block text-xs">Saved as a one-time alert as soon as your recording is accepted. The email does not grant access to a private lesson.</span>
                </label>}
                {mode==="file" ? <label className={`${button} w-full cursor-pointer inline-flex items-center justify-center gap-2`}>
                  <Upload className="w-4 h-4"/>{busy ? "Uploading…" : "Choose audio or video"}
                  <input aria-label="Upload a lecture recording" className="sr-only" type="file" accept=".wav,.mp3,.m4a,.mp4,.flac,.ogg,.aac,.webm" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void ingest(f);e.target.value="";}}/>
                </label> : mode==="record" ? <LectureRecorder limits={user.limits} busy={busy} onSubmit={ingest} onCaptureChange={setCapturing}/> : <form onSubmit={e=>{e.preventDefault();void ingestLink();}} className="import-link-form">
                  <label htmlFor="lecture-url">Lecture URL</label>
                  <input id="lecture-url" type="url" required maxLength={4096} value={url} disabled={busy} onChange={e=>setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…"/>
                  <p>Public YouTube videos or direct HTTPS MP4, WebM and audio files. Private pages, playlists and live streams aren’t supported. YouTube imports include video and audio up to 480p. If a compatible stream is unavailable or downloading is restricted, upload the file instead.</p>
                  <label className="permission-check"><input type="checkbox" checked={permission} disabled={busy} onChange={e=>setPermission(e.target.checked)}/>I have permission to download and process this recording.</label>
                  <button className={`${button} w-full`} disabled={busy || !permission || !url.trim()}>{busy ? "Queueing import…" : "Import lecture"}</button>
                </form>}
                {uploadBytes && <div className="upload-progress" role="status">
                  <strong>{uploadBytes.sent < uploadBytes.total ? "Uploading recording" : "Upload sent · validating media"}</strong>
                  <progress aria-label="File upload progress" value={uploadBytes.sent} max={uploadBytes.total || 1}/>
                  <p>{(uploadBytes.sent/1048576).toFixed(1)} / {(uploadBytes.total/1048576).toFixed(1)} MB · {Math.min(100,Math.round(uploadBytes.sent/Math.max(1,uploadBytes.total)*100))}% transferred</p>
                  <p>{uploadBytes.sent < uploadBytes.total ? "Keep this page open until the upload finishes." : "The server is checking the recording before starting or reusing lesson analysis."}</p>
                  {uploadBytes.sent < uploadBytes.total && <button type="button" className="text-link" onClick={()=>abortUpload.current?.abort()}>Cancel upload</button>}
                </div>}
              </div>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void invite();
                }}
              >
                <input
                  aria-label="Access code"
                  type="password"
                  placeholder="Enter access code"
                  autoComplete="off"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3.5 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ink)]/50 transition-all"
                />
                <button
                  disabled={busy || !code}
                  className={`${secondary} w-full inline-flex items-center justify-center gap-2`}
                >
                  Activate access
                </button>
              </form>
            )}
            <p className="text-xs leading-relaxed text-[var(--muted-ink)] pt-2 border-t border-[var(--line)]">
              Recordings are automatically transcribed, analyzed for prerequisite concepts, and verified with source timestamps.
            </p>
          </aside>
        </div>
      </main>
    </Shell>
  );
}
