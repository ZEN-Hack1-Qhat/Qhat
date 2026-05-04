import Link from "next/link";
import { SCENES } from "@/lib/scenes";
import { CHARACTERS } from "@/lib/characters";

const STARS = ["", "★☆☆", "★★☆", "★★★"];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-8 py-16">
      <header className="mb-16">
        <p className="label-en text-sm">Qhat</p>
        <h1 className="font-mincho text-5xl font-bold tracking-wide">
          Qhat
        </h1>
        <p className="mt-3 text-ink-soft text-lg font-mincho">
          リハーサルから本番へ。
        </p>
        <p className="mt-1 text-ink-pale text-sm">
          相手の感情は、観測されるまで重ね合わせのまま。
        </p>
      </header>

      <section className="mb-12">
        <p className="label-en text-xs mb-3">Scenes</p>
        <h2 className="font-mincho text-2xl mb-6">
          今日は、どの場面を練習しますか？
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SCENES.map((s) => {
            const c = CHARACTERS[s.characterId];
            return (
              <Link
                key={s.id}
                href={`/conversation/${s.id}`}
                className="group block rounded-lg border border-line bg-white p-6 transition hover:border-gold hover:shadow-md"
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="h-12 w-12 rounded-full flex items-center justify-center text-white font-mincho text-lg"
                    style={{ background: c.accent }}
                  >
                    {c.name[0]}
                  </div>
                  <span className="label-en text-xs">
                    {STARS[s.difficulty]}
                  </span>
                </div>
                <h3 className="font-mincho text-lg mb-2 group-hover:text-gold transition">
                  {s.title}
                </h3>
                <p className="text-sm text-ink-soft mb-4 leading-relaxed">
                  {s.description}
                </p>
                <div className="flex items-center justify-between text-xs text-ink-pale">
                  <span>
                    相手: {c.name}（{c.age}歳）
                  </span>
                  <span className="label-en">{s.durationMin} min</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="qhat-divider my-16" />

      <section>
        <p className="label-en text-xs mb-3">About</p>
        <div className="grid md:grid-cols-3 gap-8 text-sm text-ink-soft leading-relaxed">
          <div>
            <h3 className="font-mincho text-ink mb-2">
              会話のリハーサル
            </h3>
            本番前に、安全に何度でもやり直せる。
          </div>
          <div>
            <h3 className="font-mincho text-ink mb-2">
              重ね合わせの感情
            </h3>
            相手の感情は喜・安・不・戸の重ね合わせ。観測されてはじめて確定する。
          </div>
          <div>
            <h3 className="font-mincho text-ink mb-2">
              卒業するプロダクト
            </h3>
            使わなくなったら成功。あなたが本番に出ていける日まで。
          </div>
        </div>
      </section>
    </main>
  );
}
