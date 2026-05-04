import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qhat — リハーサルから本番へ",
  description:
    "対人不安を持つ人のための、量子の重ね合わせで感情を可視化する音声対話練習アプリ",
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
