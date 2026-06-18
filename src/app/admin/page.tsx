"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LEVELS,
  type AttendanceRecord,
  type GroupSession,
  type KoreanLevel,
  type Person,
  type Settings,
  type Week,
} from "@/lib/types";

type Tab = "groups" | "attendance" | "people" | "settings";

/** Extract the "N월" month label from a week label like "9월 2주차". */
function monthOf(label: string): string {
  const m = label.match(/(\d+)\s*월/);
  return m ? `${m[1]}월` : "기타";
}

/** Inline-editable name cell: click to edit, Enter/blur to save, Esc to cancel. */
function EditableName({
  value,
  onSave,
}: {
  value: string;
  onSave: (name: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      await onSave(trimmed);
    } else {
      setDraft(value);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="name-cell"
        title="클릭하여 이름 수정"
        onClick={() => setEditing(true)}
      >
        {value} ✎
      </button>
    );
  }

  return (
    <input
      type="text"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      style={{ width: 150 }}
    />
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("groups");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [session, setSession] = useState<GroupSession | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, p, a, g] = await Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/people").then((r) => r.json()),
      fetch("/api/attendance").then((r) => r.json()),
      fetch("/api/groups").then((r) => r.json()),
    ]);
    setSettings(s);
    setPeople(p);
    setAttendance(a);
    setSession(g);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const personById = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of people) m.set(p.id, p);
    return m;
  }, [people]);

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  }

  if (!settings) {
    return (
      <div className="container">
        <p className="muted">로딩 중…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1 style={{ marginTop: 0 }}>관리자</h1>
      {message && <div className="banner info">{message}</div>}

      <div className="tabs">
        <button
          className={tab === "groups" ? "active" : ""}
          onClick={() => setTab("groups")}
        >
          조 편성
        </button>
        <button
          className={tab === "attendance" ? "active" : ""}
          onClick={() => setTab("attendance")}
        >
          출석 현황
        </button>
        <button
          className={tab === "people" ? "active" : ""}
          onClick={() => setTab("people")}
        >
          인원 관리
        </button>
        <button
          className={tab === "settings" ? "active" : ""}
          onClick={() => setTab("settings")}
        >
          설정
        </button>
      </div>

      {tab === "groups" && (
        <GroupsTab
          settings={settings}
          people={people}
          attendance={attendance}
          session={session}
          personById={personById}
          busy={busy}
          setBusy={setBusy}
          onChange={load}
          flash={flash}
        />
      )}
      {tab === "attendance" && (
        <AttendanceTab
          settings={settings}
          people={people}
          attendance={attendance}
        />
      )}
      {tab === "people" && (
        <PeopleTab people={people} onChange={load} flash={flash} />
      )}
      {tab === "settings" && (
        <SettingsTab settings={settings} onSaved={load} flash={flash} />
      )}
    </div>
  );
}

/* ------------------------------- 조 편성 ------------------------------- */

function GroupsTab({
  settings,
  people,
  attendance,
  session,
  personById,
  busy,
  setBusy,
  onChange,
  flash,
}: {
  settings: Settings;
  people: Person[];
  attendance: AttendanceRecord[];
  session: GroupSession | null;
  personById: Map<string, Person>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onChange: () => Promise<void>;
  flash: (m: string) => void;
}) {
  const weekLabel =
    settings.weeks.find((w) => w.id === settings.currentWeekId)?.label ??
    settings.currentWeekId;

  const attendeeIds = useMemo(
    () =>
      attendance
        .filter(
          (a) =>
            a.weekId === settings.currentWeekId &&
            a.semester === settings.semester
        )
        .map((a) => a.personId),
    [attendance, settings]
  );

  const attendeeCount = attendeeIds.length;
  const assignedCount = session?.assignedPersonIds.length ?? 0;
  const unassigned = attendeeCount - assignedCount;

  async function run(action: "generate" | "assignLate") {
    setBusy(true);
    try {
      await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await onChange();
      flash(
        action === "generate"
          ? "랜덤 조 편성을 완료했습니다."
          : `추가 배치를 완료했습니다.`
      );
    } finally {
      setBusy(false);
    }
  }

  const basicTeachers = people.filter((p) => p.isTeacher && p.isBasicTeacher);

  return (
    <>
      <div className="card">
        <h2>{weekLabel} 조 편성</h2>
        <div className="stat-row" style={{ marginBottom: 16 }}>
          <div className="stat">
            <div className="num">{attendeeCount}</div>
            <div className="lbl">현재 출석 인원</div>
          </div>
          <div className="stat">
            <div className="num">{assignedCount}</div>
            <div className="lbl">배치 완료</div>
          </div>
          <div className="stat">
            <div className="num">{unassigned > 0 ? unassigned : 0}</div>
            <div className="lbl">미배치 (지각 도착)</div>
          </div>
        </div>

        {basicTeachers.length === 0 && (
          <div className="banner info">
            기초반 선생님이 아직 지정되지 않았습니다. ‘인원 관리’ 탭에서 선생님을
            기초반으로 지정할 수 있어요.
          </div>
        )}

        <div className="row">
          <button onClick={() => run("generate")} disabled={busy}>
            🎲 1차 랜덤 조 편성 ({settings.signupDeadline} 기준)
          </button>
          <button
            className="ghost"
            onClick={() => run("assignLate")}
            disabled={busy || !session}
          >
            ➕ 지각 도착자 추가 배치
          </button>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          1차 편성은 마감 시간까지 출석한 인원을 랜덤 배치합니다. 이후 도착한
          인원은 ‘추가 배치’로 기존 조에 합류시킵니다.
        </p>
      </div>

      {session ? (
        <div className="card">
          <h2>편성 결과 ({session.groups.length}개 조)</h2>
          <div className="groups-grid">
            {session.groups.map((g) => (
              <div
                key={g.id}
                className={`group-card ${g.isBasic ? "basic" : ""}`}
              >
                <h4>
                  <span>{g.name}</span>
                  <span className="tag">{g.level ?? "-"}</span>
                </h4>
                <ul>
                  {g.teacherIds.map((id) => {
                    const p = personById.get(id);
                    return (
                      <li key={id}>
                        <span className="tag teacher">선생님</span> {p?.name ?? id}
                      </li>
                    );
                  })}
                  {g.studentIds.map((id) => {
                    const p = personById.get(id);
                    return (
                      <li key={id}>
                        {p?.name ?? id}{" "}
                        <span className={`tag lvl-${p?.level}`}>
                          {p?.level}
                        </span>
                      </li>
                    );
                  })}
                  {g.teacherIds.length === 0 && g.studentIds.length === 0 && (
                    <li className="muted">비어 있음</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted">
            아직 편성된 조가 없습니다. 위의 ‘1차 랜덤 조 편성’ 버튼을 눌러주세요.
          </p>
        </div>
      )}
    </>
  );
}

/* ------------------------------ 출석 현황 ------------------------------ */

function AttendanceTab({
  settings,
  people,
  attendance,
}: {
  settings: Settings;
  people: Person[];
  attendance: AttendanceRecord[];
}) {
  const semesterRecords = attendance.filter(
    (a) => a.semester === settings.semester
  );

  const attendedSet = useMemo(() => {
    const m = new Set<string>(); // `${personId}::${weekId}`
    for (const a of semesterRecords) m.add(`${a.personId}::${a.weekId}`);
    return m;
  }, [semesterRecords]);

  const totalWeeks = settings.weeks.length || 1;
  const students = people.filter((p) => !p.isTeacher);
  const teachers = people.filter((p) => p.isTeacher);

  // Months present in the week list, in their original order.
  const months = useMemo(() => {
    const seen: string[] = [];
    for (const w of settings.weeks) {
      const mo = monthOf(w.label);
      if (!seen.includes(mo)) seen.push(mo);
    }
    return seen;
  }, [settings.weeks]);

  const currentMonth = monthOf(
    settings.weeks.find((w) => w.id === settings.currentWeekId)?.label ?? ""
  );

  // "전체" shows all weeks; otherwise only the selected month's weeks.
  const [monthFilter, setMonthFilter] = useState<string>(
    months.includes(currentMonth) ? currentMonth : "전체"
  );

  const visibleWeeks =
    monthFilter === "전체"
      ? settings.weeks
      : settings.weeks.filter((w) => monthOf(w.label) === monthFilter);

  const currentWeekCount = semesterRecords.filter(
    (a) => a.weekId === settings.currentWeekId
  ).length;

  // Attendance rate over the currently visible weeks (selected month or all).
  function rate(personId: string): number {
    const denom = visibleWeeks.length || 1;
    const attended = visibleWeeks.filter((w) =>
      attendedSet.has(`${personId}::${w.id}`)
    ).length;
    return Math.round((attended / denom) * 100);
  }

  const sorted = [...people].sort((a, b) => {
    if (a.isTeacher !== b.isTeacher) return a.isTeacher ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      <div className="card">
        <h2>{settings.semester} 출석 통계</h2>
        <div className="stat-row">
          <div className="stat">
            <div className="num">{students.length}</div>
            <div className="lbl">등록 학생</div>
          </div>
          <div className="stat">
            <div className="num">{teachers.length}</div>
            <div className="lbl">등록 선생님</div>
          </div>
          <div className="stat">
            <div className="num">{currentWeekCount}</div>
            <div className="lbl">이번 주 출석</div>
          </div>
          <div className="stat">
            <div className="num">{totalWeeks}</div>
            <div className="lbl">전체 주차</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>출석부</h2>
        {people.length === 0 ? (
          <p className="muted">아직 등록된 인원이 없습니다.</p>
        ) : (
          <>
            {months.length > 1 && (
              <div className="tabs" style={{ marginBottom: 16 }}>
                <button
                  className={monthFilter === "전체" ? "active" : ""}
                  onClick={() => setMonthFilter("전체")}
                >
                  전체
                </button>
                {months.map((mo) => (
                  <button
                    key={mo}
                    className={monthFilter === mo ? "active" : ""}
                    onClick={() => setMonthFilter(mo)}
                  >
                    {mo}
                  </button>
                ))}
              </div>
            )}
            <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
              {monthFilter === "전체"
                ? `전체 ${visibleWeeks.length}개 주차 · 출석률은 전체 기준`
                : `${monthFilter} ${visibleWeeks.length}개 주차 · 출석률은 ${monthFilter} 기준`}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>구분</th>
                    <th>수준</th>
                    {visibleWeeks.map((w) => (
                      <th key={w.id}>{w.label}</th>
                    ))}
                    <th>출석률</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>
                        {p.isTeacher ? (
                          <span className="tag teacher">선생님</span>
                        ) : (
                          <span className="tag">학생</span>
                        )}
                      </td>
                      <td>
                        <span className={`tag lvl-${p.level}`}>{p.level}</span>
                      </td>
                      {visibleWeeks.map((w) => (
                        <td key={w.id}>
                          {attendedSet.has(`${p.id}::${w.id}`) ? (
                            <span className="check">●</span>
                          ) : (
                            <span className="dash">—</span>
                          )}
                        </td>
                      ))}
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <div className="rate-bar">
                            <div style={{ width: `${rate(p.id)}%` }} />
                          </div>
                          <span>{rate(p.id)}%</span>
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------ 인원 관리 ------------------------------ */

function PeopleTab({
  people,
  onChange,
  flash,
}: {
  people: Person[];
  onChange: () => Promise<void>;
  flash: (m: string) => void;
}) {
  async function patch(id: string, body: Partial<Person>) {
    await fetch("/api/people", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    await onChange();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`${name} 님을 삭제할까요? 출석 기록도 함께 삭제됩니다.`)) return;
    await fetch(`/api/people?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await onChange();
    flash("삭제했습니다.");
  }

  const sorted = [...people].sort((a, b) => {
    if (a.isTeacher !== b.isTeacher) return a.isTeacher ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="card">
      <h2>인원 관리</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        선생님의 ‘기초반’ 체크를 켜면 자동 편성 시 기초반에 배치됩니다.
      </p>
      {people.length === 0 ? (
        <p className="muted">아직 등록된 인원이 없습니다.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>전화 뒷4</th>
                <th>수준</th>
                <th>선생님</th>
                <th>기초반</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id}>
                  <td>
                    <EditableName
                      value={p.name}
                      onSave={async (name) => {
                        await patch(p.id, { name });
                        flash(`이름을 '${name}'(으)로 변경했습니다.`);
                      }}
                    />
                  </td>
                  <td className="muted">{p.phoneLast4}</td>
                  <td>
                    <select
                      value={p.level}
                      onChange={(e) =>
                        patch(p.id, { level: e.target.value as KoreanLevel })
                      }
                      style={{ width: 90 }}
                    >
                      {LEVELS.map((lv) => (
                        <option key={lv} value={lv}>
                          {lv}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.isTeacher}
                      onChange={(e) =>
                        patch(p.id, { isTeacher: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      disabled={!p.isTeacher}
                      checked={p.isBasicTeacher}
                      onChange={(e) =>
                        patch(p.id, { isBasicTeacher: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="danger"
                      onClick={() => remove(p.id, p.name)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- 설정 -------------------------------- */

function SettingsTab({
  settings,
  onSaved,
  flash,
}: {
  settings: Settings;
  onSaved: () => Promise<void>;
  flash: (m: string) => void;
}) {
  const [semester, setSemester] = useState(settings.semester);
  const [currentWeekId, setCurrentWeekId] = useState(settings.currentWeekId);
  const [signupDeadline, setSignupDeadline] = useState(settings.signupDeadline);
  const [classTime, setClassTime] = useState(settings.classTime);
  const [weeks, setWeeks] = useState<Week[]>(settings.weeks);
  const [newMonth, setNewMonth] = useState<number>(9);
  const [saving, setSaving] = useState(false);

  function updateWeekLabel(id: string, label: string) {
    setWeeks((ws) => ws.map((w) => (w.id === id ? { ...w, label } : w)));
  }
  function addWeek() {
    setWeeks((ws) => {
      const last = ws[ws.length - 1];
      const mo = last?.label.match(/(\d+)\s*월/)?.[1] ?? "";
      const moCount = ws.filter(
        (w) => w.label.match(/(\d+)\s*월/)?.[1] === mo
      ).length;
      const id = `w${Date.now().toString(36)}`;
      const label = mo ? `${mo}월 ${moCount + 1}주차` : `${ws.length + 1}주차`;
      return [...ws, { id, label }];
    });
  }
  function addMonth(month: number) {
    const base = Date.now().toString(36);
    setWeeks((ws) => [
      ...ws,
      ...[1, 2, 3, 4].map((n, i) => ({
        id: `w${base}${i}`,
        label: `${month}월 ${n}주차`,
      })),
    ]);
  }
  function removeWeek(id: string) {
    setWeeks((ws) => ws.filter((w) => w.id !== id));
    if (currentWeekId === id) {
      const remaining = weeks.filter((w) => w.id !== id);
      if (remaining[0]) setCurrentWeekId(remaining[0].id);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semester,
          currentWeekId,
          signupDeadline,
          classTime,
          weeks,
        }),
      });
      await onSaved();
      flash("설정을 저장했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h2>학기 / 주차 설정</h2>

      <div className="row">
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label>학기</label>
          <input
            type="text"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>현재 주차</label>
          <select
            value={currentWeekId}
            onChange={(e) => setCurrentWeekId(e.target.value)}
          >
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>신청 마감 (랜덤 편성 시각)</label>
          <input
            type="time"
            value={signupDeadline}
            onChange={(e) => setSignupDeadline(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>수업 시작</label>
          <input
            type="time"
            value={classTime}
            onChange={(e) => setClassTime(e.target.value)}
          />
        </div>
      </div>

      <h3 style={{ marginTop: 14 }}>주차 목록</h3>
      {weeks.map((w, i) => {
        const mo = w.label.match(/(\d+)\s*월/)?.[0] ?? "기타";
        const prevMo =
          i > 0 ? weeks[i - 1].label.match(/(\d+)\s*월/)?.[0] ?? "기타" : null;
        const showHeader = mo !== prevMo;
        return (
          <div key={w.id}>
            {showHeader && (
              <div
                className="muted"
                style={{ marginTop: 12, marginBottom: 6, fontWeight: 700 }}
              >
                {mo}
              </div>
            )}
            <div className="row" style={{ marginBottom: 10 }}>
              <input
                type="text"
                value={w.label}
                onChange={(e) => updateWeekLabel(w.id, e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="danger"
                onClick={() => removeWeek(w.id)}
                disabled={weeks.length <= 1}
              >
                삭제
              </button>
            </div>
          </div>
        );
      })}

      <div className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
        <button className="ghost small" onClick={addWeek}>
          + 주차 추가
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            inputMode="numeric"
            value={newMonth}
            onChange={(e) =>
              setNewMonth(Number(e.target.value.replace(/\D/g, "")) || 0)
            }
            style={{ width: 64 }}
            aria-label="추가할 월"
          />
          <span className="muted">월</span>
          <button
            className="ghost small"
            onClick={() => newMonth && addMonth(newMonth)}
          >
            + 해당 월 4주차 추가
          </button>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <button onClick={save} disabled={saving}>
          {saving ? "저장 중…" : "설정 저장"}
        </button>
      </div>
    </div>
  );
}
