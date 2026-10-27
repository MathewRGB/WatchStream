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
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'node',
          setupFiles: ['src/testing/setup.ts'],
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
              // Tests make sound without a click: an AudioContext would stay suspended otherwise.
              {
                browser: 'chromium',
                provider: playwright({
                  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
                }),
              },
              {
                browser: 'firefox',
                provider: playwright({
                  launchOptions: { firefoxUserPrefs: { 'media.autoplay.default': 0 } },
                }),
              },
            ],
          },
        },
      },
    ],
  },
});
