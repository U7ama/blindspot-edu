"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  flag?: string;
  badge?: string;
  icon?: React.ReactNode;
}

export interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  menuClassName?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = "Select option...",
  className,
  menuClassName,
  size = "md",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left select-none", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between gap-2.5 rounded-xl border backdrop-blur-md transition-all cursor-pointer focus:outline-none",
          "bg-zinc-900/90 hover:bg-zinc-850 border-white/[0.12] hover:border-white/[0.22] text-neutral-200 hover:text-white shadow-sm",
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-xs sm:text-sm",
          isOpen && "ring-2 ring-[#701a24]/50 border-[#701a24]/80 shadow-md",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 truncate text-left">
          {selectedOption ? (
            <>
              {selectedOption.flag && (
                <span className="text-sm shrink-0 leading-none">{selectedOption.flag}</span>
              )}
              {selectedOption.icon && (
                <span className="shrink-0 text-neutral-400">{selectedOption.icon}</span>
              )}
              <span className="truncate font-medium text-neutral-100">
                {selectedOption.label}
              </span>
              {selectedOption.sublabel && (
                <span className="text-[11px] text-neutral-400 font-normal truncate hidden sm:inline">
                  {selectedOption.sublabel}
                </span>
              )}
            </>
          ) : (
            <span className="text-neutral-500 truncate">{placeholder}</span>
          )}
        </div>

        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180 text-white"
          )}
        />
      </button>

      {/* Animated Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ minWidth: "100%" }}
            className={cn(
              "absolute z-50 mt-1.5 right-0 rounded-2xl border backdrop-blur-2xl shadow-2xl p-1.5",
              "bg-[#111116]/98 border-white/[0.12] shadow-black/80 max-h-64 overflow-y-auto",
              "scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent",
              menuClassName
            )}
          >
            <div className="space-y-0.5">
              {options.map((option) => {
                const isSelected = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left focus:outline-none",
                      isSelected
                        ? "bg-[#701a24]/20 text-white border border-[#701a24]/40 font-medium"
                        : "text-neutral-300 hover:text-white hover:bg-white/[0.06] border border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {option.flag && (
                        <span className="text-sm shrink-0 leading-none">{option.flag}</span>
                      )}
                      {option.icon && (
                        <span className="shrink-0 text-neutral-400">{option.icon}</span>
                      )}

                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn("truncate", isSelected && "font-semibold text-white")}>
                            {option.label}
                          </span>
                          {option.badge && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase tracking-wider bg-white/[0.06] text-neutral-400 border border-white/[0.05]">
                              {option.badge}
                            </span>
                          )}
                        </div>
                        {option.sublabel && (
                          <span className="text-[10px] text-neutral-400 truncate">
                            {option.sublabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[#e05364] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomSelect;
