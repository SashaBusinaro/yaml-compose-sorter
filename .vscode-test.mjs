import { defineConfig } from "@vscode/test-cli";

export default defineConfig([
  {
    label: "Template activation",
    version: "1.101.0",
    files: "out/test/suite/activation.test.js"
  },
  {
    label: "Integration",
    version: "1.101.0",
    files: "out/test/suite/{sorter,adversary,extension}.test.js"
  }
]);
