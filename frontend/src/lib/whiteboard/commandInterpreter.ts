/**
 * frontend/lib/whiteboard/commandInterpreter.ts
 *
 * Deterministic Command -> Canvas renderer engine.
 * Applies atomic DrawCommand JSON operations onto the CanvasObject model,
 * resolves spatial anchor connections, and provides test command batches.
 */

import {
  CanvasObject,
  DrawCommand,
  CommandBatch,
  Point,
  ShapeGeometry,
  TextGeometry,
  ArrowGeometry,
  ObjectStyle,
} from './types';

const DEFAULT_STYLE: ObjectStyle = {
  strokeColor: '#818CF8',
  fillColor: 'rgba(99, 102, 241, 0.12)',
  strokeWidth: 3,
  opacity: 1,
  fontSize: 16,
  fontFamily: 'sans-serif',
};

/**
 * Resolves an anchor string like "nodeId.right" or a raw Point coordinate.
 */
export function resolveAnchorPoint(
  anchor: Point | string,
  objects: CanvasObject[]
): Point {
  if (typeof anchor !== 'string') {
    return anchor;
  }

  const [id, position] = anchor.split('.');
  const targetObj = objects.find((o) => o.id === id);
  if (!targetObj) {
    return { x: 0, y: 0 };
  }

  if (targetObj.type === 'shape') {
    const geo = targetObj.geometry as ShapeGeometry;
    const cx = geo.x + geo.width / 2;
    const cy = geo.y + geo.height / 2;

    switch (position) {
      case 'left':
        return { x: geo.x, y: cy };
      case 'right':
        return { x: geo.x + geo.width, y: cy };
      case 'top':
        return { x: cx, y: geo.y };
      case 'bottom':
        return { x: cx, y: geo.y + geo.height };
      case 'center':
      default:
        return { x: cx, y: cy };
    }
  } else if (targetObj.type === 'text') {
    const geo = targetObj.geometry as TextGeometry;
    const estW = geo.text.length * 10;
    const estH = 24;
    return { x: geo.x + estW / 2, y: geo.y + estH / 2 };
  }

  return { x: 0, y: 0 };
}

/**
 * Pure function: applies a single DrawCommand to an array of CanvasObjects.
 */
export function applyCommand(
  objects: CanvasObject[],
  cmd: DrawCommand
): CanvasObject[] {
  switch (cmd.op) {
    case 'add_shape': {
      const existingIdx = objects.findIndex((o) => o.id === cmd.id);
      const label = cmd.label || '';
      // Ensure shape width and height provide generous breathing space for labels
      const minRequiredWidth = label ? Math.max(cmd.width, label.length * 8.5 + 36) : cmd.width;
      const minRequiredHeight = Math.max(cmd.height, 48);

      const newShape: CanvasObject = {
        id: cmd.id,
        type: 'shape',
        authoredBy: 'ai',
        geometry: {
          x: cmd.x,
          y: cmd.y,
          width: minRequiredWidth,
          height: minRequiredHeight,
          subtype: cmd.subtype || 'rectangle',
          label: cmd.label,
          borderRadius: 8,
        } as ShapeGeometry,
        style: {
          ...DEFAULT_STYLE,
          ...cmd.style,
        },
        createdAt: Date.now(),
        linkedStepId: cmd.linkedStepId || null,
      };

      if (existingIdx >= 0) {
        const next = [...objects];
        next[existingIdx] = newShape;
        return next;
      }
      return [...objects, newShape];
    }

    case 'add_text': {
      const existingIdx = objects.findIndex((o) => o.id === cmd.id);
      const newText: CanvasObject = {
        id: cmd.id,
        type: 'text',
        authoredBy: 'ai',
        geometry: {
          x: cmd.x,
          y: cmd.y,
          text: cmd.text,
        } as TextGeometry,
        style: {
          ...DEFAULT_STYLE,
          strokeWidth: 1,
          fillColor: 'transparent',
          ...cmd.style,
        },
        createdAt: Date.now(),
        linkedStepId: cmd.linkedStepId || null,
      };

      if (existingIdx >= 0) {
        const next = [...objects];
        next[existingIdx] = newText;
        return next;
      }
      return [...objects, newText];
    }

    case 'connect_arrow': {
      const fromPoint = resolveAnchorPoint(cmd.from, objects);
      const toPoint = resolveAnchorPoint(cmd.to, objects);
      const existingIdx = objects.findIndex((o) => o.id === cmd.id);

      const newArrow: CanvasObject = {
        id: cmd.id,
        type: 'arrow',
        authoredBy: 'ai',
        geometry: {
          from: fromPoint,
          to: toPoint,
          arrowheadEnd: true,
        } as ArrowGeometry,
        style: {
          ...DEFAULT_STYLE,
          fillColor: 'transparent',
          ...cmd.style,
        },
        createdAt: Date.now(),
        linkedStepId: cmd.linkedStepId || null,
      };

      if (existingIdx >= 0) {
        const next = [...objects];
        next[existingIdx] = newArrow;
        return next;
      }
      return [...objects, newArrow];
    }

    case 'update_shape': {
      return objects.map((obj) => {
        if (obj.id !== cmd.targetId) return obj;

        let updatedGeo = { ...obj.geometry };
        if (cmd.geometry) {
          updatedGeo = { ...updatedGeo, ...cmd.geometry };
        }
        if (cmd.label && obj.type === 'shape') {
          (updatedGeo as ShapeGeometry).label = cmd.label;
        }

        return {
          ...obj,
          geometry: updatedGeo,
          style: {
            ...obj.style,
            ...cmd.style,
          },
        };
      });
    }

    case 'delete_shape': {
      return objects.filter((o) => o.id !== cmd.targetId);
    }

    case 'clear': {
      return [];
    }

    case 'highlight':
    case 'pan_zoom':
    default:
      // Transient / viewport operations do not directly mutate the objects array
      return objects;
  }
}

// ---------------------------------------------------------------------------
// Pre-Baked Test Command Batches (Step 2 Verification)
// ---------------------------------------------------------------------------

export const TEST_BATCH_CIRCUIT: CommandBatch = {
  id: 'circuit-assembly',
  title: "Ohm's Law Circuit Construction",
  description: 'Sequential vector diagram assembly of a DC voltage loop with live current calculation.',
  initialViewport: { x: 80, y: 70, scale: 1.0 },
  commands: [
    {
      op: 'add_text',
      id: 'title-txt',
      x: 120,
      y: 40,
      text: "Ohm's Law: V = I × R",
      style: { strokeColor: '#F8FAFC', fontSize: 24 },
      linkedStepId: 'step-1-intro',
    },
    {
      op: 'add_shape',
      id: 'battery',
      subtype: 'rectangle',
      x: 120,
      y: 150,
      width: 90,
      height: 60,
      label: '9V DC',
      style: { strokeColor: '#FB7185', fillColor: 'rgba(251, 113, 133, 0.15)', strokeWidth: 3 },
      linkedStepId: 'step-2-source',
    },
    {
      op: 'highlight',
      targetId: 'battery',
      durationMs: 1400,
      color: '#FB7185',
    },
    {
      op: 'add_shape',
      id: 'resistor',
      subtype: 'rectangle',
      x: 380,
      y: 150,
      width: 120,
      height: 60,
      label: '100 Ω',
      style: { strokeColor: '#FBBF24', fillColor: 'rgba(251, 191, 36, 0.15)', strokeWidth: 3 },
      linkedStepId: 'step-3-load',
    },
    {
      op: 'connect_arrow',
      id: 'wire-top',
      from: 'battery.right',
      to: 'resistor.left',
      style: { strokeColor: '#38BDF8', strokeWidth: 3 },
      linkedStepId: 'step-4-current',
    },
    {
      op: 'add_text',
      id: 'current-calc',
      x: 240,
      y: 130,
      text: 'I = 9V / 100Ω = 90 mA',
      style: { strokeColor: '#38BDF8', fontSize: 16 },
      linkedStepId: 'step-4-current',
    },
    {
      op: 'highlight',
      targetId: 'wire-top',
      durationMs: 1800,
      color: '#38BDF8',
    },
    {
      op: 'update_shape',
      targetId: 'resistor',
      label: '100 Ω (R1 - Active)',
      style: { strokeColor: '#34D399', fillColor: 'rgba(52, 211, 153, 0.15)' },
    },
  ],
};

export const TEST_BATCH_BST: CommandBatch = {
  id: 'bst-insertion',
  title: 'Binary Search Tree Insertion',
  description: 'Visual step-by-step branching algorithm for inserting key values.',
  initialViewport: { x: 120, y: 60, scale: 1.0 },
  commands: [
    {
      op: 'add_text',
      id: 'bst-title',
      x: 230,
      y: 20,
      text: 'Binary Search Tree: Insert(30), Insert(70)',
      style: { strokeColor: '#F8FAFC', fontSize: 22 },
      linkedStepId: 'bst-1-root',
    },
    {
      op: 'add_shape',
      id: 'root-50',
      subtype: 'circle',
      x: 320,
      y: 80,
      width: 70,
      height: 70,
      label: '50',
      style: { strokeColor: '#818CF8', fillColor: 'rgba(129, 140, 248, 0.18)', strokeWidth: 3 },
      linkedStepId: 'bst-1-root',
    },
    {
      op: 'highlight',
      targetId: 'root-50',
      durationMs: 1200,
      color: '#818CF8',
    },
    {
      op: 'add_shape',
      id: 'node-30',
      subtype: 'circle',
      x: 180,
      y: 220,
      width: 60,
      height: 60,
      label: '30',
      style: { strokeColor: '#34D399', fillColor: 'rgba(52, 211, 153, 0.18)', strokeWidth: 3 },
      linkedStepId: 'bst-2-left',
    },
    {
      op: 'connect_arrow',
      id: 'edge-left',
      from: 'root-50.bottom',
      to: 'node-30.top',
      style: { strokeColor: '#94A3B8', strokeWidth: 2.5 },
      linkedStepId: 'bst-2-left',
    },
    {
      op: 'highlight',
      targetId: 'node-30',
      durationMs: 1200,
      color: '#34D399',
    },
    {
      op: 'add_shape',
      id: 'node-70',
      subtype: 'circle',
      x: 460,
      y: 220,
      width: 60,
      height: 60,
      label: '70',
      style: { strokeColor: '#38BDF8', fillColor: 'rgba(56, 189, 248, 0.18)', strokeWidth: 3 },
      linkedStepId: 'bst-3-right',
    },
    {
      op: 'connect_arrow',
      id: 'edge-right',
      from: 'root-50.bottom',
      to: 'node-70.top',
      style: { strokeColor: '#94A3B8', strokeWidth: 2.5 },
      linkedStepId: 'bst-3-right',
    },
    {
      op: 'highlight',
      targetId: 'node-70',
      durationMs: 1400,
      color: '#38BDF8',
    },
  ],
};