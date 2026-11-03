import { defineConfig } from "vitest/config";

// The date-based samples and tests were written against Jakarta time (WIB);
// pin it so CI runners (UTC) and other machines get the same results.
process.env.TZ = "Asia/Jakarta";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "modules/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
