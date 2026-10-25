import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [WxtVitest()],
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 15_000,
          browser: {
            enabled: true,
            headless: true,
            instances: [
              { browser: 'chromium', provider: playwright() },
              { browser: 'firefox', provider: playwright() },
            ],
          },
        },
      },
    ],
  },
});
