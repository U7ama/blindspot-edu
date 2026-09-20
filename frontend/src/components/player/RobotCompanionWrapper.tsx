"use client";

import React, { useState, useEffect } from "react";

export interface RobotCompanionWrapperProps {
  isFast?: boolean;
  showIntroButton?: boolean;
  externalSubtitle?: string | null;
  isExternalPlaying?: boolean;
  onIntroPlay?: () => void;
  stopIntroSignal?: number;
}

export default function RobotCompanionWrapper({
  isFast = false,
  showIntroButton = true,
  externalSubtitle,
  isExternalPlaying = false,
  onIntroPlay,
  stopIntroSignal,
}: RobotCompanionWrapperProps) {
  const [Component, setComponent] = useState<React.ComponentType<{
    isFast?: boolean;
    className?: string;
    showIntroButton?: boolean;
    externalSubtitle?: string | null;
    isExternalPlaying?: boolean;
    onIntroPlay?: () => void;
    stopIntroSignal?: number;
  }> | null>(null);

  useEffect(() => {
    let isMounted = true;
    import("./RobotCompanion").then((mod) => {
      if (isMounted) {
        setComponent(() => mod.default);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!Component) {
    return (
      <div className="w-full h-full min-h-[220px] flex items-center justify-center">
        <div className="w-20 h-20 rounded-full border border-[#701a24]/30 bg-[#701a24]/10 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[220px] flex items-center justify-center pointer-events-auto">
      <Component
        isFast={isFast}
        showIntroButton={showIntroButton}
        externalSubtitle={externalSubtitle}
        isExternalPlaying={isExternalPlaying}
        onIntroPlay={onIntroPlay}
        stopIntroSignal={stopIntroSignal}
        className="w-full h-full"
      />
    </div>
  );
}
