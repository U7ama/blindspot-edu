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
  invited: boolean;
  preferences: { voice: string; language: string };
  limits: { upload_bytes: number; duration_seconds: number };
};
let boot: Promise<Me> | undefined;
async function raw<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v2${path}`, {
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
export async function upload(file: File) {
  await me();
  return raw<Recording>(
    `/recordings?filename=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    },
  );
}
export function timestamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
