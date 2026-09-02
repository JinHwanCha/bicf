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
  const [numGroups, setNumGroups] = useState(4);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

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
  }, [load]);

  async function generate() {
    setBusy(true);
    setNotice("");
    try {
      await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", numGroups }),
      });
      await load();
      setNotice("조 편성을 완료했습니다.");
    } catch {
      setNotice("조 편성 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

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

      <div className="card">
        {notice && <div className="banner info">{notice}</div>}
        <div
          className="row"
          style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}
        >
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="numGroups">조 개수 (1~10)</label>
            <select
              id="numGroups"
              value={numGroups}
              onChange={(e) => setNumGroups(Number(e.target.value))}
              style={{ width: 120 }}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}개
                </option>
              ))}
            </select>
          </div>
          <button onClick={generate} disabled={busy}>
            {busy ? "편성 중…" : "🎲 조 편성하기"}
          </button>
          <button className="ghost small" onClick={load} disabled={busy}>
            새로고침
          </button>
        </div>
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          ‘조 편성하기’를 누를 때마다 현재 출석 인원으로 다시 편성됩니다. 기초반
          선택자는 자동으로 따로 편성되고, 각 조에는 선생님과 학생이 최소 1명씩
          최대한 고르게 배정됩니다.
        </p>
      </div>

      {loading ? (
        <div className="card">
          <p className="muted">로딩 중…</p>
        </div>
      ) : !board?.hasSession || board.groups.length === 0 ? (
        <div className="card">
          <div className="banner info">
            아직 조 편성 전입니다. 위의 ‘조 편성하기’ 버튼을 눌러주세요.
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
