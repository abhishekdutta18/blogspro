import { defineConfig } from 'vitest/config';

// Scoped on purpose: tests/*.spec.js are Playwright specs, not vitest.
export default defineConfig({
  test: {
    include: ['deploy/**/__tests__/**/*.test.mjs', 'scripts/**/__tests__/**/*.test.mjs'],
  },
});
