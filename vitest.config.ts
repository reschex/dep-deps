import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/test/**", "src/language/**/fixtures/"],
    environment: "node",
    globals: false,
    reporters: ["agent"],
    // TypeScript compilation (callGraphBuild, runCliAnalysis, main) takes 500–1000ms locally
    // but 5–9× longer on CI (2-core GitHub Actions runners with 75 parallel workers).
    // 30s gives a 3–4× safety margin over the worst observed CI duration (~9s).
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.ts", "src/test/**", "src/language/**/fixtures/"],
      provider: "v8",
      reporter: ["lcov", "text"],
      reportsDirectory: "coverage",
    },
  },
});
