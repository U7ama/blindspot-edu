"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass,
  AudioWaveform,
  Network,
  Sliders,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Clock,
  FileAudio,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Presentation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, Lecture } from "@/lib/api";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export interface SidebarProps {
  initialCollapsed?: boolean;
  className?: string;
  currentPathOverride?: string;
  onNavigate?: (href: string) => void;
}

const defaultNavItems: NavItem[] = [
  {
    id: "workspace",
    label: "Workspace",
    href: "/workspace",
    icon: Compass,
  },
  {
    id: "whiteboard",
    label: "AI Whiteboard",
    href: "/whiteboard-lab",
    icon: Presentation,
    badge: "Live",
  },
  {
    id: "lectures",
    label: "All Lectures",
    href: "#lectures",
    icon: AudioWaveform,
  },
  {
    id: "graph",
    label: "Knowledge Graph",
    href: "#graph",
    icon: Network,
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: Sliders,
  },
];

const DEFAULT_DEMO_LECTURES: Lecture[] = [
  {
    id: 1,
    filename: "Economics-101-Supply-Demand.mp3",
    status: "ready",
    uploaded_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
  },
  {
    id: 2,
    filename: "Physics-Ohm-Law-Circuits.mp3",
    status: "ready",
    uploaded_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: 3,
    filename: "Macroeconomics-Monetary-Policy.mp3",
    status: "ready",
    uploaded_at: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  initialCollapsed = false,
  className,
  currentPathOverride,
  onNavigate,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [lectures, setLectures] = useState<Lecture[]>(DEFAULT_DEMO_LECTURES);
  const [isLoadingLectures, setIsLoadingLectures] = useState<boolean>(false);
  const pathname = usePathname();
  const activePath = currentPathOverride || pathname || "/workspace";

  const toggleSidebar = () => {
    setIsCollapsed((prev) => !prev);
  };

  // Spring transition physics according to Emil Kowalski standard
  const springTransition = {
    type: "spring" as const,
    stiffness: 300,
    damping: 28,
  };

  // Fetch lectures history from GET /api/lectures
  const fetchLectures = useCallback(async () => {
    setIsLoadingLectures(true);
    try {
      const data = await api.listLectures();
      if (Array.isArray(data) && data.length > 0) {
        setLectures(data);
      } else {
        setLectures(DEFAULT_DEMO_LECTURES);
      }
    } catch {
      // Graceful fallback to starter lectures if backend is offline or empty
      setLectures(DEFAULT_DEMO_LECTURES);
    } finally {
      setIsLoadingLectures(false);
    }
  }, []);

  useEffect(() => {
    fetchLectures();
  }, [fetchLectures]);

  return (
    <motion.aside
      initial={false}
      animate={{
        width: isCollapsed ? 68 : 260,
      }}
      transition={springTransition}
      className={cn(
        "relative flex flex-col justify-between h-screen shrink-0 z-40 select-none",
        "bg-[#09090b]/95 backdrop-blur-xl border-r border-white/[0.07]",
        "text-stone-300 font-sans overflow-hidden",
        className
      )}
    >
      {/* Top Section: Brand Header, Main Nav & History */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Brand Header */}
        <div className="h-14 px-3.5 border-b border-white/[0.07] shrink-0 flex items-center justify-between transition-all duration-200">
          {isCollapsed ? (
            <div className="flex items-center justify-between w-full gap-1">
              <Link
                href="/"
                title="Blindspot Edu"
                className="flex items-center justify-center focus:outline-none shrink-0"
              >
                <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#701a24]/20 border border-[#701a24]/40 text-stone-200 hover:border-[#701a24] transition-colors duration-200">
                  <span className="font-bold text-xs tracking-tighter">B</span>
                  <div className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[#701a24]" />
                </div>
              </Link>
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={toggleSidebar}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer focus:outline-none shrink-0"
              >
                <PanelLeftOpen className="w-3.5 h-3.5" />
              </motion.button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <Link
                href="/"
                title="Blindspot Edu"
                className="flex items-center gap-3 overflow-hidden group focus:outline-none"
              >
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#701a24]/20 border border-[#701a24]/40 text-stone-200 group-hover:border-[#701a24] transition-colors duration-200">
                  <span className="font-bold text-sm tracking-tighter">B</span>
                  <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#701a24]" />
                </div>
                <div className="flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden">
                  <span className="text-sm font-semibold tracking-tight text-white group-hover:text-stone-200 transition-colors">
                    Blindspot
                  </span>
                  <span className="text-[10px] font-mono font-medium uppercase tracking-widest text-stone-400">
                    Edu
                  </span>
                </div>
              </Link>

              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={toggleSidebar}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer focus:outline-none"
              >
                <PanelLeftClose className="w-4 h-4" />
              </motion.button>
            </div>
          )}
        </div>

        {/* Section Label: Navigation */}
        <div className="px-4 pt-3.5 pb-1.5 shrink-0">
          {!isCollapsed ? (
            <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-stone-500 block px-2">
              Menu
            </span>
          ) : (
            <div className="h-[1px] w-5 mx-auto bg-white/[0.08]" />
          )}
        </div>

        {/* Navigation Items List */}
        <nav className="px-2 space-y-1 shrink-0">
          {defaultNavItems.map((item) => {
            const isActive =
              activePath === item.href ||
              (item.href === "/workspace" && activePath.startsWith("/workspace"));

            const Icon = item.icon;

            return (
              <motion.div key={item.id} whileTap={{ scale: 0.97 }}>
                <Link
                  href={item.href}
                  onClick={() => onNavigate?.(item.href)}
                  title={isCollapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex items-center rounded-xl text-xs font-medium tracking-tight",
                    "transition-colors duration-150 cursor-pointer focus:outline-none",
                    isCollapsed
                      ? "justify-center h-9 w-9 mx-auto"
                      : "gap-3 px-3 py-2 border-l-2",
                    isActive
                      ? isCollapsed
                        ? "bg-[#701a24]/30 text-white ring-1 ring-[#701a24]/50 shadow-sm"
                        : "bg-zinc-900/80 text-stone-100 border-[#701a24]"
                      : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04] border-transparent"
                  )}
                >
                  {/* Icon */}
                  <Icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-colors duration-150",
                      isActive
                        ? "text-stone-200"
                        : "text-stone-400 group-hover:text-stone-200"
                    )}
                  />

                  {/* Label & Badges */}
                  {!isCollapsed && (
                    <div className="flex items-center justify-between flex-1 whitespace-nowrap overflow-hidden">
                      <span className="truncate">{item.label}</span>

                      {item.badge && (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-md bg-[#701a24]/25 text-stone-300 border border-[#701a24]/40">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* Section Divider & History List Label */}
        <div className="px-4 pt-4 pb-1.5 flex items-center justify-between shrink-0">
          {!isCollapsed ? (
            <div className="flex items-center justify-between w-full px-2">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-stone-500">
                Recent Lectures
              </span>
              {lectures.length > 0 && (
                <span className="text-[10px] font-mono text-stone-400 px-1.5 py-0.2 rounded bg-white/[0.04] border border-white/[0.06]">
                  {lectures.length}
                </span>
              )}
            </div>
          ) : (
            <div className="h-[1px] w-5 mx-auto bg-white/[0.08]" />
          )}
        </div>

        {/* Dynamic Lecture History List */}
        <div className="px-2 overflow-y-auto overflow-x-hidden flex-1 py-1 space-y-1">
          {isLoadingLectures && lectures.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-stone-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </div>
          ) : lectures.length === 0 ? (
            !isCollapsed && (
              <div className="px-3 py-3 text-center rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <Clock className="w-3.5 h-3.5 mx-auto text-stone-600 mb-1" />
                <p className="text-[11px] text-stone-500 font-normal">
                  No lectures uploaded yet.
                </p>
              </div>
            )
          ) : (
            lectures.map((lecture) => {
              const lectureHref = `/workspace/${lecture.id ?? ""}`;
              const isLectureActive =
                activePath === lectureHref ||
                activePath === `/workspace?id=${lecture.id}`;

              return (
                <motion.div key={lecture.id ?? lecture.filename} whileTap={{ scale: 0.97 }}>
                  <Link
                    href={lectureHref}
                    onClick={() => onNavigate?.(lectureHref)}
                    title={lecture.filename}
                    className={cn(
                      "group relative flex items-center rounded-xl text-xs font-normal tracking-tight",
                      "transition-colors duration-150 cursor-pointer focus:outline-none",
                      isCollapsed
                        ? "justify-center h-8 w-8 mx-auto"
                        : "gap-2.5 px-3 py-2 border-l-2",
                      isLectureActive
                        ? isCollapsed
                          ? "bg-[#701a24]/20 text-white ring-1 ring-[#701a24]/40"
                          : "bg-zinc-900/90 text-stone-100 border-[#701a24]"
                        : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04] border-transparent"
                    )}
                  >
                    {/* Status Dot / File Icon */}
                    <div className="relative shrink-0 flex items-center justify-center">
                      <FileAudio className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-200 transition-colors" />
                      {lecture.status === "processing" ? (
                        <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                      ) : lecture.status === "ready" ? (
                        <div className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      ) : (
                        <div className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
                      )}
                    </div>

                    {/* Lecture Filename & Metadata */}
                    {!isCollapsed && (
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="truncate text-xs font-medium text-stone-300 group-hover:text-stone-100">
                          {lecture.filename}
                        </span>
                        <span className="text-[10px] font-mono text-stone-500 capitalize truncate">
                          {lecture.status}
                        </span>
                      </div>
                    )}
                  </Link>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Section: User Profile Footer */}
      <div className="p-2.5 border-t border-white/[0.07] shrink-0">
        <div
          className={cn(
            "flex items-center p-1.5 rounded-xl bg-zinc-900/60 border border-white/[0.07]",
            isCollapsed ? "justify-center" : "justify-between gap-2.5"
          )}
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            {/* Minimalist Avatar with Oxblood Tone */}
            <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-[#701a24] to-zinc-800 text-white font-semibold text-xs border border-white/10 shadow-sm">
              <span>U</span>
              <div className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 border border-stone-950" />
            </div>

            {/* Profile Info */}
            {!isCollapsed && (
              <div className="flex flex-col text-left whitespace-nowrap overflow-hidden">
                <span className="text-xs font-semibold text-stone-200 truncate">
                  Umair
                </span>
                <span className="text-[10px] text-stone-500 font-mono truncate">
                  Student Scholar
                </span>
              </div>
            )}
          </div>

          {/* Logout / Options Button */}
          {!isCollapsed && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              className="p-1.5 text-stone-500 hover:text-stone-300 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer focus:outline-none"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
