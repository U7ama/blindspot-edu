"use client";
import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Laptop, ChevronDown, Check } from "lucide-react";

type Theme = "light" | "dark" | "system";

interface Option {
  value: Theme;
  label: string;
  icon: typeof Sun;
  colorClass: string;
}

const OPTIONS: Option[] = [
  { value: "light", label: "Light", icon: Sun, colorClass: "text-amber-500" },
  { value: "dark", label: "Dark", icon: Moon, colorClass: "text-rose-400" },
  { value: "system", label: "System", icon: Laptop, colorClass: "text-neutral-400" },
];

let memoryTheme: Theme | null = null;

function getStoredTheme(): Theme {
  if (memoryTheme) return memoryTheme;
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("blindspot-theme");
      if (saved === "light" || saved === "dark" || saved === "system") {
        memoryTheme = saved as Theme;
        return memoryTheme;
      }
    } catch {}
  }
  return "system";
}

function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const isDark = theme === "dark" || (theme === "system" && media.matches);
  const targetTheme = isDark ? "dark" : "light";

  if (document.documentElement.dataset.theme !== targetTheme) {
    document.documentElement.dataset.theme = targetTheme;
  }
  if (document.documentElement.dataset.themePref !== theme) {
    document.documentElement.dataset.themePref = theme;
  }
  if (document.documentElement.classList.contains("dark") !== isDark) {
    document.documentElement.classList.toggle("dark", isDark);
  }
}

export default function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = getStoredTheme();
    if (stored !== theme) {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  // Synchronize across multiple browser tabs
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === "blindspot-theme" && e.newValue) {
        const next = e.newValue as Theme;
        if (next === "light" || next === "dark" || next === "system") {
          memoryTheme = next;
          setTheme(next);
          applyTheme(next);
        }
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Click outside and Escape key handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleSelect(next: Theme) {
    memoryTheme = next;
    try {
      localStorage.setItem("blindspot-theme", next);
    } catch {}
    setTheme(next);
    applyTheme(next);
    setIsOpen(false);
  }

  const currentOption = OPTIONS.find((o) => o.value === theme) || OPTIONS[2];

  return (
    <div className="relative inline-block text-left" ref={containerRef} suppressHydrationWarning>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current theme: ${currentOption.label}. Click to change appearance.`}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group flex items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border transition-colors duration-150 cursor-pointer select-none text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)] min-w-[78px] sm:min-w-[88px] ${
          isOpen
            ? "border-[var(--accent-ink)] bg-[var(--surface-soft)] shadow-md ring-1 ring-[var(--accent-ink)]/20"
            : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent-ink)] hover:bg-[var(--surface-soft)]/70 shadow-xs"
        }`}
        suppressHydrationWarning
      >
        <span className="theme-opt theme-opt-light">
          <Sun className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[var(--ink)] font-medium text-xs">Light</span>
        </span>
        <span className="theme-opt theme-opt-dark">
          <Moon className="w-3.5 h-3.5 text-rose-400" />
          <span className="text-[var(--ink)] font-medium text-xs">Dark</span>
        </span>
        <span className="theme-opt theme-opt-system">
          <Laptop className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-[var(--ink)] font-medium text-xs">System</span>
        </span>
        <ChevronDown
          className={`w-3 h-3 text-[var(--muted-ink)] transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[var(--accent-ink)]" : "group-hover:text-[var(--ink)]"
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Theme selection options"
          className="absolute right-0 top-full mt-2 w-40 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-xl shadow-black/20 dark:shadow-black/60 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right ring-1 ring-black/5 dark:ring-white/5"
        >
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-ink)] border-b border-[var(--line)]/50 mb-1">
            Appearance
          </div>
          {OPTIONS.map((opt) => {
            const isSelected = theme === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(opt.value)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-all duration-150 text-left cursor-pointer ${
                  isSelected
                    ? "bg-[var(--surface-soft)] text-[var(--accent-ink)] font-semibold shadow-2xs"
                    : "text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]/60 font-medium"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${opt.colorClass}`} />
                  <span>{opt.label}</span>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-[var(--accent-ink)] stroke-[2.5]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
