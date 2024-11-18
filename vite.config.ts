import { defineConfig } from 'vite';
import monkey, { cdn, util } from 'vite-plugin-monkey';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        icon: 'https://www.google.com/s2/favicons?sz=64&domain=gitlab.com',
        match: ['https://gitlab.com/*'],
        license: 'AGPL-3.0-or-later',
        // require: [
        //   'https://cdn.jsdelivr.net/gh/CoeJoder/waitForKeyElements.js@16f3c035e2c41f8af0437a1eca1c9899e722ec37/waitForKeyElements.js',
        //   // 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js',
        // ],
        grant: ['GM_addElement', 'window.onurlchange'],
      },
      build: {
        externalGlobals: {
          jquery: cdn.jsdelivr('$', 'dist/jquery.min.js'),
        },
      },
    }),
  ],
});
