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
    <nav className="mt-auto grid grid-cols-4 rounded-[24px] border border-black/5 bg-white/90 px-2 py-3 shadow-sm backdrop-blur">
      {ITEMS.map(({ href, label, icon }) => {
        // Home matches "/" exactly; other tabs match their prefix so deeper
        // routes (e.g. /history/abc) still highlight the right tab.
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`text-center text-[11px] font-bold transition ${
              active ? "text-[#efb128]" : "text-[#9a938b] hover:text-[#6c665f]"
            }`}
          >
            <span className="mb-0.5 block text-xl">{icon}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
