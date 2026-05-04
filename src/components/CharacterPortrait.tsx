"use client";

import type { Emotion } from "@/lib/types";
import { CHARACTERS } from "@/lib/characters";

// Procedural SVG portraits — one per character × emotion. No external assets needed.
// HACK-1 demo: shapes communicate the expression; color matches each character.

interface PortraitProps {
  characterId: string;
  emotion: Emotion;
  thinking?: boolean;
  speaking?: boolean;
}

function eyeFor(emotion: Emotion, x: number) {
  switch (emotion) {
    case "joy":
      // happy curve
      return (
        <path
          d={`M ${x - 8} 0 Q ${x} -10 ${x + 8} 0`}
          stroke="#1A1A1A"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      );
    case "calm":
      return (
        <ellipse cx={x} cy={0} rx={3.5} ry={4.5} fill="#1A1A1A" />
      );
    case "anxiety":
      return (
        <g>
          <ellipse cx={x} cy={1} rx={3} ry={4} fill="#1A1A1A" />
          <path
            d={`M ${x - 7} -7 Q ${x - 2} -10 ${x + 6} -8`}
            stroke="#1A1A1A"
            strokeWidth="1.5"
            fill="none"
          />
        </g>
      );
    case "confusion":
      return (
        <g>
          <line
            x1={x - 5}
            y1={-3}
            x2={x + 5}
            y2={3}
            stroke="#1A1A1A"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1={x - 5}
            y1={3}
            x2={x + 5}
            y2={-3}
            stroke="#1A1A1A"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      );
  }
}

function mouthFor(emotion: Emotion) {
  switch (emotion) {
    case "joy":
      return (
        <path
          d="M -10 0 Q 0 12 10 0"
          stroke="#1A1A1A"
          strokeWidth="2"
          fill="#C27878"
          strokeLinecap="round"
        />
      );
    case "calm":
      return (
        <path
          d="M -8 0 Q 0 4 8 0"
          stroke="#1A1A1A"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      );
    case "anxiety":
      return (
        <path
          d="M -8 2 Q 0 -3 8 2"
          stroke="#1A1A1A"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      );
    case "confusion":
      return (
        <line
          x1={-5}
          y1={0}
          x2={5}
          y2={0}
          stroke="#1A1A1A"
          strokeWidth="2"
          strokeLinecap="round"
        />
      );
  }
}

function brows(emotion: Emotion) {
  switch (emotion) {
    case "joy":
      return (
        <g stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M -28 -12 Q -22 -16 -16 -12" />
          <path d="M 16 -12 Q 22 -16 28 -12" />
        </g>
      );
    case "anxiety":
      return (
        <g stroke="#1A1A1A" strokeWidth="2.2" strokeLinecap="round" fill="none">
          <path d="M -28 -10 L -16 -14" />
          <path d="M 16 -14 L 28 -10" />
        </g>
      );
    case "confusion":
      return (
        <g stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M -28 -12 L -16 -10" />
          <path d="M 16 -14 L 28 -10" />
        </g>
      );
    case "calm":
    default:
      return (
        <g stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" fill="none">
          <path d="M -28 -10 L -16 -12" />
          <path d="M 16 -12 L 28 -10" />
        </g>
      );
  }
}

export function CharacterPortrait({
  characterId,
  emotion,
  thinking,
  speaking,
}: PortraitProps) {
  const c = CHARACTERS[characterId];
  const skin = "#F4DCC9";
  const hair = characterId === "tanaka" ? "#3A3026" : characterId === "takahashi" ? "#1F1A14" : "#5C3A2E";
  const cloth = c.accent;
  const eye = thinking ? "confusion" : emotion;

  return (
    <svg
      viewBox="-100 -130 200 270"
      className="w-full h-full"
      role="img"
      aria-label={`${c.name} の表情: ${emotion}`}
    >
      <defs>
        {/* Eye blink: rapid scaleY 1 → 0 → 1 every 4 seconds */}
        <clipPath id={`blink-${characterId}`}>
          <rect x="-100" y="-30" width="200" height="60">
            <animate
              attributeName="height"
              values="60;60;60;60;0;60"
              keyTimes="0;0.93;0.95;0.97;0.98;1"
              dur="4.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="y"
              values="-30;-30;-30;-30;0;-30"
              keyTimes="0;0.93;0.95;0.97;0.98;1"
              dur="4.5s"
              repeatCount="indefinite"
            />
          </rect>
        </clipPath>
      </defs>

      {/* Whole body breathing: subtle scale */}
      <g>
        <animateTransform
          attributeName="transform"
          type="scale"
          values="1 1; 1.012 1.018; 1 1"
          keyTimes="0;0.5;1"
          dur="3.6s"
          repeatCount="indefinite"
          additive="sum"
        />

        {/* shoulders */}
        <path
          d="M -90 130 Q -90 60 -45 50 L 45 50 Q 90 60 90 130 Z"
          fill={cloth}
        />
        {/* neck */}
        <rect x={-15} y={30} width={30} height={30} fill={skin} />
        {/* head */}
        <ellipse cx={0} cy={-10} rx={50} ry={58} fill={skin} />
        {/* hair (back) */}
        <path
          d={
            characterId === "sakura"
              ? "M -52 -5 Q -60 -55 0 -75 Q 60 -55 52 -5 Q 50 -50 0 -60 Q -50 -50 -52 -5 Z"
              : characterId === "takahashi"
              ? "M -50 -30 Q -45 -65 0 -70 Q 45 -65 50 -30 L 45 -45 L 0 -55 L -45 -45 Z"
              : "M -50 -25 Q -45 -60 0 -68 Q 45 -60 50 -25 L 35 -40 L 0 -50 L -35 -40 Z"
          }
          fill={hair}
        />
        {/* hair side */}
        {characterId === "sakura" && (
          <path d="M -52 -5 Q -55 30 -42 35 L -42 0 Z" fill={hair} />
        )}
        {/* brows */}
        <g transform="translate(0, -10)">{brows(eye)}</g>
        {/* eyes — clipped by blink mask so they vanish briefly */}
        <g transform="translate(0, 5)" clipPath={`url(#blink-${characterId})`}>
          {eyeFor(eye, -22)}
          {eyeFor(eye, 22)}
        </g>
        {/* blush for joy */}
        {emotion === "joy" && !thinking && (
          <g fill="#F2B8B8" opacity="0.6">
            <ellipse cx={-30} cy={20} rx={10} ry={5} />
            <ellipse cx={30} cy={20} rx={10} ry={5} />
          </g>
        )}
        {/* mouth */}
        <g transform="translate(0, 28)">
          {speaking ? <SpeakingMouth /> : mouthFor(eye)}
        </g>
        {/* sweat for anxiety */}
        {emotion === "anxiety" && !thinking && (
          <path
            d="M 38 -20 Q 42 -10 38 -5 Q 34 -10 38 -20 Z"
            fill="#9BD0E8"
            opacity="0.85"
          />
        )}
      </g>
    </svg>
  );
}

function SpeakingMouth() {
  // Animated mouth that opens/closes like a simple lip-sync. Not phoneme-
  // accurate — just enough motion that the character feels alive while TTS
  // plays. Loop length is intentionally aperiodic-ish.
  return (
    <ellipse cx={0} cy={2} rx={9} fill="#A8443A">
      <animate
        attributeName="ry"
        values="1.5; 6; 2; 7; 3; 1.8"
        keyTimes="0;0.18;0.36;0.6;0.82;1"
        dur="0.7s"
        repeatCount="indefinite"
      />
    </ellipse>
  );
}
