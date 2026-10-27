import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "import"],
  categories: {
    correctness: "error",
    suspicious: "error",
    pedantic: "error",
    perf: "error",
  },
  rules: {
    "max-lines": "off",
    "max-lines-per-function": "off",
    "max-depth": "off",
    // board cards fetch sequentially on purpose to go easy on the GitLab API
    "no-await-in-loop": "off",
  },
  ignorePatterns: ["src/waitForKeyElements.ts"],
});
