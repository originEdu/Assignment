import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ApiError, createClient } from "../api/client";
import type { ApiClient } from "../api/client";

const STORAGE_KEY = "motion.access_token";
const BASE_URL = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

interface AuthValue {
  token: string | null;
  client: ApiClient;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(STORAGE_KEY),
  );

  // The client reads the token through a ref so a single client instance stays
  // valid across logins instead of being rebuilt on every token change.
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  const client = useMemo(
    () =>
      createClient({
        baseUrl: BASE_URL,
        getToken: () => tokenRef.current,
      }),
    [],
  );

  const store = useCallback((next: string) => {
    sessionStorage.setItem(STORAGE_KEY, next);
    setToken(next);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const issued = await client.login(email, password);
      store(issued.access_token);
    },
    [client, store],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await client.register(email, password);
      await login(email, password);
    },
    [client, login],
  );

  const value = useMemo(
    () => ({ token, client, login, register, logout }),
    [token, client, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

// Spec 7.1: there is no refresh-token renewal. A 401 on an authenticated
// request means the session is over.
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
