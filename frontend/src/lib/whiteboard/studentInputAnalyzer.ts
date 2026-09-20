/**
 * frontend/lib/whiteboard/studentInputAnalyzer.ts
 *
 * Student-Drawn Input Differ & Semantic Serializer (Step 8 / Blueprint §2.4 & §3.2).
 * Extracts what the student drew, wrote, or connected on the whiteboard
 * without needing expensive pixel vision models.
 */

import {
  CanvasObject,
  ShapeGeometry,
  TextGeometry,
  ArrowGeometry,
  StrokeGeometry,
} from './types';

export interface UserShapeItem {
  id: string;
  subtype: string;
  label?: string;
  position: string;
}

export interface UserTextItem {
  id: string;
  text: string;
  position: string;
}

export interface UserArrowItem {
  id: string;
  from: string;
  to: string;
}

export interface StudentWorkDiff {
  userShapes: UserShapeItem[];
  userTexts: UserTextItem[];
  userArrows: UserArrowItem[];
  userStrokesCount: number;
  totalUserElements: number;
  summaryDescription: string;
}

/**
 * Analyzes the whiteboard objects and extracts only the elements authored by the student.
 */
export function extractStudentWorkDiff(allObjects: CanvasObject[]): StudentWorkDiff {
  const userObjects = allObjects.filter((o) => o.authoredBy === 'user');

  const userShapes: UserShapeItem[] = [];
  const userTexts: UserTextItem[] = [];
  const userArrows: UserArrowItem[] = [];
  let userStrokesCount = 0;

  for (const obj of userObjects) {
    if (obj.type === 'shape') {
      const g = obj.geometry as ShapeGeometry;
      userShapes.push({
        id: obj.id,
        subtype: g.subtype,
        label: g.label,
        position: `(${Math.round(g.x)}, ${Math.round(g.y)})`,
      });
    } else if (obj.type === 'text') {
      const g = obj.geometry as TextGeometry;
      userTexts.push({
        id: obj.id,
        text: g.text,
        position: `(${Math.round(g.x)}, ${Math.round(g.y)})`,
      });
    } else if (obj.type === 'arrow') {
      const g = obj.geometry as ArrowGeometry;
      userArrows.push({
        id: obj.id,
        from: `(${Math.round(g.from.x)}, ${Math.round(g.from.y)})`,
        to: `(${Math.round(g.to.x)}, ${Math.round(g.to.y)})`,
      });
    } else if (obj.type === 'stroke') {
      userStrokesCount++;
    }
  }

  // Construct readable summary for the AI prompt
  const summaryParts: string[] = [];
  if (userShapes.length > 0) {
    summaryParts.push(
      `Shapes (${userShapes.length}): ` +
        userShapes.map((s) => `${s.subtype} "${s.label || 'unlabeled'}" at ${s.position}`).join(', ')
    );
  }
  if (userTexts.length > 0) {
    summaryParts.push(
      `Formulas/Text (${userTexts.length}): ` +
        userTexts.map((t) => `"${t.text}" at ${t.position}`).join(', ')
    );
  }
  if (userArrows.length > 0) {
    summaryParts.push(
      `Arrows (${userArrows.length}): ` +
        userArrows.map((a) => `${a.from} -> ${a.to}`).join(', ')
    );
  }
  if (userStrokesCount > 0) {
    summaryParts.push(`Freehand Annotations: ${userStrokesCount} stroke(s)`);
  }

  const summaryDescription =
    summaryParts.length > 0
      ? summaryParts.join('\n')
      : 'No student-authored drawings detected on the whiteboard.';

  return {
    userShapes,
    userTexts,
    userArrows,
    userStrokesCount,
    totalUserElements: userObjects.length,
    summaryDescription,
  };
}