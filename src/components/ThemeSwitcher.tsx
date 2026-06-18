"use client";

import { useEffect, useRef, useState } from "react";

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || "blue";
    setTheme(saved);
    applyTheme(saved);
  }, []);

  // Close the popup on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(id: string) {
    setTheme(id);
    applyTheme(id);
    localStorage.setItem(STORAGE_KEY, id);
    setOpen(false);
  }

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div className="theme-switch" ref={ref}>
      <button
        type="button"
        className="theme-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="테마 색상 선택"
        title="테마 색상 선택"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="swatch-dot"
          style={{ background: current.color }}
          aria-hidden="true"
        />
        <span className="theme-trigger-icon" aria-hidden="true">
          🎨
        </span>
      </button>

      {open && (
        <div className="theme-popup" role="menu" aria-label="테마 색상">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === t.id}
              className={`theme-option ${theme === t.id ? "active" : ""}`}
              onClick={() => choose(t.id)}
            >
              <span
                className="swatch-dot"
                style={{ background: t.color }}
                aria-hidden="true"
              />
              {t.label}
              {theme === t.id && <span className="theme-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
