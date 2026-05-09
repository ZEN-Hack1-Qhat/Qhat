import type { Scene } from "./types";

export const SCENES: Scene[] = [
  // ---------- Story Arc: Days 1–10 (training wheels) ----------
  {
    id: "convenience_store",
    title: "コンビニで一言",
    description:
      "近所のコンビニ。レジに並んでいる。森野さんが落ち着いた様子で会計してくれる。",
    socialPressure:
      "業務上のやり取り。長く話す必要はない。一言挨拶できれば十分。沈黙でも問題ない、超低圧シーン。",
    characterId: "clerk_morino",
    durationMin: 1,
    difficulty: 1,
    initialEmotion: { joy: 0.15, calm: 0.6, anxiety: 0.15, confusion: 0.1 },
    openingLine: "いらっしゃいませ。",
  },
  {
    id: "bus_stop_morning",
    title: "バス停で短く反応する",
    description:
      "朝のバス停。同年代の海斗が同じくバスを待っている。軽く会釈してきた。",
    socialPressure:
      "他人同士。話さなくても問題ないが、相手から軽く話しかけられた。短く返せれば十分。",
    characterId: "bus_kaito",
    durationMin: 2,
    difficulty: 1,
    initialEmotion: { joy: 0.1, calm: 0.45, anxiety: 0.3, confusion: 0.15 },
    openingLine: "あ、おはようございます。",
  },
  {
    id: "bus_stop_echo",
    title: "バス停でオウム返し",
    description:
      "またバス停で海斗と一緒になった。今日は少しだけ会話が続きそうな空気。",
    socialPressure:
      "前回より少し打ち解けた距離感。相手の言葉から一つ拾って返すだけで十分。",
    characterId: "bus_kaito",
    durationMin: 2,
    difficulty: 1,
    initialEmotion: { joy: 0.18, calm: 0.42, anxiety: 0.25, confusion: 0.15 },
    openingLine: "あ、また一緒ですね。今日も寒いですね。",
  },
  {
    id: "team_one_question",
    title: "同期に一問質問する",
    description:
      "同じクラス／職場のゆき。フランクな同年代。気軽に話しかけてきた。",
    socialPressure:
      "対等な関係。プレッシャーは低い。短くてもいいので、最後に一問質問してみる。",
    characterId: "team_yuki",
    durationMin: 3,
    difficulty: 1,
    initialEmotion: { joy: 0.32, calm: 0.45, anxiety: 0.13, confusion: 0.1 },
    openingLine: "あ、おはよ。今日もよろしくね。",
  },
  {
    id: "team_recovery",
    title: "詰まったときの言葉",
    description:
      "ゆきとの雑談中。少し込み入った話を振られて、答えに詰まりそうになる。",
    socialPressure:
      "詰まっても問題ない相手。言葉に詰まったときに「うまく言えないんですが」「ちょっと考えてました」と正直に言える練習。",
    characterId: "team_yuki",
    durationMin: 3,
    difficulty: 1,
    initialEmotion: { joy: 0.25, calm: 0.4, anxiety: 0.25, confusion: 0.1 },
    openingLine: "ねぇ、ちょっと聞いていい？最近どんな感じ？",
  },
  {
    id: "kanto_offline",
    title: "関東オフ会、開始10分前",
    description:
      "会場の隅に立っているあなた。同じくぽつんとしている咲良が、ちらちらこちらを見ている。声をかけてみる？",
    socialPressure:
      "オフ会開始まで10分。会場の隅、自由参加なので無理に話さなくてもいいが、ここで話せれば本番で楽になる。お互い初対面で、距離感を間違えると気まずい。",
    characterId: "sakura",
    durationMin: 5,
    difficulty: 1,
    initialEmotion: { joy: 0.18, calm: 0.22, anxiety: 0.42, confusion: 0.18 },
    openingLine: "あ……こんにちは。",
  },
  {
    id: "job_interview",
    title: "就活面接、入室3分前",
    description:
      "控室で他の就活生と二人きり。沈黙が続く。話しかけて気持ちをほぐすか、黙って待つか。",
    socialPressure:
      "面接入室まで3分。控室には他の応募者と二人きり。完全な沈黙は気まずいが、面接直前なので深い話に踏み込みすぎるのも避けたい。短く、穏やかに、緊張を共有できる距離感がベスト。",
    characterId: "takahashi",
    durationMin: 5,
    difficulty: 2,
    initialEmotion: { joy: 0.1, calm: 0.35, anxiety: 0.4, confusion: 0.15 },
    openingLine: "あ……えっと、お疲れ様です。",
  },
  {
    id: "sakura_cafe",
    title: "カフェで咲良と再会",
    description:
      "オフ会で会った咲良と、後日カフェで偶然再会。少し顔を覚えてくれていた様子。",
    socialPressure:
      "前に話した相手との再会。「あのときはどうも」みたいな一言から、関係を続ける練習。長く話す必要はない。",
    characterId: "sakura",
    durationMin: 5,
    difficulty: 2,
    initialEmotion: { joy: 0.3, calm: 0.4, anxiety: 0.2, confusion: 0.1 },
    openingLine: "あ……この前の。覚えてますか？",
  },
  {
    id: "senpai_ask",
    title: "苦手な先輩への返事",
    description:
      "先輩から頼まれた件、返事をしないといけない。気は使ってくれるけど、なんとなく合わない人。",
    socialPressure:
      "先輩は返事を待っていて、その場の主導権は先輩側にある。テンポは速め、結論ファーストが期待されている。曖昧な返事や言い訳の長さは『歯切れ悪いね』とつつかれる。断る場合もはっきりが望ましい。",
    characterId: "tanaka",
    durationMin: 3,
    difficulty: 3,
    initialEmotion: { joy: 0.05, calm: 0.4, anxiety: 0.3, confusion: 0.25 },
    openingLine: "おう、お疲れ。例の件、どう？",
  },
  {
    id: "team_initiate",
    title: "自分から雑談を始める",
    description:
      "ゆきと同じ空間にいる。今日はこちらから話しかけてみる番。",
    socialPressure:
      "相手から話しかけられるのを待つのではなく、自分から一言かけてみる。フランクな相手なので失敗しても受け止めてくれる。",
    characterId: "team_yuki",
    durationMin: 3,
    difficulty: 2,
    initialEmotion: { joy: 0.28, calm: 0.5, anxiety: 0.15, confusion: 0.07 },
    openingLine: "（ゆきは作業中。こちらから声をかけてみる場面）",
  },
];

export function getScene(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}
