export type Emotion = "joy" | "calm" | "anxiety" | "confusion";

export type EmotionProbs = Record<Emotion, number>;

export type Role = "user" | "character";

export interface Message {
  id: string;
  role: Role;
  speaker?: string;
  text: string;
  timestamp: number;
  emotion?: EmotionProbs;
  dominant?: Emotion;
  reactionBubble?: string;
  receptionSummary?: string;
  proactive?: boolean;
  expanded?: boolean;
  redoCount?: number;
}

export interface CharacterProfile {
  // Multi-paragraph personality picture used in the LLM system prompt.
  personality: string;
  // Expected speech register: 敬語 / カジュアル / mixed.
  register: "formal" | "casual" | "mixed";
  // Patterns the user can use that this character responds well to.
  // Each entry is a short Japanese sentence describing the pattern.
  whatLandsWell: string[];
  // Patterns that are technically polite but read as cold/wrong here.
  whatLandsBadly: string[];
  // Topics or words that pull each emotion up or down for this character.
  triggers: {
    joy: string[];
    anxiety: string[];
  };
  // The relationship dynamic with the practitioner.
  relationship: string;
}

export interface SceneCharacter {
  id: string;
  name: string;
  age: number;
  voice: { pitch: number; rate: number };
  accent: string;
  profile: CharacterProfile;
  bubbles: Record<Emotion, string[]>;
  templates: Record<Emotion, string[]>;
  proactiveLines: string[];
  expandLines: string[];
}

export interface Scene {
  id: string;
  title: string;
  description: string;
  // Why this scene matters socially — fed to the LLM so it understands
  // pressure (e.g. "面接前の控室。沈黙が長いと評価に響く").
  socialPressure: string;
  characterId: string;
  durationMin: number;
  difficulty: 1 | 2 | 3;
  initialEmotion: EmotionProbs;
  openingLine?: string;
}

export interface InferenceMeta {
  quantumInferenceMs: number;
  llmInferenceMs: number;
  dominantEmotion: Emotion;
  entropyBits: number;
  emotionDelta: EmotionProbs;
}

export interface TurnResponse {
  characterMessage: Message;
  inferenceMeta: InferenceMeta;
  // Facts the model identified in this turn that should be remembered for
  // the rest of the session. Optional; mock returns no facts.
  keyFactsLearned?: string[];
}
