import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'WatchP2PStream',
    description: 'Watch streams together, browser to browser, without a media server.',
    permissions: ['storage'],
    action: {
      default_title: 'Open WatchP2PStream',
    },
    ...(browser === 'firefox' && {
      // Firefox shares no tab sound, so a script is injected into the tab the host chooses. Nothing
      // is granted at install: the tab list and each site are asked for when the host picks them.
      permissions: ['storage', 'scripting'],
      optional_permissions: ['tabs'],
      optional_host_permissions: ['<all_urls>'],
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
