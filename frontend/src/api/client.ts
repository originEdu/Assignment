import type {
  GestureSubmission,
  JudgeResult,
  SessionOut,
  Token,
  UserOut,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

export interface ClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getToken?: () => string | null;
}

export interface ApiClient {
  register(email: string, password: string): Promise<UserOut>;
  login(email: string, password: string): Promise<Token>;
  submitSession(body: GestureSubmission): Promise<JudgeResult>;
  listSessions(): Promise<SessionOut[]>;
  getSession(id: number): Promise<SessionOut>;
}

export function createClient({
  baseUrl,
  fetchImpl = fetch,
  getToken = () => null,
}: ClientOptions): ApiClient {
  async function readDetail(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") return body.detail;
      return JSON.stringify(body.detail ?? body);
    } catch {
      return `요청이 실패했습니다 (${response.status}).`;
    }
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiError(0, "서버에 연결할 수 없습니다.");
    }

    if (!response.ok) {
      throw new ApiError(response.status, await readDetail(response));
    }
    return (await response.json()) as T;
  }

  function json(body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  return {
    register: (email, password) =>
      request<UserOut>("/auth/register", json({ email, password })),

    // OAuth2 password flow: form-encoded, and the field is named `username`.
    login: (email, password) =>
      request<Token>("/auth/login", {
        method: "POST",
        body: new URLSearchParams({ username: email, password }),
      }),

    submitSession: (body) => request<JudgeResult>("/sessions/submit", json(body)),

    listSessions: () => request<SessionOut[]>("/sessions"),

    getSession: (id) => request<SessionOut>(`/sessions/${id}`),
  };
}
