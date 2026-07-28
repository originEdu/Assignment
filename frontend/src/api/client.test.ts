import { describe, expect, test } from "vitest";

import { ApiError, createClient } from "./client";

function stubFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { impl: impl as typeof fetch, calls };
}

describe("createClient", () => {
  test("joins the base URL with the path", async () => {
    const { impl, calls } = stubFetch(200, []);
    const client = createClient({ baseUrl: "http://localhost:8000", fetchImpl: impl });

    await client.listSessions();

    expect(calls[0].url).toBe("http://localhost:8000/sessions");
  });

  test("attaches the bearer token to authenticated requests", async () => {
    const { impl, calls } = stubFetch(200, []);
    const client = createClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: impl,
      getToken: () => "abc123",
    });

    await client.listSessions();

    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Authorization")).toBe("Bearer abc123");
  });

  test("sends login as form data with username holding the email", async () => {
    const { impl, calls } = stubFetch(200, {
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
    });
    const client = createClient({ baseUrl: "http://localhost:8000", fetchImpl: impl });

    await client.login("user@example.com", "password123");

    const body = calls[0].init.body as URLSearchParams;
    expect(body.get("username")).toBe("user@example.com");
    expect(body.get("password")).toBe("password123");
  });

  test("turns a non-2xx detail into an ApiError", async () => {
    const { impl } = stubFetch(409, { detail: "Email already registered" });
    const client = createClient({ baseUrl: "http://localhost:8000", fetchImpl: impl });

    await expect(client.register("dup@example.com", "password123")).rejects.toThrow(
      ApiError,
    );
    await expect(
      client.register("dup@example.com", "password123"),
    ).rejects.toMatchObject({ status: 409, detail: "Email already registered" });
  });

  test("reports a network failure as status 0", async () => {
    const failing = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const client = createClient({ baseUrl: "http://localhost:8000", fetchImpl: failing });

    await expect(client.listSessions()).rejects.toMatchObject({ status: 0 });
  });
});
