"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/lib/types";
import { CHARACTERS } from "@/lib/characters";
import { EMOTION_TAG, EMOTION_COLOR } from "@/lib/emotion";

export function ConversationLog({ messages }: { messages: Message[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 space-y-4"
    >
      {messages.map((m) => (
        <div key={m.id}>
          {m.role === "user" ? (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-ink text-paper px-4 py-2 font-mincho text-sm">
                {m.text}
              </div>
            </div>
          ) : (
            <div className={`flex justify-start ${m.proactive ? "border-l-2 border-gold pl-3" : ""}`}>
              <div className="max-w-[85%]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mincho text-ink-soft">
                    {m.speaker ? CHARACTERS[m.speaker].name : "相手"}
                  </span>
                  {m.dominant && (
                    <span
                      className="text-[10px] mono px-1.5 py-0.5 rounded"
                      style={{
                        background: EMOTION_COLOR[m.dominant] + "22",
                        color: EMOTION_COLOR[m.dominant],
                      }}
                    >
                      {EMOTION_TAG[m.dominant]}
                    </span>
                  )}
                  {m.proactive && (
                    <span className="text-[10px] label-en text-gold">
                      ↪ 向こうから
                    </span>
                  )}
                  {m.expanded && (
                    <span className="text-[10px] label-en text-gold">
                      ↳ 話題を広げてくれた
                    </span>
                  )}
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-white border border-line px-4 py-2 font-mincho text-sm">
                  {m.text}
                </div>
                {m.receptionSummary && (
                  <p className="mt-1 text-[11px] text-ink-pale font-mincho italic">
                    — {m.receptionSummary}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
