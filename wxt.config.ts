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
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
