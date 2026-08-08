import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // Component tests opt into jsdom with a `@vitest-environment` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-support/setup-dom.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov'],
      include: [
        'src/domain/**',
        'src/import/**',
        'src/storage/**',
        'src/components/**',
        'src/hooks/**',
        'src/i18n/**',
        'src/entrypoints/**',
      ],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test-support/**',
        // Assets and framework bootstrap: no branches worth measuring, and the
        // coverage provider cannot parse HTML or CSS.
        'src/**/*.{css,html}',
        'src/**/main.tsx',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
