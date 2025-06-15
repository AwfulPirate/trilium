/// <reference types='vitest' />
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/server',
  plugins: [],
  test: {
    watch: false,
    globals: true,
    setupFiles: ["./spec/setup.ts"],
    environment: "node",
    include: ['{src,spec}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: [
      "verbose"
    ],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
      reporter: [ "text", "html" ]
    },
    fileParallelism: false,
    pool: "threads"
  },
}));
