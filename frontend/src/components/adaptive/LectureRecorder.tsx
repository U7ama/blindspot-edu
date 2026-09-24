"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Video, Pause, Play, Square, Download, Trash2, Upload, LoaderCircle } from "lucide-react";
import { Me, timestamp } from "@/lib/adaptive";
import { beginDraft, deleteDraft, finishDraft, loadDraft, RecordingDraft, saveChunk } from "@/lib/recording-draft";
import { button, secondary } from "@/lib/ui-tokens";

type Status = "loading" | "idle" | "requesting" | "recording" | "paused" | "stopping" | "preview";

export default function LectureRecorder({ limits, busy, onSubmit, onCaptureChange }: {
  limits: Me["limits"];
  busy: boolean;
  onSubmit: (file: File) => Promise<boolean>;
  onCaptureChange: (active: boolean) => void;
}) {
  const [kind, setKind] = useState<"audio" | "video">("audio");
  const [status, setStatus] = useState<Status>("loading");
  const [consent, setConsent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [unsupported, setUnsupported] = useState("");
  const mounted = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const media = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const playback = useRef<HTMLMediaElement | null>(null);
  const chunks = useRef<Blob[]>([]);
  const size = useRef(0);
  const elapsed = useRef(0);
  const started = useRef(0);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const releaseLock = useRef<(() => void) | null>(null);
  const active = ["requesting", "recording", "paused", "stopping"].includes(status);
  const audioBitrate = 64000;
  const bitrate = audioBitrate + (kind === "video" ? 450000 : 0);
  const byteLimit = Math.min(limits.upload_bytes * 0.9, 64 * 1048576);
  const durationLimit = Math.max(0, Math.floor(Math.min(limits.duration_seconds - 2, kind === "video" ? 900 : 3600, byteLimit * 8 / bitrate * 0.9)));

  function recordingSeconds() {
    return elapsed.current + (recorder.current?.state === "recording" ? (performance.now() - started.current) / 1000 : 0);
  }
  function stop(reason?: string) {
    const current = recorder.current;
    if (!current || current.state === "inactive") return;
    elapsed.current = recordingSeconds();
    current.stop();
    media.current?.getTracks().forEach(track => track.stop());
    if (mounted.current) {
      setSeconds(elapsed.current);
      setStatus("stopping");
      if (reason) setNote(reason);
    }
  }
  function persist(operation: () => Promise<void>) {
    saving.current = saving.current.then(operation).catch(() => {
      if (mounted.current) {
        setError("Browser storage could not save this draft. Download your recording before leaving this page.");
        stop("Recording stopped to protect the audio already captured.");
      }
    });
  }

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    const lockRequest = new AbortController();
    let release = () => {};
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setUnsupported("Recording needs HTTPS or localhost and a browser with microphone recording support. You can still upload a file.");
    }
    async function restore() {
      try {
        const draft = await loadDraft();
        if (disposed) return;
        if (draft) {
          setKind(draft.metadata.kind);
          setFile(draft.file);
          setBytes(draft.file.size);
          setSeconds(draft.metadata.seconds);
          setStatus("preview");
          setNote(draft.metadata.complete ? "Saved recording restored. Preview it before processing." : "An interrupted recording was recovered. Its final seconds may be missing; preview or download it before processing.");
        } else setStatus("idle");
      } catch {
        if (!disposed) {
          setUnsupported("Browser storage is unavailable. Enable site storage to record safely, or upload a file instead.");
          setStatus("idle");
        }
      }
    }
    if (!navigator.locks) {
      setUnsupported("This browser cannot protect the recording draft across tabs. Use a current browser or upload a file instead.");
      setStatus("idle");
    } else {
      void navigator.locks.request("blindspot-recording-draft", { signal: lockRequest.signal }, async () => {
        if (disposed) return;
        await restore();
        if (!disposed) await new Promise<void>(resolve => { release = resolve; releaseLock.current = resolve; });
      }).catch(() => {
        if (!disposed) {
          setUnsupported("Recording could not initialize. Reopen this tab or upload a file instead.");
          setStatus("idle");
        }
      });
    }
    return () => {
      disposed = true;
      mounted.current = false;
      lockRequest.abort();
      if (recorder.current && recorder.current.state !== "inactive") stop();
      else void saving.current.finally(release);
      media.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  useEffect(() => {
    onCaptureChange(active);
    return () => onCaptureChange(false);
  }, [active, onCaptureChange]);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => {
      const value = recordingSeconds();
      setSeconds(value);
      if (value >= durationLimit) stop("The recording time limit was reached. Your recording is ready to review.");
    }, 250);
    return () => clearInterval(timer);
  }, [status, durationLimit]);
  useEffect(() => {
    if (!active && !file) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const leaving = () => { if (recorder.current?.state !== "inactive") stop(); };
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || link.hasAttribute("download") || link.getAttribute("target") === "_blank" || link.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm("Leave this recording? Capture will stop. Only chunks already saved in this browser can be recovered.")) {
        event.preventDefault();
        event.stopPropagation();
      } else stop();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", leaving);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", leaving);
      document.removeEventListener("click", navigate, true);
    };
  }, [active, file]);

  async function start() {
    if (!consent || status !== "idle" || unsupported || durationLimit < 1) return;
    setError(""); setNote(""); setStatus("requesting");
    let captured: MediaStream | null = null;
    try {
      const formats = kind === "video"
        ? ["video/webm;codecs=vp8,opus", "video/mp4", "video/webm"]
        : ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];
      const mimeType = formats.find(format => MediaRecorder.isTypeSupported(format));
      if (!mimeType) throw new Error("This browser has no compatible recording format. Try a current browser or upload a file.");
      captured = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: kind === "video" ? { width: { ideal: 640, max: 640 }, height: { ideal: 480, max: 480 }, frameRate: { ideal: 15, max: 15 }, facingMode: "environment" } : false,
      });
      if (!mounted.current) { captured.getTracks().forEach(track => track.stop()); return; }
      const current = new MediaRecorder(captured, { mimeType, audioBitsPerSecond: audioBitrate, ...(kind === "video" ? { videoBitsPerSecond: 450000 } : {}) });
      const actualType = current.mimeType || mimeType;
      const extension = actualType.includes("mp4") ? (kind === "video" ? "mp4" : "m4a") : actualType.includes("ogg") ? "ogg" : "webm";
      const draft: RecordingDraft = { name: `lecture-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, mimeType: actualType, kind, seconds: 0, complete: false };
      await beginDraft(draft);
      if (!mounted.current) { captured.getTracks().forEach(track => track.stop()); return; }
      chunks.current = []; size.current = 0; elapsed.current = 0;
      recorder.current = current; media.current = captured;
      current.ondataavailable = event => {
        if (!event.data.size) return;
        chunks.current.push(event.data);
        size.current += event.data.size;
        const update = { ...draft, seconds: recordingSeconds() };
        persist(() => saveChunk(event.data, update));
        if (mounted.current) setBytes(size.current);
        if (size.current >= byteLimit) stop("The recording size limit was reached. Review or download the captured recording.");
      };
      current.onstop = () => {
        captured?.getTracks().forEach(track => track.stop());
        const result = new File(chunks.current, draft.name, { type: actualType });
        chunks.current = [];
        const finished = { ...draft, seconds: elapsed.current, complete: true };
        persist(() => finishDraft(finished));
        void saving.current.then(() => {
          if (mounted.current) {
            setStream(null);
            setFile(result.size ? result : null);
            setStatus(result.size ? "preview" : "idle");
            if (!result.size) setError("No audio was captured. Check your microphone and try again.");
          } else releaseLock.current?.();
        });
      };
      current.onerror = () => {
        if (mounted.current) setError("Recording was interrupted by the browser. Review or download any captured audio before retrying.");
        stop();
      };
      captured.getTracks().forEach(track => {
        track.onended = () => stop("The microphone or camera disconnected. Review the recording captured so far.");
      });
      current.start(1000);
      started.current = performance.now();
      setSeconds(0); setBytes(0); setStream(captured); setStatus("recording");
    } catch (e) {
      captured?.getTracks().forEach(track => track.stop());
      if (!mounted.current) return;
      const name = e instanceof DOMException ? e.name : "";
      setError(name === "NotAllowedError" ? "Microphone or camera permission was denied. Allow access in your browser settings and try again."
        : name === "NotFoundError" ? "No suitable microphone or camera was found. Connect a device, or choose audio only."
        : name === "NotReadableError" ? "The microphone or camera is busy. Close other apps using it and try again."
        : name === "OverconstrainedError" ? "This camera cannot use the recording limits. Choose audio only or another camera."
        : e instanceof Error ? e.message : "Recording could not start.");
      setStatus("idle");
    }
  }
  function togglePause() {
    const current = recorder.current;
    if (current?.state === "recording") {
      elapsed.current = recordingSeconds();
      current.pause();
      setSeconds(elapsed.current); setStatus("paused");
    } else if (current?.state === "paused") {
      current.resume(); started.current = performance.now(); setStatus("recording");
    }
  }
  async function discard() {
    if (!window.confirm("Discard this recording and its saved browser draft? Download a copy first if you want to keep it.")) return;
    try {
      await saving.current;
      await deleteDraft();
      playback.current?.pause();
      setFile(null); setStatus("idle"); setSeconds(0); setBytes(0); setNote(""); setError(""); setConsent(false);
    } catch { setError("Could not remove the saved draft. Please try again."); }
  }
  async function submit() {
    if (!file || !consent || busy) return;
    playback.current?.pause();
    if (await onSubmit(file)) {
      await deleteDraft().catch(() => {});
      if (mounted.current) { setFile(null); setStatus("idle"); }
    }
  }

  return <div className="lecture-recorder">
    <h3>Record a lecture</h3>
    <p>Capture now, process after you stop. Nothing is uploaded until you choose “Process recording”.</p>
    {unsupported && <p role="alert" className="recorder-notice">{unsupported}</p>}
    {error && <p role="alert" className="recorder-notice">{error}</p>}
    {note && <p role="status" className="recorder-notice">{note}</p>}
    <div className="recorder-modes" aria-label="Capture type">
      <button type="button" aria-pressed={kind === "audio"} disabled={status !== "idle" || busy} onClick={() => setKind("audio")}><Mic size={16}/>Audio only</button>
      <button type="button" aria-pressed={kind === "video"} disabled={status !== "idle" || busy} onClick={() => setKind("video")}><Video size={16}/>Camera + audio</button>
    </div>
    <p>{kind === "audio" ? "Recommended: mono audio, target 64 kbps." : "Up to 480p at 15 fps, target 450 kbps video + 64 kbps audio. The lesson is based on spoken audio, not silent slides."} Browser encoding may vary.</p>
    <p>Auto-stop: {timestamp(durationLimit)} or {(byteLimit / 1048576).toFixed(1)} MB, whichever comes first. Leave a margin below the server limits.</p>
    {stream && kind === "video" && <video ref={video} className="recorder-preview" autoPlay muted playsInline aria-label="Live camera preview"/>}
    {active && <div className="recorder-status" role="status"><span className={status === "recording" ? "recording-dot" : ""}/><strong>{status === "recording" ? "Recording" : status === "paused" ? "Paused" : status === "requesting" ? "Waiting for device permission…" : "Saving recording…"}</strong></div>}
    {(active || file) && <p className="recorder-stats"><span>{timestamp(Math.floor(seconds))}</span><span>{(bytes / 1048576).toFixed(1)} MB</span></p>}
    {status === "loading" && <p role="status">Checking saved recording access. If another recording tab is open, finish or close it to continue here.</p>}
    {!active && <label className="permission-check"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)}/>I have the lecturer’s permission and any required participant consent to record and process this lecture.</label>}
    {status === "idle" && <button type="button" className={`${button} w-full`} disabled={!consent || !!unsupported || durationLimit < 1 || busy} onClick={() => void start()}><Mic size={16}/>Start recording</button>}
    {(status === "recording" || status === "paused") && <div className="recorder-controls">
      <button type="button" className={secondary} onClick={togglePause}>{status === "paused" ? <Play size={16}/> : <Pause size={16}/>}{status === "paused" ? "Resume" : "Pause"}</button>
      <button type="button" className={button} onClick={() => stop()}><Square size={16}/>Stop recording</button>
    </div>}
    {status === "preview" && file && <>
      {kind === "video" ? <video ref={node => { playback.current = node; }} className="recorder-preview" src={preview} controls playsInline aria-label="Recorded lecture preview"/> : <audio ref={node => { playback.current = node; }} src={preview} controls aria-label="Recorded lecture preview"/>}
      {file.size > limits.upload_bytes && <p role="alert">This recording exceeded the upload limit. Download it and trim it before uploading.</p>}
      <div className="recorder-controls"><a className={secondary} href={preview} download={file.name}><Download size={16}/>Download copy</a><button type="button" className={secondary} disabled={busy} onClick={() => void discard()}><Trash2 size={16}/>Discard</button></div>
      <button type="button" className={`${button} w-full`} disabled={busy || !consent || file.size > limits.upload_bytes} onClick={() => void submit()}>{busy ? <LoaderCircle size={16} className="animate-spin"/> : <Upload size={16}/>}{busy ? "Uploading…" : "Process recording"}</button>
    </>}
    <p className="recorder-privacy">Keep this tab open while recording; mobile sleep may interrupt capture. Chunks are saved in this browser for recovery, but the final seconds can be lost on a crash. Download a copy before leaving. Drafts stay on this device until uploaded or discarded; clearing site data removes them.</p>
  </div>;
}
