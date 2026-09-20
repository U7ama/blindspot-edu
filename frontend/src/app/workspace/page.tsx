"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell, { button, secondary, panel } from "@/components/adaptive/Shell";
import { me, request, upload, Recording, Me, timestamp } from "@/lib/adaptive";
export default function Library() {
  const router = useRouter();
  const [items, setItems] = useState<Recording[] | null>(null);
  const [user, setUser] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
      if (user && file.size > user.limits.upload_bytes)
        throw new Error("Recording exceeds the upload size limit");
      const record = await upload(file);
      router.push(`/workspace/${record.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <main className="mx-auto max-w-6xl px-5 py-12">
        <p className="text-xs font-mono uppercase tracking-widest text-rose-300">
          Learning workspace
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Start with a lecture.
        </h1>
        <p className="mt-3 text-stone-400">
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
        <div className="mt-9 grid gap-6 md:grid-cols-[1fr_320px]">
          <section className="space-y-4">
            {items === null ? (
              <p aria-live="polite">Loading lectures…</p>
            ) : items.length === 0 ? (
              <div className={panel}>
                <h2 className="text-lg">No lecture is available yet</h2>
                <p className="mt-2 text-sm leading-6 text-stone-400">
                  An administrator must publish a permission-approved sample, or
                  an invited participant can upload a recording. No sample
                  content is invented automatically.
                </p>
              </div>
            ) : (
              items.map((r) => (
                <Link
                  key={r.id}
                  href={`/workspace/${r.id}`}
                  className={`${panel} block hover:border-rose-800`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-rose-300">
                      {r.public ? "PUBLIC SAMPLE" : "YOUR RECORDING"}
                    </span>
                    <span className="text-xs text-stone-400">{r.status}</span>
                  </div>
                  <h2 className="mt-4 text-xl font-medium break-words">
                    {r.title}
                  </h2>
                  <p className="mt-3 text-sm text-stone-400">
                    {timestamp(r.duration)} ·{" "}
                    {r.status === "ready"
                      ? "Open your lesson →"
                      : "View processing status →"}
                  </p>
                </Link>
              ))
            )}
          </section>
          <aside className={`${panel} h-fit`}>
            <h2 className="text-lg font-medium">Pilot access</h2>
            {user?.invited ? (
              <>
                <p className="mt-3 text-sm leading-6 text-stone-400">
                  Upload a recording you have permission to process. Maximum{" "}
                  {Math.round(user.limits.upload_bytes / 1048576)} MB and{" "}
                  {user.limits.duration_seconds / 60} minutes.
                </p>
                <label className={`${button} mt-5 w-full cursor-pointer`}>
                  {busy ? "Uploading…" : "Choose recording"}
                  <input
                    aria-label="Upload a lecture recording"
                    className="sr-only"
                    type="file"
                    accept=".wav,.mp3,.m4a,.mp4,.flac,.ogg,.aac,.webm"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void ingest(f);
                    }}
                  />
                </label>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-stone-400">
                  Public samples are open to everyone. Enter your invitation to
                  upload your own course recordings.
                </p>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void invite();
                  }}
                >
                  <input
                    aria-label="Pilot invitation code"
                    type="password"
                    autoComplete="off"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/30 p-3 text-sm"
                  />
                  <button
                    disabled={busy || !code}
                    className={`${secondary} w-full`}
                  >
                    Activate invitation
                  </button>
                </form>
              </>
            )}
            <p className="mt-5 text-xs leading-5 text-stone-500">
              This pilot is designed around one course and a small group.
              Processing can take several minutes.
            </p>
          </aside>
        </div>
      </main>
    </Shell>
  );
}
