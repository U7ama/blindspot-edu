"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network,
  AlertTriangle,
  Search,
  Sparkles,
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Clock,
  Layers,
  ChevronRight,
  Move,
  Maximize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, GraphNode, GraphEdge } from "@/lib/api";

interface KnowledgeGraphViewProps {
  lectureId: number | string;
  onJumpToTimestamp?: (startSec: number) => void;
  onAskTutor?: (question: string) => void;
  className?: string;
}

// Card geometric bounds for precise border clipping
const CARD_WIDTH = 210;
const CARD_HEIGHT = 58;

/**
 * Calculates the exact point on the rectangular card boundary where a connection ray intersects it.
 * This guarantees arrowheads and connection lines touch the card border precisely without clipping or burying.
 */
function getBorderIntersection(
  fromPoint: { x: number; y: number },
  cardCenter: { x: number; y: number },
  width: number = CARD_WIDTH,
  height: number = CARD_HEIGHT,
  offset: number = 6
): { x: number; y: number } {
  const dx = fromPoint.x - cardCenter.x;
  const dy = fromPoint.y - cardCenter.y;

  if (dx === 0 && dy === 0) return cardCenter;

  const halfW = width / 2 + offset;
  const halfH = height / 2 + offset;

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let scale = 1;
  if (absDx * halfH > absDy * halfW) {
    scale = halfW / (absDx || 1);
  } else {
    scale = halfH / (absDy || 1);
  }

  return {
    x: cardCenter.x + dx * scale,
    y: cardCenter.y + dy * scale,
  };
}

/**
 * Smart Cluster-Aware Layout Generator:
 * - Arranges core concepts in a balanced ellipse matching 16:9 displays
 * - Places each blindspot gap node naturally near its related core concept
 * - Runs a lightweight 50-iteration force relaxation step to prevent any card overlaps
 */
function computeSmartLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  centerX: number = 1000,
  centerY: number = 800
): Record<string, { x: number; y: number }> {
  if (!nodes || nodes.length === 0) return {};

  const coreNodes = nodes.filter((n) => !n.is_gap);
  const gapNodes = nodes.filter((n) => n.is_gap);

  // Build adjacency lookup
  const adjacency: Record<string, Set<string>> = {};
  nodes.forEach((n) => {
    adjacency[n.id] = new Set();
  });
  edges.forEach((e) => {
    if (adjacency[e.source]) adjacency[e.source].add(e.target);
    if (adjacency[e.target]) adjacency[e.target].add(e.source);
  });

  const positions: Record<string, { x: number; y: number }> = {};
  const coreCount = coreNodes.length;

  // Ellipse proportions
  const rx = Math.min(500, Math.max(300, coreCount * 25));
  const ry = Math.min(340, Math.max(200, coreCount * 17));

  // 1. Arrange core nodes around the primary ellipse
  coreNodes.forEach((node, i) => {
    const angle = (i / Math.max(1, coreCount)) * 2 * Math.PI - Math.PI / 2;
    positions[node.id] = {
      x: centerX + rx * Math.cos(angle),
      y: centerY + ry * Math.sin(angle),
    };
  });

  // 2. Place gap nodes directly next to their connected core concept
  gapNodes.forEach((gap, i) => {
    const neighbors = Array.from(adjacency[gap.id] || []).filter((id) => positions[id]);
    if (neighbors.length > 0) {
      const primaryCorePos = positions[neighbors[0]];
      const dirX = primaryCorePos.x - centerX;
      const dirY = primaryCorePos.y - centerY;
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      const offsetDist = 175 + (i % 3) * 28;
      positions[gap.id] = {
        x: primaryCorePos.x + (dirX / len) * offsetDist + (i % 2 === 0 ? 25 : -25),
        y: primaryCorePos.y + (dirY / len) * offsetDist + (i % 2 === 0 ? 15 : -15),
      };
    } else {
      const angle = (i / Math.max(1, gapNodes.length)) * 2 * Math.PI;
      positions[gap.id] = {
        x: centerX + (rx + 190) * Math.cos(angle),
        y: centerY + (ry + 130) * Math.sin(angle),
      };
    }
  });

  // 3. Fast iterative repulsion relaxation to eliminate card collisions
  const nodeIds = nodes.map((n) => n.id);
  const minSepX = CARD_WIDTH + 32; // 242px
  const minSepY = CARD_HEIGHT + 26; // 84px

  for (let iter = 0; iter < 45; iter++) {
    for (let i = 0; i < nodeIds.length; i++) {
      const idA = nodeIds[i];
      const posA = positions[idA];
      for (let j = i + 1; j < nodeIds.length; j++) {
        const idB = nodeIds[j];
        const posB = positions[idB];

        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;

        const normDx = dx / minSepX;
        const normDy = dy / minSepY;
        const distSq = normDx * normDx + normDy * normDy;

        if (distSq < 1.35 && distSq > 0.0001) {
          const force = (1.35 - distSq) * 12;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          posA.x -= fx;
          posA.y -= fy;
          posB.x += fx;
          posB.y += fy;
        }
      }
    }
  }

  return positions;
}

// Center coordinate space
const CENTER_X = 1000;
const CENTER_Y = 800;

export const DEFAULT_GRAPH_NODES: GraphNode[] = [
  {
    id: "concept-1",
    lecture_id: 1,
    label: "Supply & Demand",
    is_gap: false,
    source_timestamp: { start: 12, end: 45 },
  },
  {
    id: "concept-2",
    lecture_id: 1,
    label: "Market Equilibrium",
    is_gap: false,
    source_timestamp: { start: 50, end: 95 },
  },
  {
    id: "concept-3",
    lecture_id: 1,
    label: "Price Elasticity of Demand",
    is_gap: false,
    source_timestamp: { start: 102, end: 145 },
  },
  {
    id: "concept-4",
    lecture_id: 1,
    label: "Price Signals & Allocation",
    is_gap: false,
    source_timestamp: { start: 155, end: 198 },
  },
  {
    id: "concept-5",
    lecture_id: 1,
    label: "Consumer & Producer Surplus",
    is_gap: false,
    source_timestamp: { start: 210, end: 255 },
  },
  {
    id: "concept-6",
    lecture_id: 1,
    label: "Deadweight Loss",
    is_gap: false,
    source_timestamp: { start: 270, end: 315 },
  },
  {
    id: "gap-1",
    lecture_id: 1,
    label: "Cross-Price Elasticity",
    is_gap: true,
    source_timestamp: { start: 118, end: 135 },
  },
  {
    id: "gap-2",
    lecture_id: 1,
    label: "Cobweb Theorem",
    is_gap: true,
    source_timestamp: { start: 65, end: 85 },
  },
  {
    id: "gap-3",
    lecture_id: 1,
    label: "Giffen Good Paradox",
    is_gap: true,
    source_timestamp: { start: 130, end: 148 },
  },
];

export const DEFAULT_GRAPH_EDGES: GraphEdge[] = [
  { lecture_id: 1, source: "concept-1", target: "concept-2", relation: "determines" },
  { lecture_id: 1, source: "concept-2", target: "concept-4", relation: "transmits" },
  { lecture_id: 1, source: "concept-1", target: "concept-3", relation: "quantifies" },
  { lecture_id: 1, source: "concept-2", target: "concept-5", relation: "maximizes" },
  { lecture_id: 1, source: "concept-5", target: "concept-6", relation: "diminished by" },
  { lecture_id: 1, source: "concept-3", target: "gap-1", relation: "unaddressed prerequisite" },
  { lecture_id: 1, source: "concept-2", target: "gap-2", relation: "stability blindspot" },
  { lecture_id: 1, source: "concept-3", target: "gap-3", relation: "violates law" },
];

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  lectureId,
  onJumpToTimestamp,
  onAskTutor,
  className,
}) => {
  const [nodes, setNodes] = useState<GraphNode[]>(DEFAULT_GRAPH_NODES);
  const [edges, setEdges] = useState<GraphEdge[]>(DEFAULT_GRAPH_EDGES);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(DEFAULT_GRAPH_NODES[0].id);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterMode, setFilterMode] = useState<"all" | "gaps">("all");
  const [zoomLevel, setZoomLevel] = useState<number>(0.85);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Custom node positions: nodeId -> { x, y }
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>(() =>
    computeSmartLayout(DEFAULT_GRAPH_NODES, DEFAULT_GRAPH_EDGES, CENTER_X, CENTER_Y)
  );

  // Active dragged node tracking
  const draggingNodeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    mouseStartX: number;
    mouseStartY: number;
  } | null>(null);

  // Refs to avoid recreating callbacks or triggering infinite fetch loops
  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const filterModeRef = useRef(filterMode);
  filterModeRef.current = filterMode;

  // Auto-fit helper: scales and centers the graph so all active concepts fit in the viewport
  const fitGraphToView = useCallback(
    (customPositions?: Record<string, { x: number; y: number }>, targetNodeList?: GraphNode[]) => {
      const posMap = customPositions || nodePositionsRef.current;
      const currentFilter = filterModeRef.current;
      const currentNodes = nodesRef.current;
      const targetNodes =
        targetNodeList || (currentFilter === "gaps" ? currentNodes.filter((n) => n.is_gap) : currentNodes);

      if (!containerRef.current || targetNodes.length === 0) return;

      const container = containerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) return;

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      targetNodes.forEach((node) => {
        const pos = posMap[node.id];
        if (!pos) return;
        if (pos.x < minX) minX = pos.x;
        if (pos.x > maxX) maxX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.y > maxY) maxY = pos.y;
      });

      if (minX === Infinity) return;

      // Add generous margin around cards (card width = 210, height = 58)
      const padX = CARD_WIDTH / 2 + 55;
      const padY = CARD_HEIGHT / 2 + 55;

      const bboxW = maxX - minX + padX * 2;
      const bboxH = maxY - minY + padY * 2;

      const scaleX = width / bboxW;
      const scaleY = height / bboxH;
      const targetScale = Math.min(1.05, Math.max(0.42, Math.min(scaleX, scaleY)));

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // Center around content bounding box
      const panX = (CENTER_X - centerX) * targetScale;
      const panY = (CENTER_Y - centerY) * targetScale;

      setZoomLevel(Number(targetScale.toFixed(3)));
      setPanOffset({ x: Math.round(panX), y: Math.round(panY) });
    },
    []
  );

  // Auto-fit once mounted
  useEffect(() => {
    const timer = setTimeout(() => {
      fitGraphToView();
    }, 100);
    return () => clearTimeout(timer);
  }, [fitGraphToView]);

  // Fetch live knowledge graph from GET /api/lectures/{id}/graph
  useEffect(() => {
    if (!lectureId) return;

    let isMounted = true;
    if (nodesRef.current.length === 0) {
      setIsLoading(true);
    }

    api
      .getGraph(lectureId)
      .then((data) => {
        if (!isMounted) return;
        const hasLiveNodes = Array.isArray(data.nodes) && data.nodes.length > 0;
        const loadedNodes = hasLiveNodes ? data.nodes : DEFAULT_GRAPH_NODES;
        const loadedEdges =
          hasLiveNodes && Array.isArray(data.edges) && data.edges.length > 0
            ? data.edges
            : DEFAULT_GRAPH_EDGES;

        setNodes(loadedNodes);
        setEdges(loadedEdges);

        if (loadedNodes.length > 0) {
          setSelectedNodeId((prev) =>
            prev && loadedNodes.some((n) => n.id === prev) ? prev : loadedNodes[0].id
          );

          const initialMap = computeSmartLayout(loadedNodes, loadedEdges, CENTER_X, CENTER_Y);
          setNodePositions(initialMap);

          // Auto-fit once container is painted
          setTimeout(() => {
            if (isMounted) {
              fitGraphToView(initialMap, loadedNodes);
            }
          }, 80);
        }
      })
      .catch((err) => {
        console.warn("Failed to load knowledge graph from backend, using default fallback graph:", err);
        if (!isMounted) return;
        setNodes(DEFAULT_GRAPH_NODES);
        setEdges(DEFAULT_GRAPH_EDGES);
        const initialMap = computeSmartLayout(DEFAULT_GRAPH_NODES, DEFAULT_GRAPH_EDGES, CENTER_X, CENTER_Y);
        setNodePositions(initialMap);
        setTimeout(() => {
          if (isMounted) {
            fitGraphToView(initialMap, DEFAULT_GRAPH_NODES);
          }
        }, 80);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [lectureId]);

  // Handle filter mode toggle ("all" vs "gaps")
  const handleFilterToggle = (mode: "all" | "gaps") => {
    setFilterMode(mode);
    if (mode === "gaps") {
      const firstGap = nodes.find((n) => n.is_gap);
      if (firstGap) {
        setSelectedNodeId(firstGap.id);
      }
    } else {
      if (nodes.length > 0) {
        setSelectedNodeId(nodes[0].id);
      }
    }

    setTimeout(() => {
      fitGraphToView(undefined, mode === "gaps" ? nodes.filter((n) => n.is_gap) : nodes);
    }, 60);
  };

  // Selected node object
  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Active focus ID (hovered or selected)
  const activeFocusId = hoveredNodeId || selectedNodeId;

  // Set of core nodes connected directly to gaps (for contextual spotlight in "gaps" mode)
  const gapConnectedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    const gapIds = new Set(nodes.filter((n) => n.is_gap).map((n) => n.id));
    edges.forEach((e) => {
      if (gapIds.has(e.source)) ids.add(e.target);
      if (gapIds.has(e.target)) ids.add(e.source);
    });
    return ids;
  }, [nodes, edges]);

  // Active edges and neighbors set for focus highlighting
  const activeEdgeMap = useMemo(() => {
    const map = new Map<string, { isSource: boolean }>();
    if (!activeFocusId) return map;
    edges.forEach((e, idx) => {
      if (e.source === activeFocusId) {
        map.set(`${e.source}->${e.target}-${idx}`, { isSource: true });
      } else if (e.target === activeFocusId) {
        map.set(`${e.source}->${e.target}-${idx}`, { isSource: false });
      }
    });
    return map;
  }, [edges, activeFocusId]);

  const neighborNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!activeFocusId) return ids;
    edges.forEach((e) => {
      if (e.source === activeFocusId) ids.add(e.target);
      if (e.target === activeFocusId) ids.add(e.source);
    });
    return ids;
  }, [edges, activeFocusId]);

  const neighborNodes = useMemo(() => {
    if (!selectedNodeId) return [];
    return nodes.filter((n) => neighborNodeIds.has(n.id) && n.id !== selectedNodeId);
  }, [nodes, neighborNodeIds, selectedNodeId]);

  // Stats
  const gapCount = useMemo(() => nodes.filter((n) => n.is_gap).length, [nodes]);
  const coreCount = nodes.length - gapCount;

  // --- High-Performance Mouse Interactions ---

  // Start dragging a node
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const currentPos = nodePositions[nodeId] || { x: CENTER_X, y: CENTER_Y };
    draggingNodeRef.current = {
      id: nodeId,
      startX: currentPos.x,
      startY: currentPos.y,
      mouseStartX: e.clientX,
      mouseStartY: e.clientY,
    };
  };

  // Canvas Panning or Node Dragging
  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".graph-node-card")) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    // 1. Dragging Node
    if (draggingNodeRef.current) {
      const { id, startX, startY, mouseStartX, mouseStartY } = draggingNodeRef.current;
      const deltaX = (e.clientX - mouseStartX) / zoomLevel;
      const deltaY = (e.clientY - mouseStartY) / zoomLevel;

      setNodePositions((prev) => ({
        ...prev,
        [id]: {
          x: startX + deltaX,
          y: startY + deltaY,
        },
      }));
      return;
    }

    // 2. Panning Canvas
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  const handleContainerMouseUp = () => {
    draggingNodeRef.current = null;
    setIsPanning(false);
  };

  // Trackpad / Mousepad scroll to zoom (anchored to cursor position)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Differentiate between trackpad pinch/scroll and mouse wheel ticks smoothly
      const zoomIntensity = 0.0018;
      const zoomFactor = Math.exp(-e.deltaY * zoomIntensity);

      setZoomLevel((prevZoom) => {
        const nextZoom = Math.min(2.0, Math.max(0.35, prevZoom * zoomFactor));
        if (Math.abs(nextZoom - prevZoom) < 0.0001) return prevZoom;

        // Anchor zooming directly towards cursor position in container
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        setPanOffset((prevPan) => {
          const scaleChange = nextZoom / prevZoom;
          const newPanX = mouseX - (mouseX - prevPan.x) * scaleChange;
          const newPanY = mouseY - (mouseY - prevPan.y) * scaleChange;
          return { x: Math.round(newPanX), y: Math.round(newPanY) };
        });

        return Number(nextZoom.toFixed(3));
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const formatTimestamp = (sec?: number | null) => {
    if (typeof sec !== "number") return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={cn(
        "relative flex flex-col lg:flex-row h-full w-full bg-[#09090b] text-neutral-100 overflow-hidden select-none",
        className
      )}
    >
      {/* 1. Main Graph Canvas Area (70% Width) */}
      <div className="flex-1 relative flex flex-col h-full overflow-hidden border-b lg:border-b-0 lg:border-r border-white/[0.08]">
        {/* Top Floating Controls Toolbar */}
        <div className="absolute top-4 left-4 right-4 z-30 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
          {/* Search & Filter Bar */}
          <div className="flex items-center gap-2 pointer-events-auto bg-zinc-900/90 backdrop-blur-md p-1.5 rounded-xl border border-white/[0.08] shadow-2xl">
            <div className="flex items-center gap-2 px-2.5 py-1 bg-black/40 rounded-lg border border-white/[0.05]">
              <Search className="w-3.5 h-3.5 text-neutral-400" />
              <input
                type="text"
                placeholder="Search concepts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none w-32 sm:w-44"
              />
            </div>

            {/* Filter Toggle: All vs Spotlight Gaps */}
            <div className="flex items-center gap-1 bg-black/30 p-0.5 rounded-lg text-[11px] font-medium">
              <button
                type="button"
                onClick={() => handleFilterToggle("all")}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors cursor-pointer",
                  filterMode === "all"
                    ? "bg-zinc-800 text-white shadow-sm font-semibold"
                    : "text-neutral-400 hover:text-white"
                )}
              >
                All ({nodes.length})
              </button>
              <button
                type="button"
                onClick={() => handleFilterToggle("gaps")}
                className={cn(
                  "px-2.5 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer",
                  filterMode === "gaps"
                    ? "bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] font-semibold"
                    : "text-neutral-400 hover:text-amber-300"
                )}
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>Gaps ({gapCount})</span>
              </button>
            </div>
          </div>

          {/* Zoom, Auto-Fit & Reset View */}
          <div className="flex items-center gap-1.5 pointer-events-auto bg-zinc-900/90 backdrop-blur-md p-1.5 rounded-xl border border-white/[0.08] shadow-2xl">
            <button
              type="button"
              onClick={() => fitGraphToView()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-colors cursor-pointer text-xs"
              title="Fit all concepts to screen"
            >
              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline text-[11px]">Fit View</span>
            </button>

            <div className="h-4 w-[1px] bg-white/[0.08]" />

            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(2.0, Number((z + 0.15).toFixed(2))))}
              className="p-1.5 rounded-lg hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <span className="text-[10px] font-mono text-neutral-400 w-9 text-center select-none">
              {Math.round(zoomLevel * 100)}%
            </span>

            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.35, Number((z - 0.15).toFixed(2))))}
              className="p-1.5 rounded-lg hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                fitGraphToView();
              }}
              className="p-1.5 rounded-lg hover:bg-white/[0.08] text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Full-Bleed Viewport */}
        <div
          ref={containerRef}
          onMouseDown={handleContainerMouseDown}
          onMouseMove={handleContainerMouseMove}
          onMouseUp={handleContainerMouseUp}
          onMouseLeave={handleContainerMouseUp}
          className={cn(
            "flex-1 w-full h-full relative overflow-hidden bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px]",
            isPanning ? "cursor-grabbing" : "cursor-grab"
          )}
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-400">
              <Network className="w-8 h-8 text-neutral-500 animate-pulse" />
              <span className="text-xs font-mono">Loading knowledge graph...</span>
            </div>
          ) : (
            <div
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                transformOrigin: "center center",
                position: "absolute",
                left: "calc(50% - 1000px)",
                top: "calc(50% - 800px)",
                width: "2000px",
                height: "1600px",
              }}
            >
              {/* Full-Bleed SVG Vector Canvas */}
              <svg
                className="w-full h-full absolute inset-0 pointer-events-none z-0"
                style={{ overflow: "visible" }}
              >
                <defs>
                  {/* Active Blue Connection Gradient */}
                  <linearGradient id="active-curve-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0.95" />
                  </linearGradient>

                  {/* Clean Blue Arrow Marker */}
                  <marker
                    id="arrowhead-active"
                    markerWidth="9"
                    markerHeight="7"
                    refX="8"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 9 3.5, 0 7" fill="#38bdf8" />
                  </marker>

                  {/* Warm Amber Arrow Marker for Gaps */}
                  <marker
                    id="arrowhead-gap"
                    markerWidth="9"
                    markerHeight="7"
                    refX="8"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 9 3.5, 0 7" fill="#f59e0b" />
                  </marker>

                  <marker
                    id="arrowhead-dim"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3.5, 0 7" fill="rgba(255, 255, 255, 0.2)" />
                  </marker>
                </defs>

                {edges.map((edge, idx) => {
                  const sourceNode = nodes.find((n) => n.id === edge.source);
                  const targetNode = nodes.find((n) => n.id === edge.target);
                  if (!sourceNode || !targetNode) return null;

                  const sourceCenter = nodePositions[edge.source];
                  const targetCenter = nodePositions[edge.target];
                  if (!sourceCenter || !targetCenter) return null;

                  const edgeKey = `${edge.source}->${edge.target}-${idx}`;
                  const activeInfo = activeEdgeMap.get(edgeKey);
                  const isEdgeActive = !!activeInfo;
                  const isGapEdge = sourceNode.is_gap || targetNode.is_gap;

                  // In "Gaps" spotlight mode, completely hide edges that don't relate to gaps
                  if (filterMode === "gaps" && !isGapEdge) {
                    return null;
                  }

                  // If searching and neither endpoint matches, skip edge
                  if (
                    searchQuery &&
                    !sourceNode.label.toLowerCase().includes(searchQuery.toLowerCase()) &&
                    !targetNode.label.toLowerCase().includes(searchQuery.toLowerCase())
                  ) {
                    return null;
                  }

                  // 1. Calculate Exact Card Border Intersections (Source Exit & Target Entry)
                  const startBorder = getBorderIntersection(targetCenter, sourceCenter, CARD_WIDTH, CARD_HEIGHT, 4);
                  const endBorder = getBorderIntersection(sourceCenter, targetCenter, CARD_WIDTH, CARD_HEIGHT, 6);

                  // 2. Smooth subtle quadratic bezier curve (avoids wild looping)
                  const dx = endBorder.x - startBorder.x;
                  const dy = endBorder.y - startBorder.y;
                  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));

                  // Clean, subtle curve (max 18px offset) to prevent criss-crossing
                  const curvature = Math.min(18, Math.max(6, dist * 0.04));
                  const nx = -dy / dist;
                  const ny = dx / dist;

                  const controlX = (startBorder.x + endBorder.x) / 2 + nx * curvature;
                  const controlY = (startBorder.y + endBorder.y) / 2 + ny * curvature;

                  const pathD = `M ${startBorder.x} ${startBorder.y} Q ${controlX} ${controlY} ${endBorder.x} ${endBorder.y}`;
                  const isHighlighted = isEdgeActive || (filterMode === "gaps" && isGapEdge);

                  return (
                    <g key={`edge-${idx}`}>
                      {/* Active / Gap Glowing Backing Beam */}
                      {isHighlighted && (
                        <path
                          d={pathD}
                          fill="none"
                          stroke={
                            filterMode === "gaps" && isGapEdge
                              ? "rgba(245, 158, 11, 0.3)"
                              : "rgba(56, 189, 248, 0.3)"
                          }
                          strokeWidth={7}
                          strokeLinecap="round"
                        />
                      )}

                      {/* Main Connection Curve */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke={
                          filterMode === "gaps" && isGapEdge
                            ? "#f59e0b"
                            : isEdgeActive
                            ? "url(#active-curve-gradient)"
                            : "rgba(255, 255, 255, 0.16)"
                        }
                        strokeWidth={isHighlighted ? 2.4 : 1.2}
                        strokeDasharray={isHighlighted ? "none" : "5 5"}
                        markerEnd={
                          filterMode === "gaps" && isGapEdge
                            ? "url(#arrowhead-gap)"
                            : isEdgeActive
                            ? "url(#arrowhead-active)"
                            : "url(#arrowhead-dim)"
                        }
                        className="transition-colors duration-200"
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Concept Nodes (Smooth Physics & High-Speed Drag) */}
              {nodes.map((node) => {
                // Filter by search query if present
                if (searchQuery && !node.label.toLowerCase().includes(searchQuery.toLowerCase())) {
                  return null;
                }

                const pos = nodePositions[node.id] || { x: CENTER_X, y: CENTER_Y };
                const isSelected = node.id === selectedNodeId;
                const isHovered = node.id === hoveredNodeId;

                // Dimming & Spotlight logic:
                let isDimmed = false;
                if (filterMode === "gaps") {
                  // In "Gaps" mode: ONLY gap nodes are highlighted! All other nodes are dimmed.
                  isDimmed = !node.is_gap;
                } else {
                  // In "All" mode:
                  // High visibility for ALL concepts by default.
                  // Only dim when actively hovering a node to isolate its immediate web.
                  if (hoveredNodeId) {
                    const isNeighborOfHover = neighborNodeIds.has(node.id);
                    isDimmed = node.id !== hoveredNodeId && !isNeighborOfHover;
                  } else {
                    isDimmed = false;
                  }
                }

                const isGapSpotlight = filterMode === "gaps" && node.is_gap;

                return (
                  <div
                    key={node.id}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                    }}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    style={{
                      position: "absolute",
                      left: `${pos.x}px`,
                      top: `${pos.y}px`,
                      transform: "translate(-50%, -50%)",
                      width: `${CARD_WIDTH}px`,
                      height: `${CARD_HEIGHT}px`,
                    }}
                    className={cn(
                      "graph-node-card cursor-grab active:cursor-grabbing px-3.5 py-2.5 rounded-2xl border backdrop-blur-xl transition-all duration-200 flex items-center gap-2.5 select-none",
                      isSelected
                        ? "bg-zinc-800/95 border-sky-400 ring-4 ring-sky-400/25 z-40 shadow-2xl shadow-sky-500/30 scale-105"
                        : isHovered
                        ? "bg-zinc-800/95 border-sky-400/80 ring-2 ring-sky-400/20 z-30 shadow-xl shadow-sky-500/20 scale-105"
                        : isGapSpotlight
                        ? "bg-[#22160a]/95 border-amber-400 ring-4 ring-amber-400/35 z-30 shadow-[0_0_28px_rgba(245,158,11,0.35)] scale-[1.04]"
                        : node.is_gap
                        ? "bg-[#18110a]/90 border-amber-500/60 hover:border-amber-400 z-20 shadow-md shadow-amber-500/10"
                        : "bg-[#131318]/95 border-white/[0.14] hover:border-white/[0.3] z-10 shadow-sm",
                      isDimmed ? "opacity-15 hover:opacity-75 scale-95" : "opacity-100"
                    )}
                  >
                    {node.is_gap ? (
                      <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 border border-amber-500/30">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="p-1.5 rounded-xl bg-sky-500/15 text-sky-400 shrink-0 border border-sky-500/25">
                        <Network className="w-4 h-4" />
                      </div>
                    )}

                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-semibold text-neutral-100 truncate leading-snug">
                        {node.label}
                      </span>
                      {node.is_gap ? (
                        <span className="text-[9px] font-mono text-amber-400 uppercase tracking-wider font-bold">
                          Blindspot Gap
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider">
                          Concept
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Legend */}
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-4 bg-zinc-900/85 backdrop-blur-md px-4 py-2 rounded-xl border border-white/[0.08] text-[11px] font-mono text-neutral-400 shadow-2xl">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span>Core Concept ({coreCount})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Blindspot Gap ({gapCount})</span>
          </div>
        </div>
      </div>

      {/* 2. Concept Detail Inspector Panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full sm:w-80 lg:w-96 flex flex-col h-full bg-[#0d0d10]/95 backdrop-blur-xl p-5 overflow-y-auto border-t lg:border-t-0 lg:border-l border-white/[0.08] shadow-2xl shrink-0 absolute lg:relative right-0 top-0 bottom-0 z-30"
          >
            <div className="flex flex-col justify-between h-full space-y-6">
              <div className="space-y-5">
                {/* Badge & Close Button */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider font-semibold flex items-center gap-1.5",
                      selectedNode.is_gap
                        ? "bg-amber-950/60 text-amber-300 border border-amber-500/30 shadow-sm"
                        : "bg-sky-950/60 text-sky-300 border border-sky-500/30 shadow-sm"
                    )}
                  >
                    {selectedNode.is_gap ? (
                      <>
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>Blindspot Gap Concept</span>
                      </>
                    ) : (
                      <>
                        <Network className="w-3 h-3 text-sky-400" />
                        <span>Core Lecture Topic</span>
                      </>
                    )}
                  </span>

                  <div className="flex items-center gap-2">
                    {selectedNode.source_timestamp && (
                      <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-neutral-500" />
                        <span>{formatTimestamp(selectedNode.source_timestamp.start)}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedNodeId(null)}
                      className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                      title="Close details"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Title */}
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
                    {selectedNode.label}
                  </h3>
                  <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                    {selectedNode.is_gap
                      ? "This concept is foundational to understanding the lecture but was assumed or under-explained by the instructor."
                      : "Extracted directly from the lecture transcript and connected to prerequisite ideas."}
                  </p>
                </div>

                {/* Jump to Timestamp Action */}
                {selectedNode.source_timestamp && onJumpToTimestamp && (
                  <button
                    type="button"
                    onClick={() =>
                      onJumpToTimestamp(selectedNode.source_timestamp?.start || 0)
                    }
                    className="w-full py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] hover:border-white/[0.15] text-xs font-semibold text-neutral-200 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      Jump to Lecture Excerpt (
                      {formatTimestamp(selectedNode.source_timestamp.start)})
                    </span>
                  </button>
                )}

                {/* Connected Concepts / Relationships */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Connected Concepts ({neighborNodes.length})</span>
                  </span>

                  <div className="flex flex-col gap-2">
                    {neighborNodes.length === 0 ? (
                      <span className="text-xs text-neutral-500 italic">
                        No direct adjacent nodes in current slice.
                      </span>
                    ) : (
                      neighborNodes.map((neighbor) => (
                        <div
                          key={neighbor.id}
                          onClick={() => setSelectedNodeId(neighbor.id)}
                          className="p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/[0.05] hover:border-white/[0.12] flex items-center justify-between cursor-pointer transition-colors group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                neighbor.is_gap ? "bg-amber-400" : "bg-sky-400"
                              )}
                            />
                            <span className="text-xs text-neutral-200 truncate group-hover:text-white">
                              {neighbor.label}
                            </span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-white transition-transform group-hover:translate-x-0.5" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Ask AI Tutor Prompt */}
              {onAskTutor && (
                <div className="pt-4 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() =>
                      onAskTutor(
                        `Can you explain the concept of "${selectedNode.label}" and how it connects to our lecture?`
                      )
                    }
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-stone-200 to-stone-100 hover:from-white hover:to-stone-200 text-neutral-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-white/5 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#701a24]" />
                    <span>Ask AI Tutor About This</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default KnowledgeGraphView;

