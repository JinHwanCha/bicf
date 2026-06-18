"use client";

import { useCallback, useEffect, useState } from "react";
import type { KoreanLevel } from "@/lib/types";

interface BoardMember {
  id: string;
  name: string;
  level?: KoreanLevel | null;
}

interface BoardGroup {
  id: string;
  name: string;
  isBasic: boolean;
  level: KoreanLevel | null;
  teachers: BoardMember[];
  students: BoardMember[];
}

interface Board {
  semester: string;
  weekLabel: string;
  generatedAt: string | null;
  hasSession: boolean;
  groups: BoardGroup[];
}

export default function GroupsPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetch("/api/board", { cache: "no-store" }).then((r) =>
        r.json()
      );
      setBoard(data);
    } catch {
      /* ignore transient errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // auto-refresh so late arrivals appear without manual reload
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const generatedLabel = board?.generatedAt
    ? new Date(board.generatedAt).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="container">
      <div className="hero">
        <h1>조 편성 결과</h1>
        <p className="muted">
          {board ? `${board.semester}` : "로딩 중…"}
          {generatedLabel ? ` · ${generatedLabel} 편성` : ""}
        </p>
        {board?.weekLabel && <div className="weekpill">{board.weekLabel}</div>}
      </div>

      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="muted">15초마다 자동 새로고침됩니다.</span>
        <button className="ghost small" onClick={load}>
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="card">
          <p className="muted">로딩 중…</p>
        </div>
      ) : !board?.hasSession || board.groups.length === 0 ? (
        <div className="card">
          <div className="banner info">
            아직 조 편성 전입니다. 편성이 완료되면 이 화면에 조가 표시됩니다.
          </div>
        </div>
      ) : (
        <div className="card">
          <h2>{board.groups.length}개 조</h2>
          <div className="groups-grid">
            {board.groups.map((g) => (
              <div
                key={g.id}
                className={`group-card ${g.isBasic ? "basic" : ""}`}
              >
                <h4>
                  <span>{g.name}</span>
                  {g.level && <span className="tag">{g.level}</span>}
                </h4>
                <ul>
                  {g.teachers.map((t) => (
                    <li key={t.id}>
                      <span className="tag teacher">선생님</span> {t.name}
                    </li>
                  ))}
                  {g.students.map((s) => (
                    <li key={s.id}>
                      {s.name}{" "}
                      {s.level && (
                        <span className={`tag lvl-${s.level}`}>{s.level}</span>
                      )}
                    </li>
                  ))}
                  {g.teachers.length === 0 && g.students.length === 0 && (
                    <li className="muted">비어 있음</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
