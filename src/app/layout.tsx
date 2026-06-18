import type { Metadata } from "next";
import Link from "next/link";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "출석체크 · 반별 분류",
  description: "외국인 유학생 한국어반 출석 및 자동 조 편성",
};

// Apply the saved theme before first paint to avoid a color flash.
const themeInitScript = `(function(){try{var t=localStorage.getItem('bicf-theme');if(t&&t!=='blue'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <nav className="nav">
          <span className="brand">📋 한국어반 출석</span>
          <Link href="/attendance">출석체크</Link>
          <Link href="/groups">조 편성</Link>
          <ThemeSwitcher />
        </nav>
        {children}
      </body>
    </html>
  );
}
