// The "30日チャレンジ" story arc. Each Day points at a Scene, plus a
// learning goal that's surfaced as the Input card before the conversation
// starts. Days are linear: Day N+1 unlocks once Day N has been completed
// at least once. Past Days can be replayed without limits — Qhat is for
// rehearsal, not a streak treadmill.
//
// Authoring rule of thumb: Days 1–10 are "training wheels" (single-skill,
// 1–3 turns enough), Days 14–25 are real-pressure scenarios, Days 28–30
// are "you can do this on your own now" leading into graduation.

import type { Goal } from "./goals";

export interface StoryEpisode {
  // Stable identifier; persisted in localStorage progress so Day numbers
  // can be reordered without breaking saves.
  id: string;
  // The day label the user sees ("Day 1", "Day 2", …). Sequential 1..N so
  // the timeline doesn't read as "1, 3, 5, 7, 10" gaps — that pattern made
  // users wonder if days were missing. Episode IDs (e.g. day3_short_reaction)
  // retain the original arc-day for authoring history but aren't shown.
  day: number;
  title: string;
  // One-sentence "what we're learning" message shown before the scene.
  // Doubles as the Input card content; keep it short and concrete.
  learningGoal: string;
  // The scene the user actually plays. Must exist in scenes.ts.
  sceneId: string;
  // Minimum number of user turns before the practitioner can mark this
  // episode complete. Prevents one-shot "say hello, done" exits and
  // gives each day a real practice target. Day 1 stays at 1 (the spirit
  // is "even one word counts"); later days require 2–4 turns so the
  // skill actually has room to land.
  minTurns: number;
  // 2–3 concrete tips surfaced on the briefing screen. Specific to this
  // episode — don't paraphrase the learning goal; instead give the user
  // *moves* they can try ("〜と言ってみる", "〜だけでOK").
  tips: string[];
  // Short narrative preface (1–2 sentences) shown at the top of the
  // briefing. Frames the moment in story-arc terms ("3日後", "また同じ
  // バス停で") so the day feels like a continuation rather than an
  // isolated drill. Keep poetic, present tense, second-person implied.
  intro?: string;
  // Optional small goals tracked live during the conversation. Achieving
  // them isn't required — minTurns is the gate for completion — but they
  // give the practice an explicit checklist instead of leaving the user
  // wondering what specifically they're aiming for. Day 1 deliberately
  // has none ("just say a word, that's enough").
  goals?: Goal[];
  // Special terminal episode — the Day 30 reflection has no scene; it's
  // a static congratulations screen that finalises graduation.
  kind?: "scene" | "reflection";
}

export const STORY_EPISODES: StoryEpisode[] = [
  {
    id: "day1_first_word",
    day: 1,
    title: "はじめての一言",
    learningGoal: "短い一言だけ返せれば◎。完璧な答えはいりません。",
    sceneId: "convenience_store",
    minTurns: 1,
    tips: [
      "「こんにちは」「お願いします」だけで十分",
      "沈黙でも気にしない、一言返せたら勝ち",
      "うまく言えなくても、店員さんは業務として返してくれる",
    ],
    intro:
      "いつものコンビニ、レジに並ぶ。森野さんが目を合わせて会釈してくれる。今日はまず、声に出して一言。",
  },
  {
    id: "day3_short_reaction",
    day: 2,
    title: "「そうですね」を試す",
    learningGoal: "相手の言葉に短く反応する。沈黙より一言。",
    sceneId: "bus_stop_morning",
    minTurns: 2,
    tips: [
      "「そうですね」「ですよね」「ほんとに」のどれか一つ",
      "返事は短くてOK、長く話そうとしない",
      "間が空いても、また一言返せばいい",
    ],
    goals: [
      {
        id: "short",
        type: "user_short_reply",
        threshold: 12,
        label: "12文字以下で短く返す",
      },
    ],
    intro:
      "バス停の朝。同じ時間にいつもいる海斗さんが、軽く会釈してきた。気まずい沈黙より、短い一言を。",
  },
  {
    id: "day5_echo_back",
    day: 3,
    title: "オウム返しで返す",
    learningGoal: "相手の言葉から一つ拾って返す。「映画ですか」「寒いですね」。",
    sceneId: "bus_stop_echo",
    minTurns: 3,
    tips: [
      "相手の言葉から名詞・キーワードを一つ拾う",
      "「〜ですか」「〜なんですね」と短く返す",
      "意見や感想を足さなくていい、拾うだけ",
    ],
    goals: [
      { id: "echo", type: "user_echo", label: "相手の言葉を一つ拾って返す" },
    ],
    intro:
      "今朝もバスが遅れている。海斗さんが何か話しかけてくれる。出てきた言葉から、ひとつだけ拾ってみる。",
  },
  {
    id: "day7_one_question",
    day: 4,
    title: "一問だけ質問する",
    learningGoal: "返事の最後に「どんな〜？」を一つ足してみる。",
    sceneId: "team_one_question",
    minTurns: 3,
    tips: [
      "返事のあとに質問を1つ足す。例:「どんな感じ？」「いつから？」",
      "答えを準備しなくていい、聞くだけでOK",
      "質問は1つで十分。連続して聞かない",
    ],
    goals: [
      { id: "ask", type: "user_question", label: "自分から質問を1つする" },
    ],
    intro:
      "ゆきはいつもどおり、フランクに話しかけてきた。今日は受けるだけじゃなく、最後にひとつだけ質問を足してみる。",
  },
  {
    id: "day10_recovery",
    day: 5,
    title: "詰まったときの言葉",
    learningGoal: "「うまく言えないんですが」「ちょっと考えてました」で十分。",
    sceneId: "team_recovery",
    minTurns: 3,
    tips: [
      "詰まったら正直に「うまく言えないんですが」",
      "「ちょっと考えてました」で間を埋めて大丈夫",
      "答えが出なくても、それを言葉にするだけで会話は続く",
    ],
    goals: [
      {
        id: "recover",
        type: "recovery_phrase",
        label: "詰まったときの言葉を使う",
      },
    ],
    intro:
      "ゆきとの会話で、ふと答えに詰まる瞬間がやってくる。逃げなくていい、「うまく言えないんですが」と正直に。",
  },
  {
    id: "day14_offline_meet",
    day: 6,
    title: "オフ会で初対面",
    learningGoal: "1往復できれば成功。長く話そうとしなくていい。",
    sceneId: "kanto_offline",
    minTurns: 3,
    tips: [
      "盛り上げようとしない、まず1往復",
      "相手の言葉を一つ拾って返す",
      "短い相槌＋共感（「わかります」「それ好きです」）が刺さる",
    ],
    goals: [
      {
        id: "calm_them",
        type: "anxiety_below",
        threshold: 0.35,
        label: "相手の不安を 35% 以下に",
      },
      { id: "ask", type: "user_question", label: "質問を1つしてみる" },
    ],
    intro:
      "ついにオフ会の日。会場の隅、開始まで10分。同じくぽつんとしている咲良が、ちらっとこちらを見ている。声をかけるか、待つか。",
  },
  {
    id: "day17_cafe_reunion",
    day: 7,
    title: "カフェで咲良と再会",
    learningGoal: "前に話した人ともう一度。覚えていてくれることを信じる。",
    sceneId: "sakura_cafe",
    minTurns: 4,
    tips: [
      "「あのときはどうも」から始めれば自然",
      "前回の話題を一つ覚えていれば持ち出してみる",
      "覚えてくれていなくても気にしない、初対面と思って大丈夫",
    ],
    goals: [
      {
        id: "warm_up",
        type: "joy_above",
        threshold: 0.35,
        label: "相手の喜びを 35% 以上まで上げる",
      },
      {
        id: "share",
        type: "user_self_disclosure",
        label: "自分のことを一文だけ話す",
      },
    ],
    intro:
      "あれから3日後、駅前のカフェで偶然咲良に会う。少し顔を覚えてくれている様子。前回の続きから、もう一歩。",
  },
  {
    id: "day21_senpai",
    day: 8,
    title: "苦手な先輩への返事",
    learningGoal: "結論を先に。理由は1〜2文で。",
    sceneId: "senpai_ask",
    minTurns: 3,
    tips: [
      "結論ファースト：「やります」「難しいです」を先に",
      "理由は1〜2文で簡潔に",
      "曖昧に「考えておきます」と言わない、はっきり",
    ],
    goals: [
      {
        id: "concise",
        type: "user_short_reply",
        threshold: 25,
        label: "結論を25文字以内で言い切る",
      },
    ],
    intro:
      "田中先輩がやってきた。例の件の返事を、待っている顔つき。今度は曖昧にぼかさず、結論から。",
  },
  {
    id: "day25_interview",
    day: 9,
    title: "面接控室",
    learningGoal: "プレッシャー下でも、緊張を共有する一言で十分。",
    sceneId: "job_interview",
    minTurns: 4,
    tips: [
      "「緊張しますよね」と緊張を共有する",
      "業界・志望動機の話で少し深掘る",
      "馴れ馴れしくしない、丁寧めの敬語で",
    ],
    goals: [
      {
        id: "calm_them",
        type: "anxiety_below",
        threshold: 0.4,
        label: "相手の不安を 40% 以下に",
      },
      { id: "ask", type: "user_question", label: "質問を1つする" },
    ],
    intro:
      "面接入室まで3分。控室で他の応募者と二人きり。沈黙が続いている。ここで一言かけられたら、本番が少し楽になる。",
  },
  {
    id: "day28_initiate",
    day: 10,
    title: "自分から雑談を始める",
    learningGoal: "受けるだけじゃなく、こちらから一言かけてみる。",
    sceneId: "team_initiate",
    minTurns: 4,
    tips: [
      "「最近どう？」「ちょっと聞いていい？」が万能",
      "話題は当たり障りない天気・週末・最近見たものでいい",
      "失敗しても気にしない相手、思い切って声をかける",
    ],
    goals: [
      {
        id: "initiate",
        type: "user_initiated",
        label: "自分から最初の一言を出す",
      },
    ],
    intro:
      "ゆきが一人で作業している。今日は声をかけられるのを待つ側じゃなく、こっちから話しかけてみる番。",
  },
  {
    id: "day30_reflection",
    day: 11,
    title: "1ヶ月の振り返り",
    learningGoal: "ここまで来たら、もう Qhat を卒業して大丈夫。",
    sceneId: "",
    minTurns: 0,
    tips: [],
    kind: "reflection",
  },
];

export function getEpisode(id: string): StoryEpisode | undefined {
  return STORY_EPISODES.find((e) => e.id === id);
}

export function getEpisodeByScene(sceneId: string): StoryEpisode | undefined {
  return STORY_EPISODES.find((e) => e.sceneId === sceneId);
}

// Given the set of completed episode ids, find the next one the user should
// play. Returns the first uncompleted episode in order, or undefined if all
// are done (graduation).
export function nextEpisode(completed: Set<string>): StoryEpisode | undefined {
  return STORY_EPISODES.find((e) => !completed.has(e.id));
}

// Day N is "unlocked" when every prior episode in the list has been
// completed. We don't lock by absolute day number so reordering or
// inserting episodes later won't break saves.
export function isUnlocked(
  episodeId: string,
  completed: Set<string>
): boolean {
  for (const e of STORY_EPISODES) {
    if (e.id === episodeId) return true;
    if (!completed.has(e.id)) return false;
  }
  return false;
}

// Per-character graduation. The conceit: once every episode featuring a
// given partner has been completed, the user can "普通に話せる関係" with
// that person — a smaller, character-level卒業 alongside the global
// 30-day arc. Returns null when the character has fewer than 2 episodes
// (a single-episode partner can't really "graduate"; that's just a
// one-off practice).
export function characterGraduationStatus(
  characterId: string,
  episodeToScene: (sceneId: string) => string | undefined,
  completed: Set<string>
): { total: number; done: number; graduated: boolean } | null {
  const episodes = STORY_EPISODES.filter((e) => {
    if (e.kind === "reflection" || !e.sceneId) return false;
    return episodeToScene(e.sceneId) === characterId;
  });
  if (episodes.length < 2) return null;
  const done = episodes.filter((e) => completed.has(e.id)).length;
  return {
    total: episodes.length,
    done,
    graduated: done === episodes.length,
  };
}
