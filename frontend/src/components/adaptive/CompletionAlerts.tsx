"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, X } from "lucide-react";
import { request, ProcessingProgress } from "@/lib/adaptive";
export type Watch = { id: string; title: string; browser: boolean; voice: boolean };
const key = "blindspot-pending-alerts";
export function watches(): Watch[] {
  if (typeof window === "undefined") return [];
  try {
    const fromLocal = localStorage.getItem(key);
    const old = !fromLocal ? sessionStorage.getItem(key) : null;
    const parsed: unknown = JSON.parse(fromLocal || old || "[]");
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((w): w is Watch => w && typeof w.id === "string" &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(w.id) && typeof w.title === "string" &&
      typeof w.browser === "boolean" && typeof w.voice === "boolean").slice(-20);
    if (old) {
      localStorage.setItem(key, JSON.stringify(valid));
      sessionStorage.removeItem(key);
    }
    return valid;
  } catch { return []; }
}
export function watchRecording(watch: Watch) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify([...watches().filter(w => w.id !== watch.id), watch].slice(-20)));
  } catch {}
  window.dispatchEvent(new Event("blindspot-alerts"));
}
export function forgetRecording(id: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(watches().filter(w => w.id !== id)));
  } catch {}
  window.dispatchEvent(new Event("blindspot-alerts"));
}
export default function CompletionAlerts() {
  const [toast, setToast] = useState<{id:string; title:string; ready:boolean} | null>(null);
  useEffect(() => {
    let disposed = false, running = false;
    async function check() {
      if (running) return;
      running = true;
      try {
        for (const watch of watches()) {
          try {
            const result = await request<ProcessingProgress>(`/recordings/${watch.id}/progress`);
            if (disposed) return;
            if (!["ready","failed","insufficient_content"].includes(result.status)) continue;
            const notify = () => {
            if (disposed) return;
            // Re-read preferences in case they changed while the request was in flight.
            const current = watches().find(w => w.id === watch.id);
            if (!current) return;
            forgetRecording(watch.id);
            const ready = result.status === "ready";
            setToast({id: watch.id, title: watch.title, ready});
            if (current.browser && "Notification" in window && Notification.permission === "granted") {
              try {
                const notification = new Notification(ready ? "Your Blindspot lesson is ready" : "Your recording needs attention", {body: "Open Blindspot to view the result.", tag: "blindspot-"+watch.id, icon: "/icon-192.png"});
                notification.onclick = () => {window.focus();window.location.assign("/workspace/"+watch.id);notification.close();};
              } catch { /* In-app toast remains available on browsers without desktop notifications. */ }
            }
            if (current.voice && "speechSynthesis" in window) {
              try { window.speechSynthesis.speak(new SpeechSynthesisUtterance(ready ? "Your Blindspot lesson is ready." : "Your Blindspot recording needs attention.")); } catch {}
            }
            };
            // localStorage read/remove is not atomic across tabs. Only one tab may claim this alert.
            if ("locks" in navigator) {
              await navigator.locks.request("blindspot-notification-" + watch.id, notify);
            } else {
              // Older browsers: announce only from a visible tab, keeping background watches for later.
              if (document.visibilityState === "visible") notify();
            }
          } catch { /* Keep subscription and retry after transient network failure. */ }
        }
      } finally { running = false; }
    }
    void check();
    const timer = setInterval(() => void check(), 10000);
    window.addEventListener("blindspot-alerts", check);
    window.addEventListener("storage", check);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("blindspot-alerts", check);
      window.removeEventListener("storage", check);
    };
  }, []);
  return toast ? <div className="completion-toast" role="status">
    {toast.ready ? <CheckCircle2 size={22}/> : <Bell size={22}/>}
    <div><strong>{toast.ready ? "Your lesson is ready" : "Processing needs attention"}</strong><p>{toast.title}</p><Link href={"/workspace/"+toast.id}>Open recording →</Link></div>
    <button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={18}/></button>
  </div> : null;
}
