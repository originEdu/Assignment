// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { expect, test } from "vitest";

import App from "./App";
import { AuthProvider } from "./auth/AuthContext";

test("renders the login screen when no token is stored", () => {
  render(
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>,
  );

  expect(screen.getByRole("heading", { name: "로그인" })).toBeDefined();
});
