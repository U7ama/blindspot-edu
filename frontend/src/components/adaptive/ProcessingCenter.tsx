"use client";
import { useEffect, useState } from "react";
import { AudioLines, BrainCircuit, Check, CheckCheck, ClipboardList, Download, FileCheck2, LoaderCircle, Bell, Volume2, Mail, Clock3, AlertCircle, RotateCcw } from "lucide-react";
import { Recording, Me, ProcessingProgress, request, timestamp } from "@/lib/adaptive";
import { watches, watchRecording } from "./CompletionAlerts";

const stages = [
  {id:"retrieving", label:"Prepare recording", description:"Retrieve and validate the audio or video.", icon:Download},
  {id:"transcribing", label:"Transcribe the lecture", description:"Turn speech into timestamped source segments.", icon:AudioLines},
  {id:"concepts", label:"Identify what was taught", description:"Extract concepts and their supporting excerpts.", icon:BrainCircuit},
  {id:"prerequisites", label:"Check the missing steps", description:"Look across the whole lecture for assumed knowledge.", icon:ClipboardList},
  {id:"planning", label:"Build your learning path", description:"Organize the material and prepare relevant questions.", icon:FileCheck2},
  {id:"verification", label:"Verify and save", description:"Review evidence, explanations and reassessments.", icon:CheckCheck},
];
const replaySeconds = 20;
const replayDescriptions: Record<string, string> = {
  retrieving: "This exact recording was matched to an existing verified lecture.",
  transcribing: "Its timestamped transcript was reused; speech recognition was not rerun.",
  concepts: "Previously extracted concepts and source excerpts were reused.",
  prerequisites: "Previously verified prerequisite classifications were reused.",
  planning: "Existing lesson phases and questions were linked to this copy.",
  verification: "Source references were validated before the saved lesson was made ready.",
};
const reuseStages = [
  {id:"retrieving", label:"Compare recording", description:"Check the actual media bytes against accessible verified lectures.", icon:Download},
  {id:"reuse_verified", label:"Reuse verified lesson", description:"Copy the existing transcript and learning plan; no transcription or AI generation runs.", icon:FileCheck2},
  {id:"publishing", label:"Save your copy", description:"Validate source references and save this recording's lesson.", icon:CheckCheck},
];
export default function ProcessingCenter({record, user, onRetry, retrying = false, replayVerified = false, onOpenVerified}: {record: Recording; user: Me | null; onRetry?: () => Promise<void>; retrying?: boolean; replayVerified?: boolean; onOpenVerified?: () => void}) {
  const failed = record.status === "failed";
  const queued = record.status === "queued";
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [replayElapsed, setReplayElapsed] = useState(0);
  useEffect(() => {
    if (!replayVerified) return;
    const started = Date.now();
    const timer = setInterval(() => setReplayElapsed(Math.min(replaySeconds, (Date.now() - started) / 1000)), 100);
    return () => clearInterval(timer);
  }, [replayVerified]);
  useEffect(() => {
    if (replayVerified && replayElapsed >= replaySeconds) onOpenVerified?.();
  }, [replayVerified, replayElapsed, onOpenVerified]);
  const [connection, setConnection] = useState("");
  const [now, setNow] = useState(Date.now()/1000);
  const [browser, setBrowser] = useState(false);
  const [voice, setVoice] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    function syncAlerts() {
      const saved = watches().find(w => w.id === record.id);
      setBrowser(saved?.browser || false);
      setVoice(saved?.voice || false);
    }
    syncAlerts();
    window.addEventListener("storage", syncAlerts);
    window.addEventListener("blindspot-alerts", syncAlerts);

    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await request<ProcessingProgress>(`/recordings/${record.id}/progress`);
        if (!disposed) {setProgress(data);setEmailStatus(data.email_status);setConnection("");}
      } catch { if (!disposed) setConnection(failed ? "Could not load the saved progress. Retry will still use any available checkpoints." : "Reconnecting to processing updates. Your saved job continues on the server."); }
      if (!disposed && !failed) timer = setTimeout(poll, 3000);
    }
    void poll();
    const clock = failed ? undefined : setInterval(() => setNow(Date.now()/1000),1000);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(clock);
      window.removeEventListener("storage", syncAlerts);
      window.removeEventListener("blindspot-alerts", syncAlerts);
    };
  }, [record.id, record.title, record.status, failed]);
  function saveAlerts(b: boolean, v: boolean) {
    setBrowser(b);setVoice(v);
    watchRecording({id:record.id,title:record.title,browser:b,voice:v});
  }
  async function browserAlert() {
    if (browser) {saveAlerts(false,voice);return;}
    if (!("Notification" in window) || !window.isSecureContext) {setAlertMessage("Desktop alerts are unavailable here. In-app alerts still work.");return;}
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {saveAlerts(true,voice);setAlertMessage("Desktop alert enabled for this recording.");}
      else setAlertMessage("Permission was not granted. You can enable notifications in browser settings.");
    } catch {setAlertMessage("This browser could not enable desktop notifications. In-app alerts remain available.");}
  }
  const lastProgress = failed || queued ? progress?.last_progress : progress;
  const rawStage = lastProgress?.stage || "queued";
  const reused = !!progress?.history?.some(event => event.stage === "reuse_verified");
  const visibleStages = replayVerified ? stages : reused ? reuseStages : stages;
  const normalized = reused
    ? rawStage === "transcript_saved" ? "reuse_verified" : rawStage
    : ["downloading","validating"].includes(rawStage) ? "retrieving" : rawStage === "transcript_saved" ? "concepts" : rawStage === "publishing" ? "verification" : rawStage;
  const active = replayVerified ? Math.min(stages.length - 1, Math.floor(replayElapsed / replaySeconds * stages.length)) : visibleStages.findIndex(s => s.id === normalized);
  const elapsed = replayVerified ? Math.floor(replayElapsed) : progress ? Math.max(0, Math.floor((failed ? progress.updated_at : now)-progress.created_at)) : 0;
  const currentLabel = lastProgress?.unit === "seconds" ? timestamp(lastProgress.current || 0) : lastProgress?.unit === "bytes" ? ((lastProgress.current || 0)/1048576).toFixed(1)+" MB" : String(lastProgress?.current || 0);
  const totalLabel = lastProgress?.unit === "seconds" ? timestamp(lastProgress.total || 0) : lastProgress?.unit === "bytes" ? ((lastProgress.total || 0)/1048576).toFixed(1)+" MB" : String(lastProgress?.total || 0);
  return <div className={`processing-layout${failed ? " processing-layout-failed" : ""}`}>
    <section className="processing-main">
      <div className="processing-heading">
        <div className="processing-orbit">{failed ? <AlertCircle size={28}/> : <BrainCircuit size={28}/>}</div>
        <div>
          <p className="eyebrow">{replayVerified ? "VERIFIED LESSON REVIEW" : failed ? "CONTINUE FROM SAVED CHECKPOINTS" : "YOUR RECORDING IS IN GOOD HANDS"}</p>
          <h2>{failed ? "Processing needs attention" : replayVerified ? "Your lesson is ready" : "Building your learning experience"}</h2>
          <p>{replayVerified ? "This lecture was already uploaded. The next 20 seconds review its completed steps. Your saved transcript and lesson are ready to open now." : failed ? "Review what completed and what remains before retrying." : "Long recordings can take a while. Here’s what is actually happening."}</p>
        </div>
      </div>
      <div className="processing-live" role={failed ? "alert" : "status"}>
        {failed ? <AlertCircle size={18}/> : replayVerified ? <CheckCheck size={18}/> : <LoaderCircle size={18} className="animate-spin"/>}
        <div>
          <strong>{replayVerified ? `Reviewing completed step: ${visibleStages[active]?.label || "Verify and save"}` : failed ? record.error || "Processing stopped before your lesson was ready." : queued ? "Waiting for the processing worker." : progress?.detail || "Waiting for the processing worker."}</strong>
          <p>{replayVerified ? "Your verified lesson is already ready to open." : connection || (failed
            ? active >= 0 ? `Stopped during: ${visibleStages[active].label}.` : progress ? "The last completed step was not recorded; no steps are marked done." : "Loading the last recorded progress…"
            : queued && active >= 0 ? "Waiting to retry. Previous progress is shown below while saved work is restored."
            : progress && !progress.worker_active && record.status === "processing" ? "Waiting for the worker to reconnect. Saved checkpoints are preserved."
            : "This stage updates when real work completes. No estimated finish time yet.")}</p>
        </div>
      </div>
      {replayVerified && <div className="stage-progress"><div><span>Verified lesson pipeline preview</span><span>{Math.min(replaySeconds, Math.floor(replayElapsed))} / {replaySeconds} seconds</span></div><progress max={replaySeconds} value={replayElapsed} aria-label="Verified lesson pipeline preview"/></div>}
      {!replayVerified && lastProgress?.current != null && <div className="stage-progress"><div><span>{lastProgress.unit === "seconds" ? "Audio timestamp reached" : lastProgress.unit === "bytes" ? "Downloaded" : failed || queued ? "Completed before interruption" : "Completed in this stage"}</span><span>{currentLabel}{lastProgress.total ? " / "+totalLabel : ""}{lastProgress.unit && !["seconds","bytes"].includes(lastProgress.unit) ? " "+lastProgress.unit : ""}</span></div>{!!lastProgress.total && <progress max={lastProgress.total} value={Math.min(lastProgress.current, lastProgress.total)} aria-label="Current stage progress"/>}</div>}
      {failed && active >= 0 && <p className="processing-summary">{active} of {visibleStages.length} stages completed · {visibleStages.length-active} remaining, including the interrupted stage</p>}
      <ol className="processing-steps" aria-label="Processing stages">{visibleStages.map((s,i) => {
        const Icon=s.icon, done=i<active, current=i===active;
        return <li key={s.id} data-state={done ? "done" : current ? failed ? "failed" : "active" : "pending"} aria-current={current ? "step" : undefined}><span>{done ? <Check size={18}/> : failed && current ? <AlertCircle size={18}/> : <Icon size={18}/>}</span><div><strong>{s.label}</strong><p>{replayVerified ? replayDescriptions[s.id] : s.description}</p></div><small>{replayVerified ? done ? "Reviewed" : current ? "Reviewing" : "Next" : done ? "Done" : current ? failed ? "Interrupted" : queued ? "Waiting to retry" : "Working" : failed ? active >= 0 ? "Remaining" : "Not confirmed" : "Next"}</small></li>;
      })}</ol>
      <div className="processing-resume">
        <strong>{replayVerified ? "Your lesson is ready" : failed ? "Retry from saved progress" : "Safe to retry if a step fails"}</strong>
        <p>{replayVerified ? "You can open the lesson now or finish reviewing the completed steps." : "Retry resumes from saved checkpoints, reusing the saved transcript and completed analysis where available. An interrupted download or unfinished step may need to run again."}</p>
        {replayVerified && <button className="ui-button ui-primary" onClick={onOpenVerified}><CheckCheck size={16}/>Open lesson now</button>}
        {failed && onRetry && <button className="ui-button ui-primary" disabled={retrying} onClick={() => void onRetry()}><RotateCcw size={16}/>{retrying ? "Retrying…" : "Retry processing"}</button>}
      </div>
      <div className="processing-footer"><Clock3 size={14}/><span>{replayVerified ? `${elapsed} seconds into verified lesson preview` : `${timestamp(elapsed)} ${failed ? "until the last update" : "since submission"}`}</span><span>{replayVerified ? "Lesson ready" : "Checkpoints survive refreshes"}</span></div>
      {progress?.history?.length ? <details className="processing-log"><summary>{replayVerified ? "View actual reuse activity" : "View processing activity"}</summary><ol>{progress.history.map((event,i) => <li key={i}><time>{new Date(event.at*1000).toLocaleTimeString()}</time><span>{event.detail}</span></li>)}</ol></details> : null}
    </section>
    {!failed && <aside className="processing-alerts"><Bell size={23}/><h3>We’ll let you know</h3><p>{replayVerified ? "The lesson is already ready. Completion alerts may arrive before this review ends." : "Keep this app tab open. You can visit another page in Blindspot while processing continues."}</p>
      <button className="alert-toggle" aria-pressed={browser} onClick={() => void browserAlert()}><Bell size={17}/><span>Desktop notification</span><b>{browser ? "On" : "Off"}</b></button>
      <button className="alert-toggle" aria-pressed={voice} onClick={() => {
        if (!("speechSynthesis" in window)) {setAlertMessage("Spoken alerts are not supported by this browser.");return;}
        saveAlerts(browser,!voice);
        if (!voice) {try {window.speechSynthesis.speak(new SpeechSynthesisUtterance("Spoken completion alert enabled."));} catch {}}
      }}><Volume2 size={17}/><span>Spoken alert</span><b>{voice ? "On" : "Off"}</b></button>
      {alertMessage && <p role="status">{alertMessage}</p>}
      <p className="notification-caveat">Browser sleep, notification permissions or sound settings can delay alerts. Closing this tab stops browser and voice alerts.</p>
      <div className="email-alert"><h4><Mail size={17}/> Email me when ready</h4><p>Email works even after you close the app.</p>
        {!user?.email_notifications_enabled ? <p className="setup-note">Email delivery needs a configured sender. Browser and in-app alerts are available now.</p> :
        emailStatus ? <div><p role="status">{emailStatus === "pending" ? "Email alert saved for this recording." : emailStatus === "sent" ? "Email notification sent." : emailStatus === "failed" ? "Email delivery failed. Your lesson is still available." : "Sending notification…"}</p>{emailStatus === "pending" && <button disabled={saving} className="text-link" onClick={async () => {setSaving(true);try {await request(`/recordings/${record.id}/notification`,{email:null});setEmailStatus(null);} catch(e) {setAlertMessage((e as Error).message);} finally {setSaving(false);}}}>Cancel email alert</button>}</div> :
        <form onSubmit={async e => {e.preventDefault();setSaving(true);try {await request(`/recordings/${record.id}/notification`,{email});setEmailStatus("pending");setEmail("");} catch(e) {setAlertMessage((e as Error).message);} finally {setSaving(false);}}}><label className="sr-only" htmlFor="completion-email">Your email address</label><input id="completion-email" type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><button className="ui-button ui-primary" disabled={saving}>{saving ? "Saving…" : "Email me once"}</button><p>Use your own address. We’ll send one completion alert, without lecture content. Open the private lesson in the same browser used to upload it.</p></form>}
      </div>
    </aside>}
  </div>;
}
