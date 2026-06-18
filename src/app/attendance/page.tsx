"use client";

import { useEffect, useState } from "react";
import { LEVELS, type KoreanLevel, type Settings } from "@/lib/types";

interface CheckInResult {
  person: { id: string; name: string };
  alreadyChecked: boolean;
  semester: string;
  weekLabel: string;
}

export default function AttendancePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [level, setLevel] = useState<KoreanLevel | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  const currentWeek = settings?.weeks.find(
    (w) => w.id === settings.currentWeekId
  );

  async function findMyGroup(personId: string) {
    try {
      const session = await fetch("/api/groups").then((r) => r.json());
      if (!session) {
        setGroupName(null);
        return;
      }
      const g = session.groups.find(
        (grp: { teacherIds: string[]; studentIds: string[]; name: string }) =>
          grp.teacherIds.includes(personId) ||
          grp.studentIds.includes(personId)
      );
      setGroupName(g ? g.name : null);
    } catch {
      setGroupName(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("이름을 입력해 주세요.");
    if (phone.replace(/\D/g, "").length < 4)
      return setError("전화번호 뒷자리 4자리를 입력해 주세요.");
    if (!level) return setError("한국어 수준을 선택해 주세요.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phoneLast4: phone,
          level,
          isTeacher,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "출석 처리에 실패했습니다.");
        return;
      }
      setResult(data);
      void findMyGroup(data.person.id);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResult(null);
    setGroupName(null);
    setName("");
    setPhone("");
    setLevel(null);
    setIsTeacher(false);
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>출석 체크</h1>
        <p className="muted">
          {settings ? `${settings.semester} · 저녁 ${settings.classTime} 수업` : "로딩 중…"}
        </p>
        {currentWeek && <div className="weekpill">{currentWeek.label}</div>}
      </div>

      {result ? (
        <div className="card">
          <div className={`banner ${result.alreadyChecked ? "info" : "success"}`}>
            {result.alreadyChecked
              ? `${result.person.name} 님은 이미 ${result.weekLabel} 출석이 완료되어 있어요.`
              : `${result.person.name} 님, ${result.weekLabel} 출석 완료! 🎉`}
          </div>
          {isTeacher ? (
            <p className="muted">선생님으로 등록되었습니다. 조 편성 후 배정됩니다.</p>
          ) : groupName ? (
            <div className="banner info">
              배정된 조: <strong>{groupName}</strong>
            </div>
          ) : (
            <p className="muted">
              아직 조 편성 전입니다. {settings?.signupDeadline ?? "19:30"} 이후 조가
              편성되면 이 화면에서 확인할 수 있어요.
            </p>
          )}
          <button onClick={reset}>다른 사람 출석하기</button>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}

          <div className="field">
            <label htmlFor="name">이름 (Name)</label>
            <input
              id="name"
              type="text"
              placeholder="이름을 입력하세요 / Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="phone">전화번호 뒷자리 4개 (Phone last 4)</label>
            <input
              id="phone"
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="예: 1234"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label>한국어 수준 (Korean level) · 1개 선택</label>
            <div className="chips">
              {LEVELS.map((lv) => (
                <div
                  key={lv}
                  className={`chip ${level === lv ? "active" : ""}`}
                  onClick={() => setLevel(lv)}
                >
                  {lv}
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={isTeacher}
                onChange={(e) => setIsTeacher(e.target.checked)}
              />
              저는 한국어반 선생님입니다 (I'm a teacher)
            </label>
          </div>

          <button type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "처리 중…" : "출석 체크하기"}
          </button>
        </form>
      )}
    </div>
  );
}
