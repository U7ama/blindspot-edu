'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import {
  CanvasObject,
  ToolType,
  Point,
  ViewportTransform,
  ObjectStyle,
  ShapeGeometry,
  TextGeometry,
  StrokeGeometry,
  ArrowGeometry,
} from '@/lib/whiteboard/types';
import { getObjectBoundingBox } from '@/lib/whiteboard/perceptionEngine';

interface WhiteboardCanvasProps {
  objects: CanvasObject[];
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>;
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  strokeColor: string;
  strokeWidth: number;
  viewport: ViewportTransform;
  setViewport: React.Dispatch<React.SetStateAction<ViewportTransform>>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onCommitAction: (newObjects: CanvasObject[]) => void;
  onObjectClick?: (object: CanvasObject) => void;
  onAskAboutObject?: (object: CanvasObject) => void;
  activeHighlights?: Record<string, string>; // targetId -> color
  hideFloatingBadge?: boolean;
}

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  objects,
  setObjects,
  activeTool,
  setActiveTool,
  strokeColor,
  strokeWidth,
  viewport,
  setViewport,
  selectedId,
  setSelectedId,
  onCommitAction,
  onObjectClick,
  onAskAboutObject,
  activeHighlights = {},
  hideFloatingBadge = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [currentPointer, setCurrentPointer] = useState<Point | null>(null);

  // In-progress drawing states
  const [draftStroke, setDraftStroke] = useState<Point[] | null>(null);
  const [draftShape, setDraftShape] = useState<{ start: Point; current: Point } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ start: Point; current: Point } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [textInputPos, setTextInputPos] = useState<Point | null>(null);
  const [textInputVal, setTextInputVal] = useState('');

  // Moving existing object
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [dragObjectOffset, setDragObjectOffset] = useState<Point | null>(null);

  // Convert screen coordinates to world canvas coordinates
  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = screenX - rect.left;
      const clientY = screenY - rect.top;
      return {
        x: (clientX - viewport.x) / viewport.scale,
        y: (clientY - viewport.y) / viewport.scale,
      };
    },
    [viewport]
  );

  // Handle Zooming via Wheel (non-passive listener to avoid browser preventDefault warning)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
      const newScale = Math.min(Math.max(viewport.scale * zoomFactor, 0.15), 5.0);

      // Zoom centered at mouse position
      const newX = mouseX - (mouseX - viewport.x) * (newScale / viewport.scale);
      const newY = mouseY - (mouseY - viewport.y) * (newScale / viewport.scale);

      setViewport({ x: newX, y: newY, scale: newScale });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [viewport, setViewport]);

  // Keyboard shortcut listeners (Space for Pan, Escape, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if typing inside text input
      if (editingTextId || textInputPos) return;

      if (e.code === 'Space') {
        setIsSpacePressed(true);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          const updated = objects.filter((o) => o.id !== selectedId);
          setSelectedId(null);
          onCommitAction(updated);
        }
      } else if (e.key === 'Escape') {
        setSelectedId(null);
        setDraftStroke(null);
        setDraftShape(null);
        setTextInputPos(null);
        setEditingTextId(null);
      } else if (e.key.toLowerCase() === 'v') {
        setActiveTool('select');
      } else if (e.key.toLowerCase() === 'h') {
        setActiveTool('pan');
      } else if (e.key.toLowerCase() === 'p') {
        setActiveTool('pen');
      } else if (e.key.toLowerCase() === 'r') {
        setActiveTool('rectangle');
      } else if (e.key.toLowerCase() === 'o') {
        setActiveTool('circle');
      } else if (e.key.toLowerCase() === 'a') {
        setActiveTool('arrow');
      } else if (e.key.toLowerCase() === 't') {
        setActiveTool('text');
      } else if (e.key.toLowerCase() === 'e') {
        setActiveTool('eraser');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [editingTextId, textInputPos, selectedId, objects, onCommitAction, setSelectedId, setActiveTool]);

  // Pointer Down handler
  const handlePointerDown = (e: React.PointerEvent) => {
    if (editingTextId || textInputPos) return;

    const isPanMode = activeTool === 'pan' || isSpacePressed || e.button === 1; // Middle click
    const worldPoint = screenToWorld(e.clientX, e.clientY);

    setIsPointerDown(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setCurrentPointer(worldPoint);

    if (isPanMode) return;

    if (activeTool === 'select') {
      // Check if clicking on an object
      const clickedObj = [...objects].reverse().find((obj) => hitTest(obj, worldPoint));
      if (clickedObj) {
        setSelectedId(clickedObj.id);
        setIsDraggingObject(true);
        if (onObjectClick) onObjectClick(clickedObj);

        // Store offset for smooth dragging
        if (clickedObj.type === 'shape' || clickedObj.type === 'text') {
          const geo = clickedObj.geometry as ShapeGeometry | TextGeometry;
          setDragObjectOffset({
            x: worldPoint.x - geo.x,
            y: worldPoint.y - geo.y,
          });
        }
      } else {
        // Dragging on empty space starts the marquee selection light box
        setSelectedId(null);
        setSelectionBox({ start: worldPoint, current: worldPoint });
      }
    } else if (activeTool === 'eraser') {
      const clickedObj = [...objects].reverse().find((obj) => hitTest(obj, worldPoint));
      if (clickedObj) {
        const updated = objects.filter((o) => o.id !== clickedObj.id);
        if (selectedId === clickedObj.id) setSelectedId(null);
        onCommitAction(updated);
      }
    } else if (activeTool === 'pen') {
      setDraftStroke([worldPoint]);
    } else if (activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'arrow') {
      setDraftShape({ start: worldPoint, current: worldPoint });
    } else if (activeTool === 'text') {
      setTextInputPos(worldPoint);
      setTextInputVal('');
    }
  };

  // Pointer Move handler
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerDown) return;
    const isPanMode = activeTool === 'pan' || isSpacePressed || e.buttons === 4;
    const worldPoint = screenToWorld(e.clientX, e.clientY);
    setCurrentPointer(worldPoint);

    if (isPanMode && dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setViewport((prev) => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (selectionBox) {
      setSelectionBox((prev) => (prev ? { ...prev, current: worldPoint } : null));
    } else if (activeTool === 'pen' && draftStroke) {
      setDraftStroke((prev) => (prev ? [...prev, worldPoint] : [worldPoint]));
    } else if (draftShape) {
      setDraftShape((prev) => (prev ? { ...prev, current: worldPoint } : null));
    } else if (isDraggingObject && selectedId && dragObjectOffset) {
      // Move selected object
      setObjects((prev) =>
        prev.map((obj) => {
          if (obj.id !== selectedId) return obj;
          if (obj.type === 'shape') {
            const geo = obj.geometry as ShapeGeometry;
            return {
              ...obj,
              geometry: {
                ...geo,
                x: worldPoint.x - dragObjectOffset.x,
                y: worldPoint.y - dragObjectOffset.y,
              },
            };
          } else if (obj.type === 'text') {
            const geo = obj.geometry as TextGeometry;
            return {
              ...obj,
              geometry: {
                ...geo,
                x: worldPoint.x - dragObjectOffset.x,
                y: worldPoint.y - dragObjectOffset.y,
              },
            };
          }
          return obj;
        })
      );
    }
  };

  // Pointer Up / Finish Action handler
  const handlePointerUp = () => {
    if (!isPointerDown) return;
    setIsPointerDown(false);
    setIsDraggingObject(false);
    setDragObjectOffset(null);

    // If we were drawing a marquee selection box
    if (selectionBox) {
      const minX = Math.min(selectionBox.start.x, selectionBox.current.x);
      const maxX = Math.max(selectionBox.start.x, selectionBox.current.x);
      const minY = Math.min(selectionBox.start.y, selectionBox.current.y);
      const maxY = Math.max(selectionBox.start.y, selectionBox.current.y);
      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;

      if (boxWidth > 5 || boxHeight > 5) {
        // Find objects inside or intersecting this selection box
        const found = [...objects].reverse().find((obj) => {
          if (obj.type === 'shape') {
            const geo = obj.geometry as ShapeGeometry;
            return (
              geo.x < maxX &&
              geo.x + geo.width > minX &&
              geo.y < maxY &&
              geo.y + geo.height > minY
            );
          } else if (obj.type === 'text') {
            const geo = obj.geometry as TextGeometry;
            return geo.x < maxX && geo.x + 80 > minX && geo.y < maxY && geo.y + 30 > minY;
          } else if (obj.type === 'stroke') {
            const geo = obj.geometry as StrokeGeometry;
            return geo.points.some((pt) => pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY);
          } else if (obj.type === 'arrow') {
            const geo = obj.geometry as ArrowGeometry;
            return (
              (geo.from.x >= minX && geo.from.x <= maxX && geo.from.y >= minY && geo.from.y <= maxY) ||
              (geo.to.x >= minX && geo.to.x <= maxX && geo.to.y >= minY && geo.to.y <= maxY)
            );
          }
          return false;
        });

        if (found) {
          setSelectedId(found.id);
          if (onObjectClick) onObjectClick(found);
        }
      }
      setSelectionBox(null);
      return;
    }

    const style: ObjectStyle = {
      strokeColor,
      fillColor: 'transparent',
      strokeWidth,
      opacity: 1,
      fontSize: 16,
    };

    if (activeTool === 'pen' && draftStroke && draftStroke.length > 1) {
      const newObj: CanvasObject = {
        id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: 'stroke',
        authoredBy: 'user',
        geometry: { points: draftStroke } as StrokeGeometry,
        style,
        createdAt: Date.now(),
      };
      setDraftStroke(null);
      onCommitAction([...objects, newObj]);
    } else if (draftShape) {
      const { start, current } = draftShape;
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const width = Math.max(Math.abs(current.x - start.x), 10);
      const height = Math.max(Math.abs(current.y - start.y), 10);

      let newObj: CanvasObject | null = null;

      if (activeTool === 'rectangle') {
        newObj = {
          id: `rect-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          type: 'shape',
          authoredBy: 'user',
          geometry: {
            x,
            y,
            width,
            height,
            subtype: 'rectangle',
            borderRadius: 8,
          } as ShapeGeometry,
          style: { ...style, fillColor: 'rgba(30, 41, 59, 0.4)' },
          createdAt: Date.now(),
        };
      } else if (activeTool === 'circle') {
        newObj = {
          id: `circle-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          type: 'shape',
          authoredBy: 'user',
          geometry: {
            x,
            y,
            width,
            height,
            subtype: 'circle',
          } as ShapeGeometry,
          style: { ...style, fillColor: 'rgba(30, 41, 59, 0.4)' },
          createdAt: Date.now(),
        };
      } else if (activeTool === 'arrow') {
        newObj = {
          id: `arrow-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          type: 'arrow',
          authoredBy: 'user',
          geometry: {
            from: start,
            to: current,
            arrowheadEnd: true,
          } as ArrowGeometry,
          style,
          createdAt: Date.now(),
        };
      }

      setDraftShape(null);
      if (newObj) {
        onCommitAction([...objects, newObj]);
        setSelectedId(newObj.id);
        setActiveTool('select');
      }
    } else if (selectedId) {
      // If we finished dragging an object, commit the new array to history
      onCommitAction(objects);
    }
  };

  // Submit Text Input
  const handleTextSubmit = () => {
    if (textInputPos && textInputVal.trim().length > 0) {
      const newObj: CanvasObject = {
        id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: 'text',
        authoredBy: 'user',
        geometry: {
          x: textInputPos.x,
          y: textInputPos.y,
          text: textInputVal,
        } as TextGeometry,
        style: {
          strokeColor,
          strokeWidth: 1,
          opacity: 1,
          fontSize: 18,
          fontFamily: 'sans-serif',
        },
        createdAt: Date.now(),
      };
      onCommitAction([...objects, newObj]);
      setSelectedId(newObj.id);
      setActiveTool('select');
    }
    setTextInputPos(null);
    setTextInputVal('');
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative w-full h-full overflow-hidden bg-slate-950 select-none ${
        activeTool === 'pan' || isSpacePressed ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
      }`}
    >
      {/* Grid Pattern Background */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
        <defs>
          <pattern
            id="whiteboard-grid"
            width={40 * viewport.scale}
            height={40 * viewport.scale}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${viewport.x}, ${viewport.y})`}
          >
            <circle cx="2" cy="2" r="1.5" fill="#64748B" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#whiteboard-grid)" />
      </svg>

      {/* Main SVG Vector Surface */}
      <svg
        className="w-full h-full overflow-visible"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <defs>
          {/* Arrowhead Marker */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={strokeColor || '#818CF8'} />
          </marker>

          {/* Selection Light Filter & Gradient */}
          <filter id="selection-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="selection-light-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818CF8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* Existing Canvas Objects (Sorted by zIndex so background shading renders first) */}
        {[...objects]
          .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
          .map((obj) => (
            <RenderCanvasObject
              key={obj.id}
              object={obj}
              isSelected={obj.id === selectedId}
              highlightColor={activeHighlights[obj.id]}
            />
          ))}

        {/* In-progress Pen Stroke */}
        {draftStroke && draftStroke.length > 0 && (
          <path
            d={pointsToSvgPath(draftStroke)}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8}
          />
        )}

        {/* In-progress Shape Draft */}
        {draftShape && (
          <RenderDraftShape
            tool={activeTool}
            start={draftShape.start}
            current={draftShape.current}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
          />
        )}

        {/* Marquee Area Selection Light */}
        {selectionBox && (
          <g>
            <rect
              x={Math.min(selectionBox.start.x, selectionBox.current.x)}
              y={Math.min(selectionBox.start.y, selectionBox.current.y)}
              width={Math.abs(selectionBox.current.x - selectionBox.start.x)}
              height={Math.abs(selectionBox.current.y - selectionBox.start.y)}
              rx={6}
              fill="url(#selection-light-grad)"
              stroke="#818CF8"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            {/* 4 subtle corner light dots */}
            <circle
              cx={Math.min(selectionBox.start.x, selectionBox.current.x)}
              cy={Math.min(selectionBox.start.y, selectionBox.current.y)}
              r="2.5"
              fill="#818CF8"
            />
            <circle
              cx={Math.max(selectionBox.start.x, selectionBox.current.x)}
              cy={Math.min(selectionBox.start.y, selectionBox.current.y)}
              r="2.5"
              fill="#818CF8"
            />
            <circle
              cx={Math.min(selectionBox.start.x, selectionBox.current.x)}
              cy={Math.max(selectionBox.start.y, selectionBox.current.y)}
              r="2.5"
              fill="#818CF8"
            />
            <circle
              cx={Math.max(selectionBox.start.x, selectionBox.current.x)}
              cy={Math.max(selectionBox.start.y, selectionBox.current.y)}
              r="2.5"
              fill="#818CF8"
            />
          </g>
        )}
      </svg>

      {/* Inline Text Creator Popup */}
      {textInputPos && (
        <div
          className="absolute z-40 bg-slate-900 border border-indigo-500/80 rounded-xl p-2 shadow-2xl backdrop-blur-md"
          style={{
            left: `${viewport.x + textInputPos.x * viewport.scale}px`,
            top: `${viewport.y + textInputPos.y * viewport.scale}px`,
          }}
        >
          <textarea
            autoFocus
            rows={2}
            value={textInputVal}
            onChange={(e) => setTextInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleTextSubmit();
              } else if (e.key === 'Escape') {
                setTextInputPos(null);
              }
            }}
            placeholder="Type text... (Ctrl+Enter to save)"
            className="w-60 bg-slate-950 text-slate-100 text-sm p-2 rounded-lg border border-slate-800 focus:outline-none focus:border-indigo-400 resize-none font-sans"
          />
          <div className="flex justify-end gap-1 mt-1.5">
            <button
              onClick={() => setTextInputPos(null)}
              className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleTextSubmit}
              className="px-3 py-0.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium shadow-sm"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Floating Deictic Ask AI Badge for Selected Element (Step 7) */}
      {!hideFloatingBadge && selectedId && (() => {
        const selObj = objects.find((o) => o.id === selectedId);
        if (!selObj) return null;
        const box = getObjectBoundingBox(selObj);
        return (
          <div
            className="absolute z-50 pointer-events-auto -translate-x-1/2 -translate-y-full select-none"
            style={{
              left: `${viewport.x + (box.x + box.width / 2) * viewport.scale}px`,
              top: `${viewport.y + box.y * viewport.scale - 12}px`,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAskAboutObject?.(selObj);
            }}
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                onAskAboutObject?.(selObj);
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAskAboutObject?.(selObj);
              }}
              className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white rounded-full text-xs font-bold flex items-center gap-1.5 shadow-2xl shadow-indigo-600/60 border border-indigo-300/80 active:scale-95 transition-all cursor-pointer animate-bounce"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Ask AI about this</span>
            </button>
          </div>
        );
      })()}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helper Render Subcomponents
// ---------------------------------------------------------------------------
// Smart SVG word-wrapping helper
// ---------------------------------------------------------------------------

function wrapSvgText(
  text: string,
  maxWidth: number,
  fontSize: number,
  charWidthRatio = 0.58
): string[] {
  if (!text) return [];
  if (maxWidth <= 0) return [text];

  const maxCharsPerLine = Math.max(8, Math.floor(maxWidth / (fontSize * charWidthRatio)));
  const rawParagraphs = text.split('\n');
  const resultLines: string[] = [];

  for (const paragraph of rawParagraphs) {
    if (!paragraph.trim()) {
      resultLines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      if (!currentLine) {
        currentLine = word;
      } else if ((currentLine.length + 1 + word.length) <= maxCharsPerLine) {
        currentLine += ' ' + word;
      } else {
        resultLines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) {
      resultLines.push(currentLine);
    }
  }

  return resultLines.length > 0 ? resultLines : [text];
}

const RenderShapeLabel: React.FC<{
  label?: string;
  cx: number;
  cy: number;
  maxWidth: number;
  maxHeight: number;
  color: string;
  baseFontSize?: number;
}> = ({ label, cx, cy, maxWidth, maxHeight, color, baseFontSize = 14 }) => {
  if (!label) return null;

  // Ensure healthy internal breathing margins (20px horizontal, 14px vertical)
  const usableWidth = Math.max(20, maxWidth - 20);
  const usableHeight = Math.max(16, maxHeight - 14);

  // Wrap text into lines based on usable width
  let lines = wrapSvgText(label, usableWidth, baseFontSize);
  let fontSize = baseFontSize;

  const charWidthRatio = 0.58;
  const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
  const estWidth = maxLineLen * fontSize * charWidthRatio;
  const estHeight = lines.length * fontSize * 1.25;

  if (estWidth > usableWidth) {
    fontSize = Math.min(fontSize, Math.max(9, Math.floor(usableWidth / (maxLineLen * charWidthRatio))));
    lines = wrapSvgText(label, usableWidth, fontSize);
  }
  if (estHeight > usableHeight) {
    fontSize = Math.min(fontSize, Math.max(9, Math.floor(usableHeight / (lines.length * 1.25))));
  }

  const lineHeight = fontSize * 1.25;
  const totalHeight = lines.length * lineHeight;
  const startY = cy - totalHeight / 2 + fontSize * 0.85;

  return (
    <text
      x={cx}
      y={startY}
      textAnchor="middle"
      fill={color}
      fontSize={fontSize}
      fontWeight="500"
      fontFamily="system-ui, -apple-system, sans-serif"
    >
      {lines.map((line, idx) => (
        <tspan key={idx} x={cx} dy={idx === 0 ? 0 : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
};

const RenderCanvasObject: React.FC<{
  object: CanvasObject;
  isSelected: boolean;
  highlightColor?: string;
}> = ({ object, isSelected, highlightColor }) => {
  const { type, geometry, style, authoredBy } = object;

  if (type === 'stroke') {
    const geo = geometry as StrokeGeometry;
    return (
      <g className="animate-draw-stroke">
        {highlightColor && (
          <path
            d={pointsToSvgPath(geo.points)}
            fill="none"
            stroke={highlightColor}
            strokeWidth={style.strokeWidth + 12}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.5}
            className="animate-pulse"
          />
        )}
        <path
          d={pointsToSvgPath(geo.points)}
          fill="none"
          stroke={style.strokeColor}
          strokeWidth={style.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={style.opacity}
        />
        {isSelected && (
          <path
            d={pointsToSvgPath(geo.points)}
            fill="none"
            stroke="#6366F1"
            strokeWidth={style.strokeWidth + 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.3}
          />
        )}
      </g>
    );
  }

  if (type === 'shape') {
    const geo = geometry as ShapeGeometry;
    if (geo.subtype === 'rectangle' || geo.subtype === 'card') {
      return (
        <g className="animate-shape-in">
          {highlightColor && (
            <g>
              <rect
                x={geo.x - 6}
                y={geo.y - 6}
                width={geo.width + 12}
                height={geo.height + 12}
                rx={(geo.borderRadius || 8) + 4}
                fill={highlightColor}
                fillOpacity={0.08}
                stroke={highlightColor}
                strokeWidth={2.5}
                strokeDasharray="6 4"
                className="animate-pulse"
              />
            </g>
          )}
          <rect
            x={geo.x}
            y={geo.y}
            width={geo.width}
            height={geo.height}
            rx={geo.borderRadius || 8}
            ry={geo.borderRadius || 8}
            fill={style.fillColor || 'rgba(30, 41, 59, 0.5)'}
            stroke={isSelected ? '#818CF8' : highlightColor || style.strokeColor}
            strokeWidth={isSelected ? style.strokeWidth + 1 : highlightColor ? style.strokeWidth + 1 : style.strokeWidth}
            className="transition-colors"
          />
          <RenderShapeLabel
            label={geo.label}
            cx={geo.x + geo.width / 2}
            cy={geo.y + geo.height / 2}
            maxWidth={geo.width}
            maxHeight={geo.height}
            color={style.strokeColor}
            baseFontSize={style.fontSize || 14}
          />
          {isSelected && (
            <SelectionBoundingHalo
              x={geo.x - 4}
              y={geo.y - 4}
              width={geo.width + 8}
              height={geo.height + 8}
              rx={12}
            />
          )}
        </g>
      );
    } else if (geo.subtype === 'circle') {
      const rx = geo.width / 2;
      const ry = geo.height / 2;
      const cx = geo.x + rx;
      const cy = geo.y + ry;
      return (
        <g className="animate-shape-in">
          {highlightColor && (
            <g>
              <circle
                cx={cx}
                cy={cy}
                r={rx + 8}
                fill="none"
                stroke={highlightColor}
                strokeWidth={2}
                opacity={0.8}
                strokeDasharray="4 4"
                className="animate-spin"
                style={{ transformOrigin: `${cx}px ${cy}px`, animationDuration: '6s' }}
              />
              <circle
                cx={cx}
                cy={cy}
                r={rx + 4}
                fill={highlightColor}
                fillOpacity={0.2}
                className="animate-pulse"
              />
            </g>
          )}
          <ellipse
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill={style.fillColor || 'rgba(30, 41, 59, 0.5)'}
            stroke={isSelected ? '#818CF8' : highlightColor || style.strokeColor}
            strokeWidth={isSelected ? style.strokeWidth + 1 : highlightColor ? style.strokeWidth + 1 : style.strokeWidth}
          />
          <RenderShapeLabel
            label={geo.label}
            cx={cx}
            cy={cy}
            maxWidth={rx * 2 * 0.85}
            maxHeight={ry * 2 * 0.85}
            color={style.strokeColor}
            baseFontSize={style.fontSize || 14}
          />
          {isSelected && (
            <SelectionBoundingHalo
              x={geo.x - 4}
              y={geo.y - 4}
              width={geo.width + 8}
              height={geo.height + 8}
              rx={8}
            />
          )}
        </g>
      );
    }
  }

  if (type === 'arrow') {
    const geo = geometry as ArrowGeometry;
    const dx = geo.to.x - geo.from.x;
    const dy = geo.to.y - geo.from.y;
    const angle = Math.atan2(dy, dx);
    const headLen = 12;

    // Arrowhead calculations
    const p1x = geo.to.x - headLen * Math.cos(angle - Math.PI / 6);
    const p1y = geo.to.y - headLen * Math.sin(angle - Math.PI / 6);
    const p2x = geo.to.x - headLen * Math.cos(angle + Math.PI / 6);
    const p2y = geo.to.y - headLen * Math.sin(angle + Math.PI / 6);

    return (
      <g className="animate-shape-in">
        {isSelected && (
          <line
            x1={geo.from.x}
            y1={geo.from.y}
            x2={geo.to.x}
            y2={geo.to.y}
            stroke="#818CF8"
            strokeWidth={style.strokeWidth + 10}
            strokeLinecap="round"
            opacity={0.25}
          />
        )}
        <line
          x1={geo.from.x}
          y1={geo.from.y}
          x2={geo.to.x}
          y2={geo.to.y}
          stroke={isSelected ? '#818CF8' : style.strokeColor}
          strokeWidth={style.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={style.strokeStyle === 'dashed' ? '5 5' : undefined}
          className="animate-draw-stroke"
        />
        {geo.arrowheadEnd && (
          <polygon
            points={`${geo.to.x},${geo.to.y} ${p1x},${p1y} ${p2x},${p2y}`}
            fill={isSelected ? '#818CF8' : style.strokeColor}
          />
        )}
        {isSelected && (
          <g>
            <circle cx={geo.from.x} cy={geo.from.y} r="3.5" fill="#FFFFFF" stroke="#6366F1" strokeWidth="1.5" />
            <circle cx={geo.to.x} cy={geo.to.y} r="3.5" fill="#FFFFFF" stroke="#6366F1" strokeWidth="1.5" />
          </g>
        )}
      </g>
    );
  }

  if (type === 'text') {
    const geo = geometry as TextGeometry;
    const fontSize = style.fontSize || 16;
    const lineHeight = fontSize * 1.35;
    const maxWidth = geo.width || 320;
    const lines = wrapSvgText(geo.text, maxWidth, fontSize);
    const maxLineLength = Math.max(...lines.map((l) => l.length), 1);
    const estW = Math.min(maxWidth + 12, (maxLineLength * fontSize * 0.58) + 12);
    const estH = (lines.length * lineHeight) + 6;

    return (
      <g className="animate-shape-in">
        {highlightColor && (
          <rect
            x={geo.x - 6}
            y={geo.y - 4}
            width={estW + 12}
            height={estH + 8}
            rx={6}
            fill={highlightColor}
            fillOpacity={0.12}
            stroke={highlightColor}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            className="animate-pulse"
          />
        )}
        <text
          x={geo.x}
          y={geo.y + fontSize * 0.9}
          fill={style.strokeColor}
          fontSize={fontSize}
          fontFamily={style.fontFamily || 'system-ui, -apple-system, sans-serif'}
          fontWeight="500"
        >
          {lines.map((line, idx) => (
            <tspan
              key={idx}
              x={geo.x}
              dy={idx === 0 ? 0 : lineHeight}
            >
              {line}
            </tspan>
          ))}
        </text>
        {isSelected && (
          <SelectionBoundingHalo
            x={geo.x - 4}
            y={geo.y - 2}
            width={estW}
            height={estH}
            rx={6}
          />
        )}
      </g>
    );
  }

  return null;
};

// Sleek Selection Halo with ambient light and corner accent nodes
const SelectionBoundingHalo: React.FC<{
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
}> = ({ x, y, width, height, rx = 6 }) => {
  return (
    <g className="pointer-events-none">
      {/* Soft Ambient Light Glow Fill */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={rx}
        fill="rgba(99, 102, 241, 0.08)"
        stroke="#818CF8"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      {/* Corner Nodes */}
      <rect x={x - 3} y={y - 3} width="6" height="6" rx="1.5" fill="#FFFFFF" stroke="#6366F1" strokeWidth="1.5" />
      <rect x={x + width - 3} y={y - 3} width="6" height="6" rx="1.5" fill="#FFFFFF" stroke="#6366F1" strokeWidth="1.5" />
      <rect x={x - 3} y={y + height - 3} width="6" height="6" rx="1.5" fill="#FFFFFF" stroke="#6366F1" strokeWidth="1.5" />
      <rect x={x + width - 3} y={y + height - 3} width="6" height="6" rx="1.5" fill="#FFFFFF" stroke="#6366F1" strokeWidth="1.5" />
    </g>
  );
};

const RenderDraftShape: React.FC<{
  tool: ToolType;
  start: Point;
  current: Point;
  strokeColor: string;
  strokeWidth: number;
}> = ({ tool, start, current, strokeColor, strokeWidth }) => {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  if (tool === 'rectangle') {
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        fill="rgba(99, 102, 241, 0.1)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray="4 4"
      />
    );
  }

  if (tool === 'circle') {
    return (
      <ellipse
        cx={x + width / 2}
        cy={y + height / 2}
        rx={width / 2}
        ry={height / 2}
        fill="rgba(99, 102, 241, 0.1)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray="4 4"
      />
    );
  }

  if (tool === 'arrow') {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const angle = Math.atan2(dy, dx);
    const headLen = 12;
    const p1x = current.x - headLen * Math.cos(angle - Math.PI / 6);
    const p1y = current.y - headLen * Math.sin(angle - Math.PI / 6);
    const p2x = current.x - headLen * Math.cos(angle + Math.PI / 6);
    const p2y = current.y - headLen * Math.sin(angle + Math.PI / 6);

    return (
      <g>
        <line
          x1={start.x}
          y1={start.y}
          x2={current.x}
          y2={current.y}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray="4 4"
        />
        <polygon
          points={`${current.x},${current.y} ${p1x},${p1y} ${p2x},${p2y}`}
          fill={strokeColor}
        />
      </g>
    );
  }

  return null;
};

// ---------------------------------------------------------------------------
// Math / Hit-testing Utilities
// ---------------------------------------------------------------------------

function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function hitTest(obj: CanvasObject, p: Point): boolean {
  const tolerance = 10;

  if (obj.type === 'shape') {
    const geo = obj.geometry as ShapeGeometry;
    return (
      p.x >= geo.x - tolerance &&
      p.x <= geo.x + geo.width + tolerance &&
      p.y >= geo.y - tolerance &&
      p.y <= geo.y + geo.height + tolerance
    );
  }

  if (obj.type === 'text') {
    const geo = obj.geometry as TextGeometry;
    const fontSize = obj.style.fontSize || 16;
    const maxWidth = geo.width || 320;
    const lines = wrapSvgText(geo.text, maxWidth, fontSize);
    const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
    const estimatedWidth = Math.min(maxWidth, maxLineLen * fontSize * 0.58) + 8;
    const estimatedHeight = (lines.length * fontSize * 1.35) + 8;
    return (
      p.x >= geo.x - tolerance &&
      p.x <= geo.x + estimatedWidth + tolerance &&
      p.y >= geo.y - tolerance &&
      p.y <= geo.y + estimatedHeight + tolerance
    );
  }

  if (obj.type === 'arrow') {
    const geo = obj.geometry as ArrowGeometry;
    return distanceToSegment(p, geo.from, geo.to) <= tolerance;
  }

  if (obj.type === 'stroke') {
    const geo = obj.geometry as StrokeGeometry;
    for (let i = 0; i < geo.points.length - 1; i++) {
      if (distanceToSegment(p, geo.points[i], geo.points[i + 1]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  return false;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

export default WhiteboardCanvas;
