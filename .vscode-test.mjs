import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  version: "1.101.0",
  files: "out/test/suite/**/*.test.js"
});
