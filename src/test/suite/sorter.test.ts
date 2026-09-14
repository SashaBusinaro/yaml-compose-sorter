import assert from "node:assert/strict";
import { DockerComposeSorter, SorterConfig } from "../../core";
import { cleanConfig, DEFAULT_SERVICE_KEY_GROUPS } from "../helpers";

suite("DockerComposeSorter Test Suite", () => {
  /*
   * ==========================================
   * 1. Sorting Tests
   * ==========================================
   */
  test("Sorts top-level keys according to config", () => {
    const input = `
services: {}
version: "3.8"
networks: {}
volumes: {}
`;
    // Config order: version, name, services, volumes, networks
    const expected = `version: "3.8"

services: {}

volumes: {}

networks: {}
`;
    const result = DockerComposeSorter.sort(input, cleanConfig());
    assert.strictEqual(result.trim(), expected.trim());
  });

  test("Sorts service-level keys according to config", () => {
    const input = `
services:
  web:
    ports: ["80:80"]
    image: nginx
    container_name: my-web
`;
    // Config order: container_name, image, ..., ports

    // We expect: container_name, image, ports
    // Note: Blank lines default is true.
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({ addBlankLinesServices: false, addBlankLinesTopLevel: false })
    );

    const lines = result
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Check order by finding lines that START with the key
    const containerIdx = lines.findIndex((l) => l.trim().startsWith("container_name:"));
    const imageIdx = lines.findIndex((l) => l.trim().startsWith("image:"));
    const portsIdx = lines.findIndex((l) => l.trim().startsWith("ports:"));

    assert.ok(containerIdx > -1, "container_name not found");
    assert.ok(imageIdx > -1, "image not found");
    assert.ok(portsIdx > -1, "ports not found");

    assert.ok(containerIdx < imageIdx); // container_name < image
    assert.ok(imageIdx < portsIdx); // image < ports
  });

  test("Sorts unknown keys alphabetically at the end", () => {
    const input = `
services:
  app:
    zebra: true
    apple: true
    image: node
`;
    // 'image' is in config. 'apple' and 'zebra' are not.
    // 'image' should come first (if in config).
    // Then 'apple', then 'zebra' (alpha sort for unknown).

    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({ addBlankLinesServices: false, addBlankLinesTopLevel: false })
    );

    const lines = result.split("\n").map((l) => l.trim());
    const imgIdx = lines.findIndex((l) => l.startsWith("image:"));
    const appleIdx = lines.findIndex((l) => l.startsWith("apple:"));
    const zebraIdx = lines.findIndex((l) => l.startsWith("zebra:"));

    assert.ok(imgIdx < appleIdx);
    assert.ok(appleIdx < zebraIdx);
  });

  test("Sorts service keys by groups and separates populated groups", () => {
    const input = `
services:
  app:
    zebra: true
    environment:
      APP_ENV: production
    command: ["start"]
    build: .
    hostname: app
    image: node
    container_name: app
`;
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [
          ["container_name", "hostname"],
          ["image", "build"],
          ["command"],
          ["environment"]
        ],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      })
    );

    const service = result.slice(result.indexOf("  app:"));
    const orderedKeys = [
      "container_name",
      "hostname",
      "image",
      "build",
      "command",
      "environment",
      "zebra"
    ];
    const keyPositions = orderedKeys.map((key) => service.indexOf(`${key}:`));

    assert.ok(keyPositions.every((position) => position >= 0));
    keyPositions.slice(1).forEach((position, index) => {
      assert.ok(keyPositions[index] < position);
    });
    assert.ok(service.includes("hostname: app\n\n    image: node"));
    assert.ok(service.includes("build: .\n\n    command:"));
    assert.ok(service.includes("\n\n    environment:"));
  });

  test("Default groups separate populated groups in Compose services", () => {
    const input = `
services:
  web:
    environment:
      NODE_ENV: production
    ports: ["80:80"]
    image: nginx
    restart: always
`;
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({
        useServiceKeyGroups: true,
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      })
    );

    assert.ok(result.includes("image: nginx\n\n    restart: always"));
    assert.ok(result.includes("restart: always\n\n    ports:"));
    assert.match(result, /ports:\s*\[\s*"80:80"\s*\]\n\n    environment:/);
  });

  test("Group mode takes precedence over serviceKeyOrder when enabled", () => {
    const input = `
services:
  app:
    container_name: app
    image: node
    command: ["start"]
`;
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({
        useServiceKeyGroups: true,
        serviceKeyOrder: ["command", "image", "container_name"],
        serviceKeyGroups: [["container_name"], ["image"], ["command"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      })
    );

    const service = result.slice(result.indexOf("  app:"));
    assert.ok(service.indexOf("container_name:") < service.indexOf("image:"));
    assert.ok(service.indexOf("image:") < service.indexOf("command:"));
  });

  test("Service key order remains active when group mode is disabled", () => {
    const input = `
services:
  app:
    container_name: app
    image: node
    command: ["start"]
`;
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({
        useServiceKeyGroups: false,
        serviceKeyOrder: ["command", "image", "container_name"],
        serviceKeyGroups: [["container_name"], ["image"], ["command"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      })
    );

    const service = result.slice(result.indexOf("  app:"));
    assert.ok(service.indexOf("command:") < service.indexOf("image:"));
    assert.ok(service.indexOf("image:") < service.indexOf("container_name:"));
    assert.ok(!service.includes('command: ["start"]\n\n'));
  });

  test("Grouped sorting is idempotent", () => {
    const config = cleanConfig({
      useServiceKeyGroups: true,
      serviceKeyGroups: [["container_name"], ["image"], ["command"]],
      addBlankLinesTopLevel: false,
      addBlankLinesServices: false
    });
    const input = `
services:
  app:
    command: ["start"]
    image: node
    container_name: app
`;

    const once = DockerComposeSorter.sort(input, config);
    assert.strictEqual(DockerComposeSorter.sort(once, config), once);
    assert.ok(once.includes("container_name: app\n\n    image: node\n\n    command:"));
  });

  test("Separates untracked service keys from configured groups", () => {
    const input = `
services:
  app:
    hostname: app
    image: node
    command: ["start"]
`;
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["image"], ["command"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      })
    );

    assert.ok(result.indexOf("command:") < result.indexOf("hostname:"));
    assert.ok(result.includes("\n\n    hostname: app"));
  });

  test("Preserves blank lines within groups and the unknown-key section", () => {
    const input = `
services:
  app:
    build: .

    image: node
    zebra: true

    apple: true
`;
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["image", "build"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      })
    );

    assert.ok(result.includes("image: node\n\n    build: ."));
    assert.ok(result.includes("apple: true\n\n    zebra: true"));
  });

  test("Can disable preservation of internal grouped spacing", () => {
    const input = `
services:
  app:
    image: node

    build: .
    apple: true

    zebra: true
`;
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({
        useServiceKeyGroups: true,
        preserveBlankLinesWithinServiceKeyGroups: false,
        serviceKeyGroups: [["image", "build"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      })
    );

    assert.ok(!result.includes("image: node\n\n    build:"));
    assert.ok(!result.includes("apple: true\n\n    zebra:"));
  });

  /*
   * ==========================================
   * 2. Defaults & Config Fallbacks
   * ==========================================
   */
  test("Handles empty config (falls back gracefully)", () => {
    // If we pass empty arrays for order, it should just alpha sort everything?
    // The implementation: if (idxA > -1 ...). if neither in list, alpha sort.
    const emptyConfig: SorterConfig = {
      topLevelKeyOrder: [],
      serviceKeyOrder: [],
      useServiceKeyGroups: false,
      preserveBlankLinesWithinServiceKeyGroups: true,
      addDocumentSeparator: false,
      addBlankLinesTopLevel: false,
      addBlankLinesServices: false,
      removeVersionKey: false,
      transformKeyValueLists: false
    };

    const input = `
b: 1
a: 1
services:
  web:
    d: 1
    c: 1
`;
    const result = DockerComposeSorter.sort(input, emptyConfig);

    // Expect alpha sort
    assert.ok(result.includes("a: 1"));
    assert.ok(result.indexOf("a: 1") < result.indexOf("b: 1"));

    assert.ok(result.includes("c: 1"));
    assert.ok(result.indexOf("c: 1") < result.indexOf("d: 1"));
  });

  /*
   * ==========================================
   * 3. Feature Flags
   * ==========================================
   */
  test("Feature: removeVersionKey = true", () => {
    const input = `version: '3.8'\nservices: {}`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ removeVersionKey: true }));
    assert.ok(!result.includes("version:"));
    assert.ok(result.includes("services:"));
  });

  test("Feature: removeVersionKey = false", () => {
    const input = `version: '3.8'\nservices: {}`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ removeVersionKey: false }));
    assert.ok(result.includes("version:"));
  });

  test("Feature: addDocumentSeparator = true", () => {
    const input = `services: {}`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ addDocumentSeparator: true }));
    assert.ok(result.startsWith("---\n"));
  });

  test("Feature: addDocumentSeparator = false", () => {
    const input = `---\nservices: {}`;
    // specific case: if it already exists, it shouldn't duplicate?
    // Implementation says: if (!output.startsWith("---"))
    const result = DockerComposeSorter.sort(input, cleanConfig({ addDocumentSeparator: true }));
    // If input already has it, output from doc.toString() might include it if it was part of the doc?
    // yaml library usually handles directivves.
    // The implementation logic: output = doc.toString(...). if(config.add... && !startWith) prepend.

    // doc.toString() often omits '---' unless explicitly asked or directives set.
    // If the original had it, does yaml.parseDocument keep it?
    // 'yaml' library: By default doc.toString() doesn't include --- unless directives are set.

    // Let's test checking if it adds it when requested
    const result2 = DockerComposeSorter.sort(
      "services: {}",
      cleanConfig({ addDocumentSeparator: false })
    );
    assert.ok(!result2.startsWith("---"));
  });

  test("Feature: addBlankLinesTopLevel", () => {
    const input = `version: '3'\nservices: {}`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ addBlankLinesTopLevel: true }));
    assert.ok(result.includes("\n\nservices:"));
  });

  test("Feature: transformKeyValueLists = true", () => {
    const input = `
services:
  app:
    environment:
      - NODE_ENV=production
      - DEBUG=true
`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ transformKeyValueLists: true }));
    // Should become a map
    assert.ok(result.includes("NODE_ENV: production"));
    // "true" might be quoted or not depending on YAML version/parser
    assert.ok(
      result.includes("DEBUG: true") ||
        result.includes('DEBUG: "true"') ||
        result.includes("DEBUG: 'true'")
    );
    assert.ok(!result.includes("- NODE_ENV=production"));
  });

  /*
   * ==========================================
   * 4. Edge Cases
   * ==========================================
   */
  test("Edge Case: Empty file", () => {
    // Yaml parser often returns null or empty doc
    const input = "";
    const result = DockerComposeSorter.sort(input, cleanConfig());
    assert.strictEqual(result, "");
  });

  test("Edge Case: Invalid YAML throws error with parser detail", () => {
    const input = "services: {"; // Missing closing brace
    assert.throws(() => DockerComposeSorter.sort(input, cleanConfig()), {
      message: /^Invalid YAML: .+/
    });
  });

  test("Edge Case: File already sorted should remain (mostly) unchanged", () => {
    const input = `version: '3.8'

services:
  web:
    image: nginx
`;
    // If we use same settings, it might change spacing slightly if original spacing was weird,
    // but structural content/order should match.
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({
        addBlankLinesTopLevel: true,
        addBlankLinesServices: false // input doesn't have blank lines in service
      })
    );
    // Standardize quotes or spacing might change
    assert.ok(result.includes("image: nginx"));
    assert.ok(result.includes("services:"));
  });

  /*
   * ==========================================
   * 5. Comments (CRITICAL)
   * ==========================================
   */
  test("Comments: Preserves top-level comments", () => {
    const input = `
# Header Comment
version: '3'
# Service Comment
services: {}
`;
    const result = DockerComposeSorter.sort(input, cleanConfig());
    assert.ok(result.includes("# Header Comment"));
    assert.ok(result.includes("# Service Comment"));
  });

  test("Comments: Comments move with sorted keys", () => {
    const input = `
services:
  web:
    # Ports config
    ports: []
    # Image config
    image: nginx
`;
    // 'image' should come before 'ports' in default config.
    const result = DockerComposeSorter.sort(input, cleanConfig());

    const imgIdx = result.indexOf("image: nginx");
    const imgCommentIdx = result.indexOf("# Image config");
    const portsIdx = result.indexOf("ports: []");

    assert.ok(imgIdx < portsIdx); // Sorted

    // Comments must stay with their keys
    assert.ok(imgCommentIdx < imgIdx);
    assert.ok(imgIdx - imgCommentIdx < 50); // Close proximity

    assert.ok(result.indexOf("# Ports config") < portsIdx);
  });

  test("Comments: Inline comments preserved", () => {
    const input = `
services:
  web:
    image: nginx # The image
`;
    const result = DockerComposeSorter.sort(input, cleanConfig());
    assert.ok(result.includes("image: nginx # The image"));
  });

  /*
   * ==========================================
   * 6. Lists to Maps (Advanced)
   * ==========================================
   */
  test("Transform: Handles multiple = signs", () => {
    const input = `
services:
  web:
    environment:
      - DB_URI=postgres://user:pass@localhost:5432/db
`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ transformKeyValueLists: true }));
    assert.ok(result.includes("DB_URI:"));
    assert.ok(result.includes("postgres://user:pass@localhost:5432/db"));
  });

  test("Transform: Ignores non-key-value strings", () => {
    const input = `
services:
  web:
    environment:
      - "JUST_A_STRING"
`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ transformKeyValueLists: true }));
    // Should remain a list
    assert.ok(result.includes('- "JUST_A_STRING"'));
  });

  test("Transform: Preserves comments on list items when converting", () => {
    const input = `
services:
  web:
    environment:
      # Prod env
      - ENV=prod # Inline too
`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ transformKeyValueLists: true }));

    assert.ok(result.includes("ENV: prod"));
    assert.ok(result.includes("# Prod env"));
    assert.ok(result.includes("# Inline too"));

    // Ensure comment is attached to the new map pair
    const lines = result.split("\n");
    const commentIdx = lines.findIndex((l) => l.includes("# Prod env"));
    const keyIdx = lines.findIndex((l) => l.includes("ENV: prod"));

    // Usually comment is line before
    assert.notStrictEqual(commentIdx, -1);
    assert.notStrictEqual(keyIdx, -1);
    assert.ok(commentIdx < keyIdx);
  });

  /*
   * ==========================================
   * 7. Robustness (line endings, multi-doc, anchors)
   * ==========================================
   */
  test("Robustness: Preserves CRLF line endings", () => {
    const input = 'services: {}\r\nversion: "3.8"\r\n';
    const result = DockerComposeSorter.sort(input, cleanConfig());

    assert.ok(result.includes("\r\n"));
    // No lone LF should remain once CRLF pairs are stripped
    assert.ok(!result.replace(/\r\n/g, "").includes("\n"));
    assert.ok(result.indexOf("version:") < result.indexOf("services:"));
  });

  test("Robustness: LF input stays LF", () => {
    const input = 'services: {}\nversion: "3.8"\n';
    const result = DockerComposeSorter.sort(input, cleanConfig());
    assert.ok(!result.includes("\r"));
  });

  test("Robustness: Multi-document files keep all documents sorted", () => {
    const input = `services: {}
version: "3.8"
---
networks: {}
services: {}
`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ addBlankLinesTopLevel: false }));

    // Both documents survive, separated by ---
    assert.ok(result.includes("---"));
    assert.strictEqual(result.match(/services:/g)?.length, 2);
    assert.ok(result.includes("networks:"));

    // Each document is sorted: version before services (doc 1), services before networks (doc 2)
    assert.ok(result.indexOf("version:") < result.indexOf("services:"));
    const secondDoc = result.slice(result.indexOf("---"));
    assert.ok(secondDoc.indexOf("services:") < secondDoc.indexOf("networks:"));
  });

  test("Robustness: Anchors, aliases and merge keys are preserved", () => {
    const input = `x-common: &common
  restart: always
services:
  web:
    <<: *common
    image: nginx
`;
    const result = DockerComposeSorter.sort(input, cleanConfig());

    assert.ok(result.includes("&common"));
    assert.ok(result.includes("*common"));
    assert.ok(result.includes("<<:"));
    assert.ok(result.includes("image: nginx"));
  });

  test("Robustness: Merge keys survive transformKeyValueLists", () => {
    const input = `x-env: &env
  environment:
    - A=1
services:
  web:
    <<: *env
    image: nginx
`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ transformKeyValueLists: true }));
    assert.ok(result.includes("<<:"));
    assert.ok(result.includes("A: 1") || result.includes('A: "1"') || result.includes("A: '1'"));
  });

  test("Robustness: Non-map root document returned unchanged", () => {
    const input = "- a\n- b\n";
    const result = DockerComposeSorter.sort(input, cleanConfig());
    assert.strictEqual(result, input);
  });

  test("Robustness: Honors custom indent width", () => {
    const input = `services:
  web:
    image: nginx
`;
    const result = DockerComposeSorter.sort(input, cleanConfig(), 4);
    assert.ok(result.includes("\n    web:"));
    assert.ok(result.includes("\n        image: nginx"));
  });

  test("Robustness: Sorting is idempotent", () => {
    const input = `networks: {}
services:
  web:
    ports: ["80:80"]
    image: nginx # comment
version: "3.8"
`;
    const once = DockerComposeSorter.sort(input, cleanConfig());
    const twice = DockerComposeSorter.sort(once, cleanConfig());
    assert.strictEqual(twice, once);
  });

  /*
   * ==========================================
   * 8. Idempotency with trailing comments (issue #21)
   * ==========================================
   *
   * A comment that closes a block absorbs the blank line separating it from the
   * next section as trailing newlines in its `comment` string. That blank line
   * is also owned by the next key's `spaceBefore`, so without normalization the
   * two stack and a new blank line is added on every format run.
   */
  test("Idempotency: trailing comment before a top-level section (issue #21)", () => {
    const input = `services:
  nginx:
    image: nginx
    networks:
      - nginx-net
    # Comment

networks:
  nginx-net:
    name: nginx-net
`;
    const expected = `services:
  nginx:
    image: nginx
    networks:
      - nginx-net
    # Comment

networks:
  nginx-net:
    name: nginx-net
`;
    const once = DockerComposeSorter.sort(input, cleanConfig());
    // Exactly one blank line between the comment and the next section.
    assert.strictEqual(once, expected);

    // Re-running must not add further blank lines.
    let current = once;
    for (let i = 0; i < 4; i++) {
      current = DockerComposeSorter.sort(current, cleanConfig());
      assert.strictEqual(current, once, `run ${i + 2} changed the output`);
    }
  });

  test("Idempotency: trailing comment between two services", () => {
    const input = `services:
  alpha:
    image: alpha
    # tail comment

  beta:
    image: beta
`;
    const once = DockerComposeSorter.sort(input, cleanConfig());
    const twice = DockerComposeSorter.sort(once, cleanConfig());
    assert.strictEqual(twice, once);
    // Single blank line between the comment and the next service.
    assert.ok(once.includes("# tail comment\n\n  beta:"));
    assert.ok(!once.includes("# tail comment\n\n\n"));
  });

  test("Idempotency: deeply nested trailing comment before a section", () => {
    const input = `services:
  nginx:
    image: nginx
    networks:
      - nginx-net
      # deep comment

networks:
  net: {}
`;
    const once = DockerComposeSorter.sort(input, cleanConfig());
    const twice = DockerComposeSorter.sort(once, cleanConfig());
    assert.strictEqual(twice, once);
    assert.ok(once.includes("# deep comment\n\nnetworks:"));
    assert.ok(!once.includes("# deep comment\n\n\n"));
  });

  test("Idempotency: blank line inside a block (no spaceBefore) is preserved", () => {
    // The comment closes the `environment` list and is followed by `labels`, a
    // service key that never receives `spaceBefore` (only top-level keys and
    // service names do). The blank line is intra-block and must survive
    // untouched, proving the fix is not over-eager. Keys are already in config
    // order so sorting does not move them.
    const input = `services:
  web:
    image: nginx
    environment:
      - A=1
      # note

    labels:
      - x=y
`;
    const once = DockerComposeSorter.sort(input, cleanConfig());
    const twice = DockerComposeSorter.sort(once, cleanConfig());
    assert.strictEqual(twice, once);
    assert.ok(once.includes("# note\n\n    labels:"));
  });

  /*
   * ==========================================
   * 9. Issue #34: Trailing Null / Empty Scalar Spacing
   * ==========================================
   */
  test("Issue #34: Service network ending with colon does not produce extra blank lines", () => {
    const input = `services:
  langflow:
    networks:
      outbound_network:

  other:
    image: nginx
`;
    const result = DockerComposeSorter.sort(input, cleanConfig());
    assert.ok(result.includes("outbound_network:\n\n  other:"));
    assert.ok(!result.includes("outbound_network:\n\n\n"));
  });

  test("Issue #34: Trailing null scalar is idempotent across multiple runs", () => {
    const input = `services:
  langflow:
    networks:
      outbound_network:

  other:
    image: nginx
`;
    let current = input;
    for (let i = 0; i < 5; i++) {
      current = DockerComposeSorter.sort(current, cleanConfig());
      assert.ok(current.includes("outbound_network:\n\n  other:"));
      assert.ok(!current.includes("outbound_network:\n\n\n"));
    }
  });

  test("Issue #34: Trailing null scalar with inline comment retains single blank line", () => {
    const input = `services:
  langflow:
    networks:
      outbound_network: # outbound proxy network

  other:
    image: nginx
`;
    const once = DockerComposeSorter.sort(input, cleanConfig());
    const twice = DockerComposeSorter.sort(once, cleanConfig());
    assert.strictEqual(twice, once);
    assert.ok(once.includes("outbound_network: # outbound proxy network\n\n  other:"));
    assert.ok(!once.includes("outbound_network: # outbound proxy network\n\n\n"));
  });

  test("Issue #34: Top-level section ending with colon does not produce extra blank lines", () => {
    const input = `services:
  web:
    image: nginx

networks:
  default:

volumes:
  data:
`;
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({ topLevelKeyOrder: ["services", "networks", "volumes"] })
    );
    assert.ok(result.includes("default:\n\nvolumes:"));
    assert.ok(!result.includes("default:\n\n\n"));
  });

  /*
   * ==========================================
   * 10. Issue #45: Support Jinja2 Compose Templates
   * ==========================================
   */
  test("Issue #45: Sorts Compose files containing Jinja2 template expressions", () => {
    const input = `services:
  web:
    environment:
      APP_ENV: "{{ env | default('production') }}"
    ports:
      - "{{ host_port }}:80"
    image: "{{ image_name }}:{{ tag }}"
    container_name: "{{ app_name }}"
`;
    const result = DockerComposeSorter.sort(input, cleanConfig());
    const webSection = result.slice(result.indexOf("  web:"));

    const containerIdx = webSection.indexOf("container_name:");
    const imageIdx = webSection.indexOf("image:");
    const portsIdx = webSection.indexOf("ports:");
    const envIdx = webSection.indexOf("environment:");

    assert.ok(containerIdx < imageIdx);
    assert.ok(imageIdx < portsIdx);
    assert.ok(portsIdx < envIdx);
    assert.ok(result.includes("\"{{ env | default('production') }}\""));
    assert.ok(result.includes('"{{ image_name }}:{{ tag }}"'));
  });

  test("Issue #45: Jinja2 Compose template sorting is idempotent", () => {
    const input = `services:
  web:
    image: "{{ image_name }}"
    container_name: "{{ app_name }}"
`;
    const once = DockerComposeSorter.sort(input, cleanConfig());
    const twice = DockerComposeSorter.sort(once, cleanConfig());
    assert.strictEqual(twice, once);
  });

  /*
   * ==========================================
   * 11. Merge Keys & Enhanced List Transformation
   * ==========================================
   */
  test("Merge keys (<<) are prioritized to top of service definitions by default", () => {
    const input = `x-common: &common
  restart: always

services:
  web:
    image: nginx
    container_name: web
    <<: *common
`;
    const result = DockerComposeSorter.sort(input, cleanConfig());
    const webSection = result.slice(result.indexOf("  web:"));
    const mergeIdx = webSection.indexOf("<<: *common");
    const containerIdx = webSection.indexOf("container_name: web");
    const imageIdx = webSection.indexOf("image: nginx");

    assert.ok(mergeIdx !== -1, "Expected merge key in web section");
    assert.ok(mergeIdx < containerIdx, "Expected << to come before container_name");
    assert.ok(containerIdx < imageIdx, "Expected container_name before image");
  });

  test("Merge keys (<<) are prioritized to top of service definitions in grouped mode", () => {
    const input = `x-common: &common
  restart: always

services:
  web:
    image: nginx
    <<: *common
    container_name: web
`;
    const result = DockerComposeSorter.sort(
      input,
      cleanConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["container_name"], ["image"]]
      })
    );
    const webSection = result.slice(result.indexOf("  web:"));
    const mergeIdx = webSection.indexOf("<<: *common");
    const containerIdx = webSection.indexOf("container_name: web");

    assert.ok(mergeIdx !== -1);
    assert.ok(mergeIdx < containerIdx, "Expected << to come before group 0 in grouped mode");
  });

  test("Transform: supports empty values (e.g., - FOO= -> FOO: '')", () => {
    const input = `services:
  app:
    environment:
      - FOO=
      - BAR=baz
      - EMPTY=
`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ transformKeyValueLists: true }));
    assert.ok(result.includes('FOO: ""') || result.includes("FOO: ''") || result.includes("FOO:"));
    assert.ok(result.includes("BAR: baz") || result.includes('BAR: "baz"'));
    assert.ok(
      result.includes('EMPTY: ""') || result.includes("EMPTY: ''") || result.includes("EMPTY:")
    );
  });

  test("Transform: safely scopes transformation to compose keys and ignores unapproved keys", () => {
    const input = `services:
  app:
    labels:
      - traefik.enable=true
    extra_hosts:
      - somehost=162.242.195.82
    command:
      - "--config=/app/config.yaml"
      - "--log-level=debug"
`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ transformKeyValueLists: true }));
    // labels and extra_hosts should transform to map
    assert.ok(result.includes("traefik.enable: true") || result.includes('traefik.enable: "true"'));
    assert.ok(
      result.includes("somehost: 162.242.195.82") || result.includes('somehost: "162.242.195.82"')
    );
    // command must remain a sequence
    assert.ok(result.includes('- "--config=/app/config.yaml"'));
    assert.ok(result.includes('- "--log-level=debug"'));
  });

  test("Merge keys (<<) after top-level anchors preserve anchor declaration before alias", () => {
    const input = `x-base: &base
  name: shared

<<: *base

services:
  web:
    image: nginx
`;
    const result = DockerComposeSorter.sort(input, cleanConfig());
    const anchorIdx = result.indexOf("x-base: &base");
    const mergeIdx = result.indexOf("<<: *base");
    assert.ok(anchorIdx !== -1, "Expected anchor to be present");
    assert.ok(mergeIdx !== -1, "Expected merge key to be present");
    assert.ok(anchorIdx < mergeIdx, "Expected anchor declaration to precede merge key alias");
  });

  test("Transform: refuses sequences with duplicate keys to prevent map key collision", () => {
    const input = `services:
  app:
    environment:
      - FOO=1
      - FOO=2
`;
    // Should safely leave the sequence untouched rather than throwing or dropping keys
    const result = DockerComposeSorter.sort(input, cleanConfig({ transformKeyValueLists: true }));
    assert.ok(result.includes("- FOO=1"), "Expected FOO=1 sequence item to be preserved");
    assert.ok(result.includes("- FOO=2"), "Expected FOO=2 sequence item to be preserved");
  });

  test("Feature: addDocumentSeparator = true does not duplicate existing separator after comments", () => {
    const input = `# File-level header comment
---
services:
  web:
    image: nginx
`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ addDocumentSeparator: true }));
    const matches = result.match(/---/g);
    assert.strictEqual(matches?.length, 1, "Expected exactly one document separator");
    const commentIdx = result.indexOf("# File-level header comment");
    const sepIdx = result.indexOf("---");
    assert.ok(commentIdx !== -1 && sepIdx !== -1);
  });
});
