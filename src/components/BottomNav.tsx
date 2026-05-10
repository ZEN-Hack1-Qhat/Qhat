"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "ホーム", icon: "💬" },
  { href: "/history", label: "履歴", icon: "🕘" },
  { href: "/analysis", label: "分析", icon: "📊" },
  { href: "/profile", label: "プロフィール", icon: "👤" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    // Anchored tab bar — flush with the viewport bottom so the entire bottom
    // strip of the screen is tappable. Previously the bar floated with a
    // 10px gap above the safe area, and any tap landing in that gap (or in
    // the home-indicator zone) hit nothing, which read as "押すのが上に感じる".
    // Now safe-area-inset-bottom is absorbed as inner padding, so the visual
    // content stays clear of the home indicator while the tap surface
    // extends to the screen edge.
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 mx-auto grid max-w-[430px] grid-cols-4 border-t border-black/5 bg-white/98 px-1 pt-1.5 shadow-[0_-4px_22px_rgba(0,0,0,0.07)] backdrop-blur"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)",
      }}
    >
      {ITEMS.map(({ href, label, icon }) => {
        // Home matches "/" exactly; other tabs match their prefix so deeper
        // routes (e.g. /history/abc) still highlight the right tab.
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            // flex column fills the grid cell so the entire button — including
            // the safe-area padding region below the label — registers taps.
            className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-[14px] text-[11px] font-bold transition active:bg-black/[0.05] ${
              active ? "text-[#efb128]" : "text-[#9a938b]"
            }`}
            style={{
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span className="text-[22px] leading-none">{icon}</span>
            <span className="leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
