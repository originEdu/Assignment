import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client";
import type { SessionOut } from "../api/types";
import { isSessionExpired, useAuth } from "../auth/AuthContext";

export default function HistoryScreen() {
  const { client, logout } = useAuth();
  const [sessions, setSessions] = useState<SessionOut[]>([]);
  const [selected, setSelected] = useState<SessionOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The backend already orders by submitted_at descending.
      setSessions(await client.listSessions());
    } catch (caught) {
      if (isSessionExpired(caught)) {
        logout();
        return;
      }
      setError(caught instanceof ApiError ? caught.detail : "기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [client, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: number) {
    setError(null);
    try {
      setSelected(await client.getSession(id));
    } catch (caught) {
      if (isSessionExpired(caught)) {
        logout();
        return;
      }
      setError(caught instanceof ApiError ? caught.detail : "세션을 불러오지 못했습니다.");
    }
  }

  return (
    <main>
      <h1>기록</h1>

      {loading && <p>불러오는 중…</p>}
      {error && (
        <p className="error">
          {error} <button onClick={() => void load()}>다시 시도</button>
        </p>
      )}
      {!loading && !error && sessions.length === 0 && <p>아직 기록이 없습니다.</p>}

      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            <button onClick={() => void open(session.id)}>
              #{session.id} · {session.gesture_type ?? "지정 없음"} ·{" "}
              {session.result ? `${session.result.score}점` : "결과 없음"} ·{" "}
              {new Date(session.submitted_at).toLocaleString()}
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <section>
          <h2>세션 #{selected.id}</h2>
          <p>목표 제스처: {selected.gesture_type ?? "지정 없음"}</p>
          <p>제출 시각: {new Date(selected.submitted_at).toLocaleString()}</p>
          {selected.result && (
            <>
              <p>인식된 제스처: {selected.result.matched_gesture ?? "없음"}</p>
              <p>점수: {selected.result.score}</p>
              <p>
                일치 프레임: {selected.result.detail.frames_matched} /{" "}
                {selected.result.detail.frames_total}
              </p>
            </>
          )}
        </section>
      )}
    </main>
  );
}
