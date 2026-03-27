import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["app/**/*.test.ts"],
  },
});
