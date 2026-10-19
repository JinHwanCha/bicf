"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Gender = "M" | "F";
type SplitMode = "count" | "size";

interface Attendee {
  id: string;
  name: string;
  isTeacher: boolean;
  isBasic: boolean;
}

interface AttendeesResponse {
  semester: string;
  weekId: string;
  weekLabel: string;
  attendees: Attendee[];
}

interface SplitConfig {
  mode: SplitMode;
  value: number;
}

interface ScreenGroup {
  id: string;
  name: string;
  gender: Gender;
  studentIds: string[];
  teacherIds: string[];
}

/** Screen-only state; persisted to localStorage just to survive a refresh. */
interface SavedState {
  gender: Record<string, Gender>;
  config: Record<Gender, SplitConfig>;
  groups: ScreenGroup[] | null;
  basicTeacherIds: string[];
}

const GENDER_LABEL: Record<Gender, string> = { M: "남자", F: "여자" };
const DEFAULT_CONFIG: Record<Gender, SplitConfig> = {
  M: { mode: "count", value: 2 },
  F: { mode: "count", value: 2 },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function groupCountFor(n: number, cfg: SplitConfig): number {
  if (n === 0) return 0;
  const k = cfg.mode === "count" ? cfg.value : Math.ceil(n / cfg.value);
  return Math.max(1, Math.min(k, n));
}

function sizeRange(n: number, k: number): string {
  if (k === 0) return "";
  const lo = Math.floor(n / k);
  const hi = Math.ceil(n / k);
  return lo === hi ? `${lo}명씩` : `${lo}~${hi}명씩`;
}

export default function GroupsPage() {
  const [data, setData] = useState<AttendeesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [gender, setGender] = useState<Record<string, Gender>>({});
  const [config, setConfig] =
    useState<Record<Gender, SplitConfig>>(DEFAULT_CONFIG);
  const [groups, setGroups] = useState<ScreenGroup[] | null>(null);
  const [basicTeacherIds, setBasicTeacherIds] = useState<string[]>([]);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  const storageKey = data ? `bicf-groups::${data.semester}::${data.weekId}` : null;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/attendees", { cache: "no-store" });
      setData(await res.json());
    } catch {
      /* ignore transient errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Restore screen state for this week once.
  useEffect(() => {
    if (!storageKey || hydratedKey === storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw) as SavedState;
        setGender(s.gender ?? {});
        setConfig(s.config ?? DEFAULT_CONFIG);
        setGroups(s.groups ?? null);
        setBasicTeacherIds(s.basicTeacherIds ?? []);
      }
    } catch {
      /* ignore corrupted storage */
    }
    setHydratedKey(storageKey);
  }, [storageKey, hydratedKey]);

  useEffect(() => {
    if (!storageKey || hydratedKey !== storageKey) return;
    const s: SavedState = { gender, config, groups, basicTeacherIds };
    localStorage.setItem(storageKey, JSON.stringify(s));
  }, [storageKey, hydratedKey, gender, config, groups, basicTeacherIds]);

  const attendees = useMemo(() => data?.attendees ?? [], [data]);
  const byId = useMemo(
    () => new Map(attendees.map((a) => [a.id, a])),
    [attendees]
  );
  const teachers = attendees.filter((a) => a.isTeacher);
  const basicStudents = attendees.filter((a) => !a.isTeacher && a.isBasic);
  const regularStudents = attendees.filter((a) => !a.isTeacher && !a.isBasic);

  const males = regularStudents.filter((a) => gender[a.id] === "M");
  const females = regularStudents.filter((a) => gender[a.id] === "F");
  const noGender = regularStudents.filter((a) => !gender[a.id]);

  const maleGroupCount = groupCountFor(males.length, config.M);
  const femaleGroupCount = groupCountFor(females.length, config.F);

  const assignedTeacherIds = new Set([
    ...basicTeacherIds,
    ...(groups ?? []).flatMap((g) => g.teacherIds),
  ]);
  const freeTeachers = teachers.filter((t) => !assignedTeacherIds.has(t.id));

  const placedStudentIds = new Set((groups ?? []).flatMap((g) => g.studentIds));
  const unplacedStudents = groups
    ? regularStudents.filter((s) => !placedStudentIds.has(s.id))
    : [];

  function setPersonGender(id: string, g: Gender) {
    setGender((prev) => {
      const next = { ...prev };
      if (next[id] === g) delete next[id];
      else next[id] = g;
      return next;
    });
  }

  function fillUnset(g: Gender) {
    setGender((prev) => {
      const next = { ...prev };
      for (const s of regularStudents) if (!next[s.id]) next[s.id] = g;
      return next;
    });
  }

  function updateConfig(g: Gender, patch: Partial<SplitConfig>) {
    setConfig((prev) => {
      const merged = { ...prev[g], ...patch };
      if (patch.mode && patch.mode !== prev[g].mode) {
        merged.value = patch.mode === "count" ? 2 : 4;
      }
      return { ...prev, [g]: merged };
    });
  }

  function generate() {
    // Keep teacher picks attached to a group name across re-generation.
    const prevTeachers = new Map(
      (groups ?? []).map((g) => [g.name, g.teacherIds])
    );
    const build = (g: Gender, members: Attendee[], k: number) => {
      const buckets: string[][] = Array.from({ length: k }, () => []);
      shuffle(members).forEach((m, i) => buckets[i % k].push(m.id));
      return buckets.map((studentIds, i) => {
        const name = `${GENDER_LABEL[g]} ${i + 1}조`;
        return {
          id: `${g}-${i + 1}`,
          name,
          gender: g,
          studentIds,
          teacherIds: prevTeachers.get(name) ?? [],
        };
      });
    };
    setGroups([
      ...build("M", males, maleGroupCount),
      ...build("F", females, femaleGroupCount),
    ]);
  }

  function resetGroups() {
    if (!confirm("편성 결과와 선생님 배정을 모두 초기화할까요?")) return;
    setGroups(null);
    setBasicTeacherIds([]);
  }

  function addTeacher(groupId: string | "basic", teacherId: string) {
    if (!teacherId) return;
    if (groupId === "basic") {
      setBasicTeacherIds((prev) => [...prev, teacherId]);
      return;
    }
    setGroups((prev) =>
      (prev ?? []).map((g) =>
        g.id === groupId ? { ...g, teacherIds: [...g.teacherIds, teacherId] } : g
      )
    );
  }

  function removeTeacher(groupId: string | "basic", teacherId: string) {
    if (groupId === "basic") {
      setBasicTeacherIds((prev) => prev.filter((t) => t !== teacherId));
      return;
    }
    setGroups((prev) =>
      (prev ?? []).map((g) =>
        g.id === groupId
          ? { ...g, teacherIds: g.teacherIds.filter((t) => t !== teacherId) }
          : g
      )
    );
  }

  function moveStudent(studentId: string, toGroupId: string | null) {
    setGroups((prev) =>
      (prev ?? []).map((g) => {
        const without = g.studentIds.filter((s) => s !== studentId);
        return g.id === toGroupId
          ? { ...g, studentIds: [...without, studentId] }
          : { ...g, studentIds: without };
      })
    );
  }

  const nameOf = (id: string) => byId.get(id)?.name ?? "(출석 취소됨)";

  function renderTeachers(groupId: string, ids: string[]) {
    return (
      <>
        {ids
          .filter((t) => byId.has(t))
          .map((t) => (
            <li key={t} className="member-row">
              <span>
                <span className="tag teacher">선생님</span> {nameOf(t)}
              </span>
              <button
                className="icon-btn"
                title="배정 해제"
                onClick={() => removeTeacher(groupId, t)}
              >
                ✕
              </button>
            </li>
          ))}
        <li>
          <select
            className="mini-select"
            value=""
            onChange={(e) => addTeacher(groupId, e.target.value)}
            disabled={freeTeachers.length === 0}
          >
            <option value="">
              {freeTeachers.length === 0
                ? "배정 가능한 선생님 없음"
                : "+ 선생님 배정"}
            </option>
            {freeTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </li>
      </>
    );
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>조 편성</h1>
        <p className="muted">{data ? data.semester : "로딩 중…"}</p>
        {data?.weekLabel && <div className="weekpill">{data.weekLabel}</div>}
      </div>

      {loading ? (
        <div className="card">
          <p className="muted">로딩 중…</p>
        </div>
      ) : (
        <>
          {/* 1. 출석 명단 + 성별 체크 */}
          <div className="card">
            <div className="section-head">
              <h2>
                출석 명단 · 총 {attendees.length}명
                <span className="muted" style={{ fontWeight: 500 }}>
                  {" "}
                  (학생 {regularStudents.length} · 기초반 {basicStudents.length}{" "}
                  · 선생님 {teachers.length})
                </span>
              </h2>
              <button className="ghost small" onClick={load}>
                새로고침
              </button>
            </div>

            <h3>
              학생 성별 체크 · 남 {males.length} / 여 {females.length}
              {noGender.length > 0 && (
                <span className="warn-text"> / 미선택 {noGender.length}</span>
              )}
            </h3>
            {regularStudents.length === 0 ? (
              <p className="muted">출석한 학생이 없습니다.</p>
            ) : (
              <>
                <div className="gender-grid">
                  {regularStudents.map((s) => (
                    <div
                      key={s.id}
                      className={`gender-item ${gender[s.id] ? "g-" + gender[s.id] : ""}`}
                    >
                      <span className="gender-name">{s.name}</span>
                      <div className="gender-toggle">
                        <button
                          className={gender[s.id] === "M" ? "on-M" : ""}
                          onClick={() => setPersonGender(s.id, "M")}
                        >
                          남
                        </button>
                        <button
                          className={gender[s.id] === "F" ? "on-F" : ""}
                          onClick={() => setPersonGender(s.id, "F")}
                        >
                          여
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {noGender.length > 0 && (
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="ghost small" onClick={() => fillUnset("M")}>
                      미선택 모두 남자로
                    </button>
                    <button className="ghost small" onClick={() => fillUnset("F")}>
                      미선택 모두 여자로
                    </button>
                  </div>
                )}
              </>
            )}

            {(basicStudents.length > 0 || teachers.length > 0) && (
              <div className="roster-extra">
                {basicStudents.length > 0 && (
                  <p>
                    <span className="tag lvl-기초">기초반</span>{" "}
                    {basicStudents.map((s) => s.name).join(", ")}
                  </p>
                )}
                {teachers.length > 0 && (
                  <p>
                    <span className="tag teacher">선생님</span>{" "}
                    {teachers.map((t) => t.name).join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 2. 편성 설정 */}
          <div className="card">
            <h2>편성 설정</h2>
            <div className="split-grid">
              {(["M", "F"] as Gender[]).map((g) => {
                const n = g === "M" ? males.length : females.length;
                const k = g === "M" ? maleGroupCount : femaleGroupCount;
                const cfg = config[g];
                return (
                  <div key={g} className="split-box">
                    <div className="split-title">
                      {GENDER_LABEL[g]}반 <span className="muted">· {n}명</span>
                    </div>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <select
                        value={cfg.mode}
                        onChange={(e) =>
                          updateConfig(g, { mode: e.target.value as SplitMode })
                        }
                      >
                        <option value="count">조 개수로</option>
                        <option value="size">조당 인원으로</option>
                      </select>
                      <select
                        value={cfg.value}
                        onChange={(e) =>
                          updateConfig(g, { value: Number(e.target.value) })
                        }
                      >
                        {(cfg.mode === "count"
                          ? Array.from({ length: 10 }, (_, i) => i + 1)
                          : Array.from({ length: 14 }, (_, i) => i + 2)
                        ).map((v) => (
                          <option key={v} value={v}>
                            {cfg.mode === "count" ? `${v}개 조` : `${v}명씩`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="muted" style={{ margin: "8px 0 0" }}>
                      {n === 0
                        ? "성별 체크된 학생이 없습니다."
                        : `→ ${k}개 조 · ${sizeRange(n, k)}`}
                    </p>
                  </div>
                );
              })}
            </div>

            {noGender.length > 0 && (
              <div className="banner error" style={{ marginTop: 16 }}>
                성별 미선택 {noGender.length}명은 편성에서 제외됩니다. (편성 후
                ‘미배정’에서 수동으로 넣을 수 있어요)
              </div>
            )}

            <div className="row" style={{ marginTop: 16 }}>
              <button
                onClick={generate}
                disabled={males.length + females.length === 0}
              >
                🎲 조 편성하기
              </button>
              {groups && (
                <button className="ghost" onClick={resetGroups}>
                  초기화
                </button>
              )}
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              기초반은 자동으로 기초반에 편성됩니다. 선생님은 편성 후 각 조에서
              직접 배정해 주세요. 결과는 이 화면(브라우저)에만 유지됩니다.
            </p>
          </div>

          {/* 3. 편성 결과 */}
          <div className="card">
            <h2>
              편성 결과
              {groups && (
                <span className="muted" style={{ fontWeight: 500 }}>
                  {" "}
                  · {groups.length + (basicStudents.length > 0 ? 1 : 0)}개 조
                </span>
              )}
            </h2>

            {freeTeachers.length > 0 && (groups || basicStudents.length > 0) && (
              <div className="banner info">
                미배정 선생님: {freeTeachers.map((t) => t.name).join(", ")}
              </div>
            )}

            <div className="groups-grid">
              {basicStudents.length > 0 && (
                <div className="group-card basic">
                  <h4>
                    <span>기초반</span>
                    <span className="tag lvl-기초">{basicStudents.length}명</span>
                  </h4>
                  <ul>
                    {renderTeachers("basic", basicTeacherIds)}
                    {basicStudents.map((s) => (
                      <li key={s.id}>{s.name}</li>
                    ))}
                  </ul>
                </div>
              )}

              {groups?.map((g) => {
                const students = g.studentIds.filter((id) => byId.has(id));
                return (
                  <div key={g.id} className={`group-card gender-${g.gender}`}>
                    <h4>
                      <span>{g.name}</span>
                      <span className="tag">{students.length}명</span>
                    </h4>
                    <ul>
                      {renderTeachers(g.id, g.teacherIds)}
                      {students.map((sid) => (
                        <li key={sid} className="member-row">
                          <span>{nameOf(sid)}</span>
                          <button
                            className="icon-btn"
                            title="조에서 빼기"
                            onClick={() => moveStudent(sid, null)}
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                      {students.length === 0 && (
                        <li className="muted">학생 없음</li>
                      )}
                    </ul>
                  </div>
                );
              })}

              {unplacedStudents.length > 0 && (
                <div className="group-card unplaced">
                  <h4>
                    <span>미배정</span>
                    <span className="tag">{unplacedStudents.length}명</span>
                  </h4>
                  <ul>
                    {unplacedStudents.map((s) => (
                      <li key={s.id} className="member-row">
                        <span>{s.name}</span>
                        <select
                          className="mini-select"
                          style={{ width: "auto" }}
                          value=""
                          onChange={(e) => moveStudent(s.id, e.target.value)}
                        >
                          <option value="">조 선택</option>
                          {groups!.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {!groups && basicStudents.length === 0 && (
              <div className="banner info" style={{ marginBottom: 0 }}>
                성별을 체크하고 ‘조 편성하기’를 눌러주세요.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
