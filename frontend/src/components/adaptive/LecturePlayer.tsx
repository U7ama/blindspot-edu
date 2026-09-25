"use client";
import { useEffect, useRef, useState, RefObject } from "react";
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, Search, ListVideo, FileText, Headphones, LoaderCircle } from "lucide-react";
import { Evidence, Phase, timestamp } from "@/lib/adaptive";

export default function LecturePlayer({
  src,
  title,
  segments = [],
  phases = [],
  mediaRef,
  onPlay
}: {
  src: string;
  title: string;
  segments?: Evidence[];
  phases?: Phase[];
  mediaRef?: RefObject<HTMLVideoElement | null>;
  onPlay?: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const internalMediaRef = useRef<HTMLVideoElement>(null);
  const videoRef = mediaRef || internalMediaRef;

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [waiting, setWaiting] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"chapters" | "transcript">(phases.length > 0 ? "chapters" : "transcript");
  const [search, setSearch] = useState("");
  const [native, setNative] = useState(false);

  const chapters = phases.map(p => {
    const refs = segments.filter(s => p.evidence_ids.includes(s.id));
    return { id: p.id, title: p.title, start: refs.length ? Math.min(...refs.map(s => s.start)) : null };
  });
  const filtered = segments.filter(s => s.text.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  function seek(value: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(value, video.duration));
    setTime(video.currentTime);
  }

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) { video.pause(); return; }
    try { setError(""); await video.play(); } catch { setError("Playback could not start. Try again or use browser controls."); }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (frame.current?.requestFullscreen) await frame.current.requestFullscreen();
      else setError("Fullscreen is not available in this browser. You can use browser controls.");
    } catch { setError("Fullscreen is unavailable in this browser."); }
  }

  return <section id="lecture-player" className="lecture-player scroll-mt-24" aria-label="Lecture media player">
    <div ref={frame} className="player-frame" tabIndex={0} aria-label="Player keyboard controls: Space to play, arrows to seek, M to mute" onKeyDown={e => {
      if (e.target !== e.currentTarget) return;
      if (e.key === " " || e.key.toLowerCase() === "k") {e.preventDefault();void togglePlay();}
      if (e.key === "ArrowLeft") {e.preventDefault();seek(time - 10);}
      if (e.key === "ArrowRight") {e.preventDefault();seek(time + 10);}
      if (e.key.toLowerCase() === "m" && videoRef.current) videoRef.current.muted = !muted;
    }}>
      <div className="player-stage">
        <video ref={videoRef} src={src} preload="metadata" playsInline controls={native}
          aria-label={title} onClick={() => { if (!native) void togglePlay(); }}
          onLoadedMetadata={e => {setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0);setAudioOnly(e.currentTarget.videoWidth === 0);}}
          onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
          onPlay={() => {setPlaying(true);onPlay?.();}} onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)} onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)}
          onVolumeChange={e => {setVolume(e.currentTarget.volume);setMuted(e.currentTarget.muted);}}
          onError={() => {setWaiting(false);setError("This recording could not be played. Check its format or connection, then reload.");}} />
        {audioOnly && <div className="audio-art" aria-hidden="true"><Headphones size={42}/><span>Original lecture audio</span><div className={playing ? "audio-pulse active" : "audio-pulse"}>{Array.from({length: 22}, (_,i) => <i key={i} style={{height: 12 + (i*13)%40, animationDelay: i*.08+"s"}}/>)}</div></div>}
        {!native && !playing && !waiting && <button className="player-big-play" aria-label="Play recording" onClick={() => void togglePlay()}><Play size={28} fill="currentColor"/></button>}
        {waiting && <div className="player-buffer" role="status"><LoaderCircle className="animate-spin" size={23}/><span>Buffering recording…</span></div>}
        <span className="player-origin">ORIGINAL RECORDING</span>
      </div>
      {!native && <div className="player-controls">
        <label className="sr-only" htmlFor="lecture-seek">Seek recording</label>
        <input id="lecture-seek" className="player-seek" type="range" min={0} max={duration || 1} step={.1} value={Math.min(time, duration || 1)} disabled={!duration} aria-valuetext={timestamp(time) + " of " + timestamp(duration)} onChange={e => seek(Number(e.target.value))}/>
        <div className="player-control-row">
          <button aria-label={playing ? "Pause recording" : "Play recording"} title="Play / pause (Space)" onClick={() => void togglePlay()}>{playing ? <Pause size={19}/> : <Play size={19}/>}</button>
          <button aria-label="Back 10 seconds" title="Back 10 seconds" onClick={() => seek(time-10)}><RotateCcw size={17}/><small>10</small></button>
          <button aria-label="Forward 10 seconds" title="Forward 10 seconds" onClick={() => seek(time+10)}><RotateCw size={17}/><small>10</small></button>
          <span className="player-time">{timestamp(time)} <span>/ {timestamp(duration)}</span></span>
          <div className="player-volume"><button aria-label={muted ? "Unmute recording" : "Mute recording"} onClick={() => {if (videoRef.current) videoRef.current.muted = !muted;}}>{muted || volume === 0 ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button><input aria-label="Recording volume" type="range" min={0} max={1} step={.05} value={muted ? 0 : volume} onChange={e => {if (videoRef.current) {videoRef.current.volume=Number(e.target.value);videoRef.current.muted=false;}}}/></div>
          <select aria-label="Playback speed" value={speed} onChange={e => {setSpeed(e.target.value);if (videoRef.current) videoRef.current.playbackRate=Number(e.target.value);}}>{["0.5","0.75","1","1.25","1.5","1.75","2"].map(s => <option key={s} value={s}>{s}×</option>)}</select>
          <button aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={17}/> : <Maximize size={17}/>}</button>
        </div>
      </div>}
    </div>
    <div className="player-toolstrip"><div className="player-tabs" aria-label="Recording navigation">
      {phases.length > 0 && <button aria-pressed={tab==="chapters"} onClick={() => setTab("chapters")}><ListVideo size={15}/> Chapters <span>{phases.length}</span></button>}
      <button aria-pressed={tab==="transcript"} onClick={() => setTab("transcript")}><FileText size={15}/> Transcript {segments.length > 0 && <span>{segments.length}</span>}</button>
    </div><button className="player-native" onClick={() => setNative(!native)}>{native ? "Custom controls" : "Browser controls"}</button></div>
    {error && <p className="player-error" role="alert">{error}</p>}
    {tab === "chapters" && phases.length > 0 ? (
      <div className="player-chapters">
        {chapters.map((c,i) => (
          <button key={c.id} disabled={c.start === null} onClick={() => seek(c.start!)}>
            <span>{String(i+1).padStart(2,"0")}</span>
            <strong>{c.title}</strong>
            <time>{c.start === null ? "No source" : timestamp(c.start)}</time>
          </button>
        ))}
      </div>
    ) : (
      <div className="player-transcript">
        <label>
          <Search size={15}/>
          <input aria-label="Search transcript" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a word or concept in the recording…"/>
        </label>
        <p className="transcript-note">Machine transcript · wording may contain recognition errors</p>
        <div className="transcript-results">
          {filtered.length ? (
            filtered.map(s => (
              <button key={s.id} data-active={time>=s.start && time<s.end} onClick={() => seek(s.start)}>
                <time>{timestamp(s.start)}</time>
                <span>{s.text}</span>
              </button>
            ))
          ) : (
            <p className="p-3 text-xs text-[var(--muted-ink)]">
              {segments.length === 0 ? "No transcript segments recorded for this clip." : "No matching transcript segments."}
            </p>
          )}
        </div>
      </div>
    )}
  </section>;
}
