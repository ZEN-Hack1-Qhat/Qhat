import type { Emotion, EmotionProbs } from "./types";

export const EMOTIONS: Emotion[] = ["joy", "calm", "anxiety", "confusion"];

export const EMOTION_LABEL: Record<Emotion, string> = {
  joy: "喜び",
  calm: "安心",
  anxiety: "不安",
  confusion: "戸惑い",
};

export const EMOTION_EMOJI: Record<Emotion, string> = {
  joy: "😊",
  calm: "😌",
  anxiety: "😟",
  confusion: "😶",
};

export const EMOTION_COLOR: Record<Emotion, string> = {
  joy: "#C9A548",
  calm: "#5B8C7A",
  anxiety: "#C27878",
  confusion: "#7B5BAB",
};

export const EMOTION_TAG: Record<Emotion, string> = {
  joy: "JOY",
  calm: "CALM",
  anxiety: "ANXIETY",
  confusion: "CONFUSION",
};

export function dominant(probs: EmotionProbs): Emotion {
  let best: Emotion = "calm";
  let bestVal = -Infinity;
  for (const e of EMOTIONS) {
    if (probs[e] > bestVal) {
      bestVal = probs[e];
      best = e;
    }
  }
  return best;
}

export function entropy(probs: EmotionProbs): number {
  let h = 0;
  for (const e of EMOTIONS) {
    const p = probs[e];
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

export function entropyLabel(h: number): string {
  if (h < 0.6) return "感情がはっきりしている";
  if (h < 1.2) return "わずかな揺らぎ";
  if (h < 1.7) return "中程度の揺らぎ";
  return "複雑な感情";
}

export function delta(prev: EmotionProbs, curr: EmotionProbs): EmotionProbs {
  return {
    joy: curr.joy - prev.joy,
    calm: curr.calm - prev.calm,
    anxiety: curr.anxiety - prev.anxiety,
    confusion: curr.confusion - prev.confusion,
  };
}

export function normalize(probs: EmotionProbs): EmotionProbs {
  const sum =
    probs.joy + probs.calm + probs.anxiety + probs.confusion || 1;
  return {
    joy: probs.joy / sum,
    calm: probs.calm / sum,
    anxiety: probs.anxiety / sum,
    confusion: probs.confusion / sum,
  };
}

// Map dominant emotion to a 3D vector on the Bloch sphere.
// joy = +Z, calm = +Y, anxiety = -Z, confusion = -Y; small +X bias from joy/calm
export function emotionVector(probs: EmotionProbs): [number, number, number] {
  const x = probs.joy * 0.4 - probs.confusion * 0.3;
  const y = probs.calm - probs.confusion;
  const z = probs.joy - probs.anxiety;
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
}
