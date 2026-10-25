import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'WatchStream',
    description: 'Watch streams together, browser to browser, without a media server.',
    permissions: ['storage'],
    action: {
      default_title: 'Open WatchStream',
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'watchstream@mathewrgb.github.io',
          // 140 (ESR) is the first version that knows data_collection_permissions.
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: {
          strict_min_version: '142.0',
        },
      },
    }),
  }),
});
