"use client";

import React, { useRef, useEffect, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Float } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Square, Volume2 } from "lucide-react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

/**
 * Synchronized Subtitle Script for /audio/intro_audio.mp3
 * Timings (timeMs) and text updates can be dropped in here.
 */
export interface IntroSubtitleCue {
  startSec: number;
  text: string;
}

export const DEFAULT_INTRO_SUBTITLES: IntroSubtitleCue[] = [
  {
    startSec: 0.0,
    text: "Hi.",
  },
  {
    startSec: 1.1,
    text: "I'm your Blindspot Edu tutor.",
  },
  {
    startSec: 3.2,
    text: "I can help you visualize complex topics and generate interactive whiteboards on the fly.",
  },
];

const INTRO_FALLBACK_DURATION_MS = 12000;

interface RobotModelProps {
  isFast?: boolean;
  isPlaying?: boolean;
}

function RobotModel({ isFast = false, isPlaying = false }: RobotModelProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/Talking.glb");
  const { actions, names } = useAnimations(animations, group);

  const rotationYRef = useRef(0);
  const targetRotationYRef = useRef(0);

  // Disable frustum culling on all SkinnedMeshes so Three.js doesn't cull bones
  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.frustumCulled = false;
          (child as THREE.Mesh).castShadow = true;
          (child as THREE.Mesh).receiveShadow = true;
          if ((child as THREE.Mesh).material) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
            mat.side = THREE.DoubleSide;
            mat.needsUpdate = true;
          }
        }
      });
    }
  }, [scene]);

  // Keep the talking animation active at all times so bone transforms never collapse to bind pose
  useEffect(() => {
    if (names.length > 0 && actions) {
      const animName =
        names.find(
          (n) =>
            n.toLowerCase().includes("talk") ||
            n.toLowerCase().includes("layer") ||
            n.toLowerCase().includes("mixamo")
        ) || names[0];

      const action = actions[animName];
      if (action) {
        if (!action.isRunning()) {
          action.reset().play();
        }
        // Full talking animation when playing or fast; subtle living idle rate when idling
        action.timeScale = isPlaying || isFast ? (isFast ? 1.25 : 1.0) : 0.08;
      }
    }
  }, [isPlaying, isFast, actions, names]);

  // Gentle idle rotation, breathing hover, and speaking gestures
  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    if (group.current) {
      // Natural breathing hover (consistent across idle and talking)
      group.current.position.y = Math.sin(time * 1.2) * 0.035 - 0.65;

      // Responsive subtle rotation
      targetRotationYRef.current = Math.sin(time * 0.6) * 0.22;
      if (isFast || isPlaying) {
        targetRotationYRef.current += Math.sin(time * 2.2) * 0.1;
      }

      rotationYRef.current = THREE.MathUtils.lerp(
        rotationYRef.current,
        targetRotationYRef.current,
        delta * 3
      );
      group.current.rotation.y = rotationYRef.current;
    }
  });

  return (
    <group ref={group} position={[0, -0.65, 0]}>
      {/* Direct calibrated scale for Talking.glb */}
      <primitive object={scene} scale={290} />

      {/* Wine/Crimson Core Spotlight from underneath */}
      <pointLight
        position={[0, 0.6, 0.8]}
        color="#e11d48"
        intensity={isPlaying || isFast ? 4.5 : 3.0}
        distance={4.5}
      />
    </group>
  );
}

export interface RobotCompanionProps {
  isFast?: boolean;
  className?: string;
  showIntroButton?: boolean;
  externalSubtitle?: string | null;
  isExternalPlaying?: boolean;
  onIntroPlay?: () => void;
  stopIntroSignal?: number;
}

export default function RobotCompanionCanvas({
  isFast = false,
  className,
  showIntroButton = true,
  externalSubtitle,
  isExternalPlaying = false,
  onIntroPlay,
  stopIntroSignal,
}: RobotCompanionProps) {
  const [mounted, setMounted] = useState(false);

  // State Management: isPlaying boolean state & subtitleText string state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [subtitleText, setSubtitleText] = useState<string>("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutIdsRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Stop the intro sequence and reset all states and animations to idle
  const stopIntro = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.onerror = null;
      audioRef.current.onended = null;
      audioRef.current.ontimeupdate = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    timeoutIdsRef.current.forEach(clearTimeout);
    timeoutIdsRef.current = [];
    setIsPlaying(false);
    setSubtitleText("");
  }, []);

  // Stop intro if external signal changes (e.g. user starts playing lecture audio)
  useEffect(() => {
    if (stopIntroSignal && stopIntroSignal > 0) {
      stopIntro();
    }
  }, [stopIntroSignal, stopIntro]);

  // The Trigger: Simultaneously play audio, start talking animation, and cycle frame-accurate subtitles
  const handlePlayIntro = useCallback(() => {
    // If already playing, toggle to stop
    if (isPlaying) {
      stopIntro();
      return;
    }

    stopIntro();

    // Signal parent to pause any playing audio
    onIntroPlay?.();
    setIsPlaying(true);
    setSubtitleText(DEFAULT_INTRO_SUBTITLES[0].text);

    // Sync subtitle strictly to audio playback position
    const updateSubtitleFromTime = (curSec: number) => {
      for (let i = DEFAULT_INTRO_SUBTITLES.length - 1; i >= 0; i--) {
        if (curSec >= DEFAULT_INTRO_SUBTITLES[i].startSec) {
          setSubtitleText(DEFAULT_INTRO_SUBTITLES[i].text);
          break;
        }
      }
    };

    const fullIntroText = DEFAULT_INTRO_SUBTITLES.map((s) => s.text).join(" ");

    // Web Speech Synthesis Fallback if audio files are completely inaccessible
    const speakWithWebSpeech = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(fullIntroText);
        utterance.rate = 1.0;
        utterance.pitch = 1.05;

        const voices = window.speechSynthesis.getVoices();
        const preferredVoice =
          voices.find(
            (v) =>
              v.lang.startsWith("en") &&
              (v.name.includes("Natural") ||
                v.name.includes("Google") ||
                v.name.includes("Samantha") ||
                v.name.includes("Daniel") ||
                v.name.includes("Arthur"))
          ) || voices.find((v) => v.lang.startsWith("en"));

        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        utterance.onboundary = (e) => {
          // Progress subtitles on speech word boundaries
          if (e.charIndex > 45) {
            setSubtitleText(DEFAULT_INTRO_SUBTITLES[2].text);
          } else if (e.charIndex > 5) {
            setSubtitleText(DEFAULT_INTRO_SUBTITLES[1].text);
          }
        };

        utterance.onend = () => {
          stopIntro();
        };
        utterance.onerror = () => {
          stopIntro();
        };
        window.speechSynthesis.speak(utterance);
      } else {
        const fallbackEndTid = setTimeout(stopIntro, INTRO_FALLBACK_DURATION_MS);
        timeoutIdsRef.current.push(fallbackEndTid);
      }
    };

    // Candidate audio URLs in order of preference
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const candidateUrls = [
      `${origin}/audio/intro_audio.mp3`,
      `${origin}/audio/intro_audio.wav`,
      "/audio/intro_audio.mp3",
      "/audio/intro_audio.wav",
    ];

    let candidateIndex = 0;
    const tryNextAudioCandidate = () => {
      if (candidateIndex >= candidateUrls.length) {
        speakWithWebSpeech();
        return;
      }

      const currentUrl = candidateUrls[candidateIndex];
      candidateIndex++;

      const audio = new Audio();
      audio.preload = "auto";
      audio.src = currentUrl;
      audioRef.current = audio;

      // Subtitle progress strictly bound to audio clock
      audio.ontimeupdate = () => {
        updateSubtitleFromTime(audio.currentTime);
      };

      audio.onended = () => {
        stopIntro();
      };

      audio.onerror = () => {
        tryNextAudioCandidate();
      };

      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          const dynamicTimeoutMs = Math.ceil(audio.duration * 1000) + 1500;
          const durTid = setTimeout(() => {
            stopIntro();
          }, dynamicTimeoutMs);
          timeoutIdsRef.current.push(durTid);
        }
      };

      audio.play().catch(() => {
        tryNextAudioCandidate();
      });
    };

    tryNextAudioCandidate();

    // Safety fallback timeout
    const endTid = setTimeout(() => {
      stopIntro();
    }, INTRO_FALLBACK_DURATION_MS);
    timeoutIdsRef.current.push(endTid);
  }, [isPlaying, stopIntro, onIntroPlay]);

  // Clean up audio and active timeouts on component unmount
  useEffect(() => {
    return () => {
      stopIntro();
    };
  }, [stopIntro]);

  // Single unified subtitle resolution: visible only when talking or audio is playing
  const activeText = (isPlaying ? subtitleText : externalSubtitle) || "";
  const isTalkingOrPlaying = isPlaying || Boolean(isExternalPlaying);
  const isVisible = isTalkingOrPlaying && Boolean(activeText.trim());

  if (!mounted) {
    return (
      <div
        className={className || "w-full h-full min-h-[220px]"}
        style={{ width: "100%", height: "100%", minHeight: "220px" }}
      >
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-20 h-20 rounded-full border border-[#701a24]/30 bg-[#701a24]/10 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full h-full min-h-[220px] flex flex-col items-center justify-center pointer-events-auto",
        className
      )}
    >
      {/* 3D Canvas Stage */}
      <div className="relative w-full h-full flex-1 min-h-[190px] overflow-hidden">
        <Canvas
          camera={{ position: [0, 0.42, 3.3], fov: 43 }}
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
          }}
          style={{
            pointerEvents: "none",
            width: "100%",
            height: "100%",
            minHeight: "190px",
          }}
        >
          {/* Studio Lighting with Deep Oxblood Burgundy Rim */}
          <ambientLight intensity={1.6} />
          <directionalLight position={[5, 7, 5]} intensity={3.2} color="#ffffff" />
          <directionalLight position={[-5, 4, 3]} intensity={2.0} color="#f5f5f4" />
          <directionalLight position={[0, 4, -4]} intensity={2.5} color="#701a24" />
          <pointLight position={[0, -2, 2]} intensity={1.5} color="#881337" />

          <Suspense fallback={null}>
            <Float speed={1.5} rotationIntensity={0.08} floatIntensity={0.15}>
              <RobotModel isFast={isFast} isPlaying={isPlaying} />
            </Float>
          </Suspense>
        </Canvas>

        {/* Inward Sunken Speech Capsule with Optimal Clearance from the Robot */}
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="absolute bottom-1.5 inset-x-3 sm:inset-x-6 max-w-lg mx-auto z-20 pointer-events-auto"
            >
              <div className="relative flex items-center gap-3 px-4 py-2 sm:px-5 sm:py-2.5 rounded-2xl bg-neutral-950/90 backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_2px_6px_rgba(0,0,0,0.85),inset_0_-1px_1px_rgba(255,255,255,0.05),0_10px_24px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.04]">
                {/* Subtle Audio Icon (No blinking neon) */}
                <Volume2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />

                {/* Speech Quote Text */}
                <p className="text-xs sm:text-sm text-neutral-200 font-sans tracking-normal leading-relaxed select-none min-w-0 flex-1 font-normal text-left">
                  &ldquo;{activeText}&rdquo;
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The Trigger: Clean, calm "Play Intro" button placed below the 3D canvas */}
      {showIntroButton && (
        <div className="pt-2 pb-0.5 z-20 pointer-events-auto shrink-0 flex items-center justify-center">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={handlePlayIntro}
            className={cn(
              "group inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium tracking-tight cursor-pointer select-none",
              "transition-[background-color,border-color,box-shadow,color] duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#881337] focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950",
              isPlaying
                ? "bg-[#701a24] hover:bg-[#881337] border border-[#881337] text-white shadow-sm"
                : "bg-neutral-900/85 hover:bg-neutral-800 border border-white/[0.08] hover:border-white/[0.18] text-neutral-300 hover:text-white shadow-sm"
            )}
            title={isPlaying ? "Stop Intro" : "Play Intro"}
            aria-label={isPlaying ? "Stop Intro" : "Play Intro"}
          >
            {isPlaying ? (
              <>
                <Square className="w-2.5 h-2.5 fill-current text-white" />
                <span>Stop Intro</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current text-neutral-300 group-hover:text-white transition-colors" />
                <span>Play Intro</span>
              </>
            )}
          </motion.button>
        </div>
      )}
    </div>
  );
}

useGLTF.preload("/Talking.glb");

