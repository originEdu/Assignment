import react from "@vitejs/plugin-react";
// `defineConfig` comes from vitest/config, not vite — the plain Vite one has no
// `test` field and rejects the block below.
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
