import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "M31 Bubble Atlas · 气泡标注台",
  description: "在 PHAT / PHAST 恒星消光图上寻找 M31 气泡，保存天球坐标与椭圆目录。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
