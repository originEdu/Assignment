import { useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type Mode = "login" | "register";

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.detail : "알 수 없는 오류가 발생했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{mode === "login" ? "로그인" : "회원가입"}</h1>
      <form onSubmit={onSubmit}>
        <p>
          <label>
            이메일{" "}
            <input
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            비밀번호{" "}
            <input
              type="password"
              value={password}
              required
              minLength={8}
              maxLength={72}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </p>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {mode === "login" ? "로그인" : "가입하기"}
        </button>
      </form>
      <p>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "계정이 없으신가요? 가입하기" : "이미 계정이 있으신가요? 로그인"}
        </button>
      </p>
    </main>
  );
}
