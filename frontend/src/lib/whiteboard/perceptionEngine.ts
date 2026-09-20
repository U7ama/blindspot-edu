/**
 * frontend/lib/whiteboard/perceptionEngine.ts
 *
 * Structured Perception Layer (Step 7 / Blueprint §2.4a).
 * Fast, deterministic hit-testing and semantic context extraction for deictic
 * pointing ("What is this?", "Why is this connected to that?").
 */

import { CanvasObject, ArrowGeometry, ShapeGeometry, TextGeometry, StrokeGeometry } from './types';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DeicticFocusInfo {
  targetId: string;
  type: string;
  label?: string;
  summary: string;
  connectedArrows: string[];
}

/**
 * Calculates the axis-aligned bounding box of any CanvasObject.
 */
export function getObjectBoundingBox(obj: CanvasObject): BoundingBox {
  if (obj.type === 'shape') {
    const g = obj.geometry as ShapeGeometry;
    return { x: g.x, y: g.y, width: g.width, height: g.height };
  } else if (obj.type === 'text') {
    const g = obj.geometry as TextGeometry;
    const fSize = obj.style.fontSize || 18;
    const estWidth = Math.max(60, g.text.length * (fSize * 0.6));
    const estHeight = fSize * 1.5;
    return { x: g.x, y: g.y, width: estWidth, height: estHeight };
  } else if (obj.type === 'arrow') {
    const g = obj.geometry as ArrowGeometry;
    const minX = Math.min(g.from.x, g.to.x) - 10;
    const minY = Math.min(g.from.y, g.to.y) - 10;
    const maxX = Math.max(g.from.x, g.to.x) + 10;
    const maxY = Math.max(g.from.y, g.to.y) + 10;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  } else if (obj.type === 'stroke') {
    const pts = (obj.geometry as StrokeGeometry).points || [];
    if (pts.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = pts[0].x;
    let minY = pts[0].y;
    let maxX = pts[0].x;
    let maxY = pts[0].y;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: minX - 5, y: minY - 5, width: maxX - minX + 10, height: maxY - minY + 10 };
  }

  return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Checks if a point (x, y) intersects an object's bounding area.
 */
export function isPointInsideObject(
  point: { x: number; y: number },
  obj: CanvasObject,
  tolerance: number = 8
): boolean {
  const box = getObjectBoundingBox(obj);
  return (
    point.x >= box.x - tolerance &&
    point.x <= box.x + box.width + tolerance &&
    point.y >= box.y - tolerance &&
    point.y <= box.y + box.height + tolerance
  );
}

/**
 * Resolves which object was clicked (searches top-most down).
 */
export function resolvePointHit(
  point: { x: number; y: number },
  objects: CanvasObject[]
): CanvasObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (isPointInsideObject(point, objects[i])) {
      return objects[i];
    }
  }
  return null;
}

/**
 * Resolves all objects intersecting a marquee selection box.
 */
export function resolveAreaSelection(
  box: BoundingBox,
  objects: CanvasObject[]
): CanvasObject[] {
  return objects.filter((obj) => {
    const objBox = getObjectBoundingBox(obj);
    return !(
      objBox.x + objBox.width < box.x ||
      objBox.x > box.x + box.width ||
      objBox.y + objBox.height < box.y ||
      objBox.y > box.y + box.height
    );
  });
}

/**
 * Compiles rich semantic context for a selected object to pass to the LLM for deictic questions.
 */
export function compileDeicticContext(
  selectedObj: CanvasObject | null,
  allObjects: CanvasObject[]
): DeicticFocusInfo | null {
  if (!selectedObj) return null;

  const connectedArrows: string[] = [];

  for (const obj of allObjects) {
    if (obj.type === 'arrow') {
      const g = obj.geometry as ArrowGeometry;
      const nearStart = isPointInsideObject(g.from, selectedObj, 25);
      const nearEnd = isPointInsideObject(g.to, selectedObj, 25);
      if (nearStart || nearEnd) {
        connectedArrows.push(
          `Arrow [${obj.id}] (${nearStart ? 'originates from' : 'points into'} this element)`
        );
      }
    }
  }

  let summary = `${selectedObj.type.toUpperCase()}`;
  if (selectedObj.type === 'shape') {
    const g = selectedObj.geometry as ShapeGeometry;
    summary += ` '${g.subtype}'`;
    if (g.label) summary += ` labeled "${g.label}"`;
    summary += ` at (${Math.round(g.x)}, ${Math.round(g.y)})`;
  } else if (selectedObj.type === 'text') {
    const g = selectedObj.geometry as TextGeometry;
    summary += ` text "${g.text}" at (${Math.round(g.x)}, ${Math.round(g.y)})`;
  }

  return {
    targetId: selectedObj.id,
    type: selectedObj.type,
    label: (selectedObj.geometry as any).label || (selectedObj.geometry as any).text,
    summary,
    connectedArrows,
  };
}