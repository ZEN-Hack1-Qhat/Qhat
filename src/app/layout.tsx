import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qhat — リハーサルから本番へ",
  description:
    "対人不安を持つ人のための、量子の重ね合わせで感情を可視化する音声対話練習アプリ",
};

// Lock the viewport scale on iPhone Safari. Without this, tapping a text
// input triggers a zoom-in (because input font-size < 16px), and the layout
// snaps sideways — that "勝手にスライドする" sensation. `viewportFit: cover`
// also lets the safe-area insets reach the screen edges so the BottomNav
// can hug the bottom without an awkward gap.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-paper text-ink">{children}</body>
    </html>
  );
}
