"use client";

import { useEffect, useState } from "react";

interface ThemeOption {
  id: string;
  label: string;
  color: string;
}

const THEMES: ThemeOption[] = [
  { id: "blue", label: "다크 블루", color: "#4f7cff" },
  { id: "teal", label: "틸", color: "#16c2a3" },
  { id: "purple", label: "퍼플", color: "#9a6bff" },
  { id: "rose", label: "로즈", color: "#ff5c8a" },
  { id: "charcoal", label: "차콜", color: "#f2994a" },
  { id: "light", label: "라이트", color: "#dfe5f2" },
];

const STORAGE_KEY = "bicf-theme";

function applyTheme(id: string) {
  // "blue" is the default :root palette → no attribute needed.
  if (id === "blue") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", id);
  }
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<string>("blue");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || "blue";
    setTheme(saved);
    applyTheme(saved);
  }, []);

  function choose(id: string) {
    setTheme(id);
    applyTheme(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  return (
    <div className="theme-switch" role="group" aria-label="테마 색상 선택">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          aria-label={t.label}
          aria-pressed={theme === t.id}
          className={`swatch ${theme === t.id ? "active" : ""}`}
          style={{ background: t.color }}
          onClick={() => choose(t.id)}
        />
      ))}
    </div>
  );
}
