/**
 * frontend/lib/api.ts
 *
 * Fully typed fetch client for Blindspot Edu backend (FastAPI).
 * Communicates with http://localhost:8000 (or NEXT_PUBLIC_API_URL).
 * Derived strictly from backend/schemas.py and backend/api/lectures.py.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
  "http://localhost:8000";

// ============================================================================
// Data Contracts & Schemas (mirroring backend/schemas.py)
// ============================================================================

export type LectureStatus = "processing" | "ready" | "failed";

export interface TimeRange {
  start: number;
  end: number;
}

export interface Lecture {
  id?: number;
  filename: string;
  audio_url?: string | null;
  status: LectureStatus;
  uploaded_at: string;
}

export interface TranscriptSegment {
  id?: number;
  lecture_id?: number;
  start: number;
  end: number;
  text: string;
  speaker?: string | null;
  embedding?: number[] | null;
}

export interface Phase {
  order: number;
  title: string;
  teaching_script: string;
  source_timestamps: TimeRange[];
  prerequisite_note?: string | null;
  difficulty?: string | null;
}

export interface LearningPlan {
  id?: number;
  lecture_id: number;
  phases: Phase[];
}

export interface GapConcept {
  id?: number;
  lecture_id: number;
  name: string;
  why_its_a_gap: string;
  related_phase_order?: number | null;
  source_timestamp?: TimeRange | null;
}

export interface QuizItem {
  id?: number;
  lecture_id: number;
  question: string;
  options: string[];
  correct_answer: string;
  source_timestamp?: TimeRange | null;
}

export interface QuizSubmission {
  quiz_item_id: number;
  session_id: string;
  selected_answer: string;
}

export interface QuizResult {
  quiz_item_id: number;
  session_id: string;
  selected_answer: string;
  correct: boolean;
}

export interface GraphNode {
  id: string;
  lecture_id: number;
  label: string;
  is_gap: boolean;
  source_timestamp?: TimeRange | null;
}

export interface GraphEdge {
  lecture_id: number;
  source: string;
  target: string;
  relation: string;
}

export type SessionEventType =
  | "phase_started"
  | "speaking"
  | "awaiting_command"
  | "jumped_to_timestamp"
  | "quiz_started"
  | "session_ended";

export interface SessionEvent {
  type: SessionEventType;
  lecture_id: number;
  session_id: string;
  phase_order?: number | null;
  payload?: Record<string, unknown> | null;
  emitted_at: string;
}

export interface SessionCommand {
  session_id: string;
  command: "next" | "explain_again" | "show_me" | "quiz_me" | string;
  argument?: string | null;
}

export interface PipelineResult {
  lecture_id: number;
  plan: LearningPlan;
  gaps: GapConcept[];
  quizzes: QuizItem[];
  graph_nodes: GraphNode[];
  graph_edges: GraphEdge[];
  transcript_with_embeddings: TranscriptSegment[];
}

export interface HealthStatus {
  status: string;
}

// ============================================================================
// Custom API Error
// ============================================================================

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// ============================================================================
// Core Fetch Wrapper
// ============================================================================

async function fetchJson<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const defaultHeaders: HeadersInit = {
    Accept: "application/json",
  };

  if (!(options.body instanceof FormData)) {
    (defaultHeaders as Record<string, string>)["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    let data: unknown = null;
    try {
      data = await response.json();
      if (data && typeof data === "object" && "detail" in data) {
        errorDetail = String((data as { detail: unknown }).detail);
      }
    } catch {
      // Non-JSON response
    }
    throw new ApiError(
      `API Error (${response.status}): ${errorDetail}`,
      response.status,
      data
    );
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Upload an audio or video file to POST /api/lectures.
 * Returns immediately with status="processing".
 */
export async function uploadLecture(file: File): Promise<Lecture> {
  const formData = new FormData();
  formData.append("file", file);

  return fetchJson<Lecture>("/api/lectures", {
    method: "POST",
    body: formData,
  });
}

/**
 * Get all lectures from GET /api/lectures.
 */
export async function listLectures(): Promise<Lecture[]> {
  return fetchJson<Lecture[]>("/api/lectures", {
    method: "GET",
    cache: "no-store",
  });
}

/**
 * Get a single lecture by ID from GET /api/lectures/{id}.
 */
export async function getLecture(lectureId: number | string): Promise<Lecture> {
  return fetchJson<Lecture>(`/api/lectures/${lectureId}`, {
    method: "GET",
    cache: "no-store",
  });
}

/**
 * Get transcript segments for a lecture from GET /api/lectures/{id}/transcripts.
 */
export async function getTranscripts(
  lectureId: number | string
): Promise<TranscriptSegment[]> {
  return fetchJson<TranscriptSegment[]>(`/api/lectures/${lectureId}/transcripts`, {
    method: "GET",
    cache: "no-store",
  });
}

/**
 * Get the AI-generated learning plan for a lecture from GET /api/lectures/{id}/plan.
 */
export async function getLearningPlan(
  lectureId: number | string
): Promise<LearningPlan | null> {
  return fetchJson<LearningPlan | null>(`/api/lectures/${lectureId}/plan`, {
    method: "GET",
    cache: "no-store",
  });
}

/**
 * Get the quiz questions for a lecture from GET /api/lectures/{id}/quiz.
 */
export async function getQuizzes(
  lectureId: number | string
): Promise<QuizItem[]> {
  return fetchJson<QuizItem[]>(`/api/lectures/${lectureId}/quiz`, {
    method: "GET",
    cache: "no-store",
  });
}

/**
 * Get under-explained gap concepts for a lecture from GET /api/lectures/{id}/gaps.
 */
export async function getGaps(
  lectureId: number | string
): Promise<GapConcept[]> {
  return fetchJson<GapConcept[]>(`/api/lectures/${lectureId}/gaps`, {
    method: "GET",
    cache: "no-store",
  });
}

/**
 * Get knowledge graph nodes and edges from GET /api/lectures/{id}/graph.
 */
export async function getGraph(
  lectureId: number | string
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  return fetchJson<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
    `/api/lectures/${lectureId}/graph`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
}

/**
 * Starts/initializes a live teaching session on the backend orchestrator.
 */
export async function startSession(
  lectureId: number | string,
  sessionId?: string,
  voice?: string,
  textLanguage?: string
): Promise<SessionEvent[]> {
  const params = new URLSearchParams();
  if (sessionId) params.set("session_id", sessionId);
  if (voice) params.set("voice", voice);
  if (textLanguage) params.set("text_language", textLanguage);
  const query = params.toString() ? `?${params.toString()}` : "";
  return fetchJson<SessionEvent[]>(`/api/lectures/${lectureId}/session${query}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * Dispatches a command to the active teaching session state machine.
 */
export async function sendCommand(
  lectureId: number | string,
  sessionId: string,
  command: string,
  argument?: string
): Promise<SessionEvent[]> {
  return fetchJson<SessionEvent[]>(
    `/api/lectures/${lectureId}/session/${sessionId}/command`,
    {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        command,
        argument: argument || null,
      }),
    }
  );
}

/**
 * Resolves a local or backend audio path into a playable browser URL.
 */
export function resolveAudioUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://") || pathOrUrl.startsWith("blob:")) {
    if (pathOrUrl.includes("localhost:8000") && !API_BASE_URL.includes("localhost:8000")) {
      return pathOrUrl.replace(/http:\/\/localhost:8000/g, API_BASE_URL);
    }
    return pathOrUrl;
  }
  // If it's a relative storage path or local file path
  const normalized = pathOrUrl.replace(/\\/g, "/");
  const match = normalized.match(/(?:storage_data|storage)\/(.+)$/);
  if (match) {
    return `${API_BASE_URL}/storage/${match[1]}`;
  }
  if (normalized.startsWith("/storage/")) {
    return `${API_BASE_URL}${normalized}`;
  }
  return pathOrUrl;
}

export interface VoiceOption {
  id: string;
  name: string;
  language: string;
  gender: string;
  flag?: string;
}

export interface UserPreferences {
  voice: string;
  text_language: string;
  model: string;
}

/**
 * Get the direct streaming URL for the original uploaded lecture recording.
 */
export function getLectureStreamUrl(lectureId: number | string): string {
  return `${API_BASE_URL}/api/lectures/${lectureId}/stream`;
}

/**
 * Get the list of available TTS voices & languages from GET /api/session/voices.
 */
export async function getVoices(): Promise<VoiceOption[]> {
  return fetchJson<VoiceOption[]>("/api/session/voices", {
    method: "GET",
    cache: "no-store",
  });
}

/**
 * Get the active session preferences (voice, text reading language, and AI model).
 */
export async function getPreferences(): Promise<UserPreferences> {
  return fetchJson<UserPreferences>("/api/session/preferences", {
    method: "GET",
    cache: "no-store",
  }).catch(() => {
    return {
      voice:
        typeof window !== "undefined"
          ? localStorage.getItem("blindspot_selected_voice") || "en-US-ChristopherNeural"
          : "en-US-ChristopherNeural",
      text_language:
        typeof window !== "undefined"
          ? localStorage.getItem("blindspot_selected_text_language") || "English"
          : "English",
      model:
        typeof window !== "undefined"
          ? localStorage.getItem("blindspot_selected_model") || "openai/gpt-oss-120b"
          : "openai/gpt-oss-120b",
    };
  });
}

/**
 * Update the active session preferences (voice, text reading language, and AI model).
 */
export async function setPreferences(
  prefs: Partial<UserPreferences>
): Promise<UserPreferences> {
  if (typeof window !== "undefined") {
    if (prefs.voice) localStorage.setItem("blindspot_selected_voice", prefs.voice);
    if (prefs.text_language) localStorage.setItem("blindspot_selected_text_language", prefs.text_language);
    if (prefs.model) localStorage.setItem("blindspot_selected_model", prefs.model);
    window.dispatchEvent(new CustomEvent("blindspot_preferences_changed", { detail: prefs }));
  }

  return fetchJson<UserPreferences>("/api/session/preferences", {
    method: "POST",
    body: JSON.stringify(prefs),
  }).catch(() => {
    return {
      voice: prefs.voice || "en-US-ChristopherNeural",
      text_language: prefs.text_language || "English",
      model: prefs.model || "openai/gpt-oss-120b",
    };
  });
}

export interface FlowStep {
  step_number: number;
  title: string;
  detail: string;
}

export interface QAResponse {
  question: string;
  phase_order?: number | null;
  explanation: string;
  key_takeaway?: string | null;
  analogy?: string | null;
  flow_steps?: FlowStep[] | null;
  visual_intent?: boolean | null;
  whiteboard_topic?: string | null;
  audio_url?: string | null;
}

/**
 * Ask a free-form question grounded in the lecture context via qa.py engine.
 */
export async function askLectureQuestion(
  lectureId: number | string,
  question: string,
  phaseOrder?: number | null,
  voice?: string,
  textLanguage?: string
): Promise<QAResponse> {
  return fetchJson<QAResponse>(`/api/lectures/${lectureId}/qa`, {
    method: "POST",
    body: JSON.stringify({
      question,
      phase_order: phaseOrder ?? null,
      voice: voice || null,
      text_language: textLanguage || null,
    }),
  });
}

/**
 * Check backend health status from GET /health.
 */
export async function checkHealth(): Promise<HealthStatus> {
  return fetchJson<HealthStatus>("/health", {
    method: "GET",
  });
}

// ============================================================================
// Default Export Object
// ============================================================================

export const api = {
  uploadLecture,
  listLectures,
  getLecture,
  getTranscripts,
  getLearningPlan,
  getQuizzes,
  getGaps,
  getGraph,
  startSession,
  sendCommand,
  askLectureQuestion,
  resolveAudioUrl,
  getLectureStreamUrl,
  getVoices,
  getPreferences,
  setPreferences,
  checkHealth,
};

export default api;

