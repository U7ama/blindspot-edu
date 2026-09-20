/**
 * frontend/lib/whiteboard/types.ts
 *
 * Core TypeScript types for the Blindspot Edu Whiteboard Subsystem.
 * Structured object model for canvas elements, tool configurations,
 * history tracking, JSON serialization, and Draw Command batches.
 */

export type ToolType =
  | 'select'
  | 'pan'
  | 'pen'
  | 'rectangle'
  | 'circle'
  | 'arrow'
  | 'text'
  | 'eraser';

export type CanvasObjectType =
  | 'shape'
  | 'text'
  | 'stroke'
  | 'arrow'
  | 'highlight';

export type ShapeSubtype = 'rectangle' | 'circle' | 'card' | 'diamond';

export interface Point {
  x: number;
  y: number;
}

export interface ObjectStyle {
  strokeColor: string;
  fillColor?: string;
  strokeWidth: number;
  opacity: number;
  fontSize?: number;
  fontFamily?: string;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface ShapeGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  subtype: ShapeSubtype;
  label?: string;
  borderRadius?: number;
}

export interface TextGeometry {
  x: number;
  y: number;
  text: string;
  width?: number;
  height?: number;
}

export interface StrokeGeometry {
  points: Point[];
}

export interface ArrowGeometry {
  from: Point;
  to: Point;
  controlPoint?: Point; // for curved arrows
  arrowheadEnd?: boolean;
  arrowheadStart?: boolean;
}

export interface CanvasObject {
  id: string;
  type: CanvasObjectType;
  authoredBy: 'user' | 'ai';
  geometry: ShapeGeometry | TextGeometry | StrokeGeometry | ArrowGeometry;
  style: ObjectStyle;
  createdAt: number;
  linkedStepId?: string | null; // Traceability link back to lesson step / timestamp
  zIndex?: number;
}

export interface ViewportTransform {
  x: number; // translation in px
  y: number;
  scale: number; // zoom factor (e.g. 1.0)
}

export interface WhiteboardState {
  version: '1.0';
  objects: CanvasObject[];
  viewport: ViewportTransform;
  selectedId: string | null;
}

// ---------------------------------------------------------------------------
// Draw Command Schema (Commands, Not Pixels)
// ---------------------------------------------------------------------------

export type DrawCommandOp =
  | 'add_shape'
  | 'add_text'
  | 'connect_arrow'
  | 'update_shape'
  | 'delete_shape'
  | 'highlight'
  | 'pan_zoom'
  | 'clear';

export interface AddShapeCommand {
  op: 'add_shape';
  id: string;
  subtype: ShapeSubtype;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  style?: Partial<ObjectStyle>;
  linkedStepId?: string;
}

export interface AddTextCommand {
  op: 'add_text';
  id: string;
  x: number;
  y: number;
  text: string;
  style?: Partial<ObjectStyle>;
  linkedStepId?: string;
}

export interface ConnectArrowCommand {
  op: 'connect_arrow';
  id: string;
  from: Point | string; // coordinate Point OR "shapeId.anchor" (e.g., "battery.right")
  to: Point | string;
  label?: string;
  style?: Partial<ObjectStyle>;
  linkedStepId?: string;
}

export interface UpdateShapeCommand {
  op: 'update_shape';
  targetId: string;
  geometry?: Partial<ShapeGeometry | TextGeometry>;
  style?: Partial<ObjectStyle>;
  label?: string;
}

export interface DeleteShapeCommand {
  op: 'delete_shape';
  targetId: string;
}

export interface HighlightCommand {
  op: 'highlight';
  targetId: string;
  durationMs?: number;
  color?: string;
}

export interface PanZoomCommand {
  op: 'pan_zoom';
  x: number;
  y: number;
  scale?: number;
}

export interface ClearCommand {
  op: 'clear';
}

export type DrawCommand =
  | AddShapeCommand
  | AddTextCommand
  | ConnectArrowCommand
  | UpdateShapeCommand
  | DeleteShapeCommand
  | HighlightCommand
  | PanZoomCommand
  | ClearCommand;

export interface CommandBatch {
  id: string;
  title: string;
  description: string;
  commands: DrawCommand[];
  initialViewport?: ViewportTransform;
}

export interface ActiveHighlight {
  targetId: string;
  color: string;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Speech & Audio Timing Schema (Step 3)
// ---------------------------------------------------------------------------

export interface TimingMark {
  word: string;
  raw_word: string;
  offset_ms: number;
  duration_ms: number;
}

export interface TTSWithTimingResponse {
  audio_url: string;
  duration_ms: number;
  timing_marks: TimingMark[];
}

// ---------------------------------------------------------------------------
// Synchronized Lesson & Timed Commands Schema (Step 4)
// ---------------------------------------------------------------------------

export interface TimedDrawCommand {
  command: DrawCommand;
  triggerWord?: string;     // Exact spoken word that triggers this command (e.g. "battery")
  triggerOffsetMs?: number; // Calculated or explicit millisecond timestamp trigger
}

export interface WhiteboardLessonBeat {
  id: string;
  title: string;
  description: string;
  speechScript: string;
  audioUrl?: string;
  durationMs?: number;
  timingMarks?: TimingMark[];
  timedCommands: TimedDrawCommand[];
  initialViewport?: ViewportTransform;
}

// ---------------------------------------------------------------------------
// Student Interruption & Turn-Based Q&A Schema (Step 6)
// ---------------------------------------------------------------------------

export type InterruptionState =
  | 'IDLE'
  | 'TEACHING_PLAYING'
  | 'INTERRUPTED_LISTENING'
  | 'AI_THINKING'
  | 'AI_ANSWERING'
  | 'READY_TO_RESUME';

export interface StudentInterruptionQuery {
  studentQuery: string;
  currentBoardObjects: CanvasObject[];
  activeLessonContext: {
    lessonId: string;
    lessonTitle: string;
    speechScript: string;
    currentTimestampMs: number;
  };
}

export interface InterruptionResponse {
  answerText: string;
  audioUrl: string;
  durationMs: number;
  timingMarks: TimingMark[];
  clarificationCommands: TimedDrawCommand[];
}

// ---------------------------------------------------------------------------
// Session State Persistence & Replay Schema (Step 9)
// ---------------------------------------------------------------------------

export type SessionEventType =
  | 'lecture_beat'
  | 'student_interruption'
  | 'student_drawing'
  | 'teacher_review';

export interface SessionEvent {
  id: string;
  type: SessionEventType;
  timestampMs: number;
  title: string;
  speechText?: string;
  audioUrl?: string;
  durationMs?: number;
  timingMarks?: TimingMark[];
  commands: TimedDrawCommand[];
  resultingObjects: CanvasObject[];
}

export interface WhiteboardSessionRecord {
  sessionId: string;
  lessonId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  activeObjects: CanvasObject[];
  viewport: ViewportTransform;
  events: SessionEvent[];
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  updatedAt: number;
  objectsCount: number;
  eventsCount: number;
}

// ---------------------------------------------------------------------------
// Multi-Stage Structured Lecture Course Schema
// ---------------------------------------------------------------------------

export interface CourseStageOutline {
  stageIndex: number;
  title: string;
  conceptGoal: string;
  spatialZone: {
    x: number;
    y: number;
    scale: number;
  };
}

export interface CourseSyllabus {
  courseId: string;
  topic: string;
  title: string;
  overview: string;
  totalStages: number;
  stages: CourseStageOutline[];
}

export interface CourseStageBeat {
  stageIndex: number;
  title: string;
  conceptGoal: string;
  speechScript: string;
  audioUrl: string;
  durationMs: number;
  timingMarks: TimingMark[];
  timedCommands: TimedDrawCommand[];
  cameraFocus: {
    x: number;
    y: number;
    scale: number;
  };
}

export interface MultiStageCourseRecord {
  syllabus: CourseSyllabus;
  stages: Record<number, CourseStageBeat>; // stageIndex -> beat
  currentStageIndex: number;
}




