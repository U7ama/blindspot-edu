export type Evidence = { id: string; start: number; end: number; text: string };
export type Question = {
  id: string;
  concept_id: string;
  phase_id: string;
  purpose: string;
  question: string;
  options: string[];
};
export type Concept = {
  id: string;
  name: string;
  coverage: string;
  reason: string;
  evidence_ids: string[];
  explanation_evidence_ids: string[];
  remediation: null | {
    explanation: string;
    worked_example: string;
    simpler_explanation: string;
    steps: string[];
    diagnostic: Question;
    reassessment: Question;
    retry: Question;
  };
};
export type Phase = {
  id: string;
  title: string;
  teaching_script: string;
  evidence_ids: string[];
  prerequisite_ids: string[];
  quiz: Question | null;
};
export type Lesson = {
  version: number;
  segments: Evidence[];
  concepts: Concept[];
  phases: Phase[];
  validation: string;
};
export type Recording = {
  id: string;
  title: string;
  status: string;
  duration: number;
  public: boolean;
  error: string | null;
  document?: Lesson | null;
  segments?: Evidence[];
};
export type Active = {
  mode: string;
  question?: Question;
  question_id?: string;
  concept_id?: string;
  return_phase_id: string;
  retry?: boolean;
  correct?: boolean;
  explanation?: string;
  failed_reassessment?: boolean;
};
export type Session = {
  id: string;
  phase_id: string;
  progress: Record<string, string>;
  active: Active | null;
  ended: boolean;
  revision: number;
};
export type Me = {
  email_notifications_enabled?: boolean;
  invited: boolean;
  preferences: { voice: string; language: string };
  limits: { upload_bytes: number; duration_seconds: number };
};
let boot: Promise<Me> | undefined;
async function raw<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ detail: "Request failed" }));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : `Request failed (${response.status})`,
    );
  }
  return response.json();
}
export function me() {
  if (!boot)
    boot = raw<Me>("/me").catch((e) => {
      boot = undefined;
      throw e;
    });
  return boot;
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  await me();
  return raw<T>(
    path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}
export async function upload(file: File, onProgress?: (sent: number, total: number) => void, signal?: AbortSignal) {
  await me();
  return new Promise<Recording>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    xhr.open("POST", `/api/v1/recordings?filename=${encodeURIComponent(file.name)}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = e => onProgress?.(e.loaded, e.lengthComputable ? e.total : file.size);
    xhr.onload = () => {
      cleanup();
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(typeof data.detail === "string" ? data.detail : "Upload failed"));
      } catch { reject(new Error("The server did not return a valid upload response.")); }
    };
    xhr.onerror = () => {cleanup();reject(new Error("Connection lost during upload. Please try again."));};
    xhr.onabort = () => {cleanup();reject(new Error("Upload cancelled."));};
    signal?.addEventListener("abort", abort, {once: true});
    if (signal?.aborted) {cleanup();reject(new Error("Upload cancelled."));return;}
    xhr.send(file);
  });
}
export function timestamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export type ProcessingProgress = {
  status: string; stage: string; detail: string; current: number | null; total: number | null;
  unit: string | null; updated_at: number; created_at: number; worker_active: boolean;
  history: {stage: string; detail: string; at: number}[]; email_status: string | null;
  last_progress: {stage: string; detail: string; current: number | null; total: number | null; unit: string | null} | null;
};
