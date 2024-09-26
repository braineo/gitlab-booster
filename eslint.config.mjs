import globals from 'globals';
import pluginJs from '@eslint/js';
import userscripts from 'eslint-plugin-userscripts';

export default [
  { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.greasemonkey },
    },
  },
  pluginJs.configs.recommended,
  {
    files: ['gitlab-booster.js'],
    plugins: {
      userscripts: {
        rules: userscripts.rules,
      },
    },
    rules: {
      ...userscripts.configs.recommended.rules,
    },
    settings: {
      userscriptVersions: {
        violentmonkey: '*',
      },
    },
  },
];
