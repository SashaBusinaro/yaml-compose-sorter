import assert from "node:assert/strict";
import * as vscode from "vscode";
import { DockerComposeSorter, DOCKER_COMPOSE_SELECTOR, SorterConfig } from "../../extension";

suite("Adversary Test Suite", () => {
  const DEFAULT_SERVICE_KEY_GROUPS: string[][] = [
    ["container_name"],
    ["image", "build"],
    ["restart", "depends_on"],
    ["ports", "expose"],
    ["volumes"],
    ["environment", "env_file"],
    ["networks"],
    ["labels", "healthcheck"]
  ];

  const BASE_CONFIG: SorterConfig = {
    topLevelKeyOrder: ["version", "name", "services", "volumes", "networks", "configs", "secrets"],
    serviceKeyOrder: [
      "container_name",
      "image",
      "build",
      "restart",
      "depends_on",
      "ports",
      "expose",
      "volumes",
      "environment",
      "env_file",
      "networks",
      "labels",
      "healthcheck"
    ],
    serviceKeyGroups: DEFAULT_SERVICE_KEY_GROUPS,
    useServiceKeyGroups: false,
    preserveBlankLinesWithinServiceKeyGroups: true,
    addDocumentSeparator: false,
    addBlankLinesTopLevel: true,
    removeVersionKey: false,
    transformKeyValueLists: false,
    addBlankLinesServices: true
  };

  const createConfig = (overrides: Partial<SorterConfig> = {}): SorterConfig => ({
    ...BASE_CONFIG,
    ...overrides
  });

  /*
   * ========================================================================
   * 1. Adversarial Null / Empty Scalar Spacing (Issue #34)
   * ========================================================================
   */
  suite("Issue #34: Boundary spacing & Null / Empty Scalars", () => {
    test("Deeply nested null scalar at service boundary (3 levels deep)", () => {
      const input = `services:
  web:
    build:
      context: .
      args:
        TARGET_ENV:

  api:
    image: node:20
`;
      const result = DockerComposeSorter.sort(input, createConfig());
      assert.ok(result.includes("TARGET_ENV:\n\n  api:"));
      assert.ok(!result.includes("TARGET_ENV:\n\n\n"));
    });

    test("Multiple consecutive null scalars in service mapping", () => {
      const input = `services:
  app:
    networks:
      net_a:
      net_b:
      net_c:

  worker:
    image: redis:alpine
`;
      const result = DockerComposeSorter.sort(input, createConfig());
      assert.ok(result.includes("net_c:\n\n  worker:"));
      assert.ok(!result.includes("net_c:\n\n\n"));
    });

    test("Sequence ending with null scalar before next service", () => {
      const input = `services:
  app:
    command:
      - bundle
      - exec
      -

  worker:
    image: redis:alpine
`;
      const result = DockerComposeSorter.sort(input, createConfig());
      assert.ok(result.includes("- \n\n  worker:"));
      assert.ok(!result.includes("- \n\n\n"));
    });

    test("Trailing null scalar with inline comment followed by sibling service", () => {
      const input = `services:
  web:
    networks:
      isolated_nw: # inline comment on trailing null scalar

  worker:
    image: worker:latest
`;
      const once = DockerComposeSorter.sort(input, createConfig());
      const twice = DockerComposeSorter.sort(once, createConfig());
      assert.strictEqual(twice, once);
      assert.ok(
        once.includes("isolated_nw: # inline comment on trailing null scalar\n\n  worker:")
      );
      assert.ok(!once.includes("isolated_nw: # inline comment on trailing null scalar\n\n\n"));
    });

    test("Trailing null scalar at group boundary with useServiceKeyGroups=true", () => {
      const input = `services:
  web:
    image: node:20
    build:

    ports:
      - "3000:3000"
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["image", "build"], ["ports"]]
      });
      const once = DockerComposeSorter.sort(input, config);
      const twice = DockerComposeSorter.sort(once, config);
      assert.strictEqual(twice, once);
      assert.ok(once.includes("image: node:20\n    build:\n\n    ports:"));
      assert.ok(!once.includes("build:\n\n\n"));
    });

    test("Top-level section ending with null scalar before next section", () => {
      const input = `version: "3.9"

services:
  app:
    image: app:v1

networks:
  frontend:
  backend:

volumes:
  app_data:
`;
      const result = DockerComposeSorter.sort(
        input,
        createConfig({ topLevelKeyOrder: ["version", "services", "networks", "volumes"] })
      );
      assert.ok(result.includes("backend:\n\nvolumes:"));
      assert.ok(!result.includes("backend:\n\n\n"));
    });

    test("Deep idempotency loop (10 runs) on multi-section file with null scalars", () => {
      const input = `services:
  app:
    networks:
      internal:
    build:
      args:
        ENV_VAR:

  db:
    networks:
      db_net:

networks:
  internal:
  db_net:

volumes:
  db_data:
`;
      let current = input;
      for (let i = 0; i < 10; i++) {
        const next = DockerComposeSorter.sort(current, createConfig());
        if (i > 0) {
          assert.strictEqual(next, current, `Run ${i + 1} diverged from previous output`);
        }
        current = next;
      }
      assert.ok(!current.includes("\n\n\n"));
    });

    test("addBlankLinesServices=false preserves tight service spacing with null scalars", () => {
      const input = `services:
  app:
    networks:
      outbound:
  worker:
    image: worker:latest
`;
      const result = DockerComposeSorter.sort(
        input,
        createConfig({ addBlankLinesServices: false })
      );
      assert.ok(result.includes("outbound:\n  worker:"));
      assert.ok(!result.includes("outbound:\n\n"));
    });
  });

  /*
   * ========================================================================
   * 2. Adversarial Grouped Service-Key Sorting (Issue #54 / PR #55)
   * ========================================================================
   */
  suite("Issue #54: Grouped Service-Key Sorting Adversarial Probing", () => {
    test("Custom groups with duplicate keys preserves first group assignment", () => {
      const input = `services:
  app:
    image: node:20
    ports: ["80:80"]
    command: ["npm", "start"]
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        // 'ports' appears in group 0 and group 2: group 0 should take priority
        serviceKeyGroups: [["ports"], ["image"], ["ports", "command"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });
      const result = DockerComposeSorter.sort(input, config);
      const service = result.slice(result.indexOf("  app:"));
      const portsIdx = service.indexOf("ports:");
      const imgIdx = service.indexOf("image:");
      const cmdIdx = service.indexOf("command:");

      assert.ok(portsIdx < imgIdx);
      assert.ok(imgIdx < cmdIdx);
    });

    test("Custom groups containing empty sub-arrays", () => {
      const input = `services:
  app:
    environment:
      DEBUG: "true"
    image: node:20
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [[], ["image"], [], ["environment"], []],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });
      const result = DockerComposeSorter.sort(input, config);
      assert.ok(result.includes("image: node:20\n\n    environment:"));
      assert.ok(!result.includes("image: node:20\n\n\n"));
    });

    test("Untracked service keys are sorted alphabetically after configured groups", () => {
      const input = `services:
  app:
    z_custom: 123
    image: node:20
    a_custom: 456
    m_custom: 789
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["image"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });
      const result = DockerComposeSorter.sort(input, config);
      const service = result.slice(result.indexOf("  app:"));

      const imgIdx = service.indexOf("image:");
      const aIdx = service.indexOf("a_custom:");
      const mIdx = service.indexOf("m_custom:");
      const zIdx = service.indexOf("z_custom:");

      assert.ok(imgIdx < aIdx);
      assert.ok(aIdx < mIdx);
      assert.ok(mIdx < zIdx);
      // Group separation before the untracked section
      assert.ok(service.includes("image: node:20\n\n    a_custom:"));
    });

    test("Multiple untracked keys with preserveBlankLinesWithinServiceKeyGroups=false strips internal blanks", () => {
      const input = `services:
  app:
    image: node:20
    b_unknown: 1

    a_unknown: 2
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        preserveBlankLinesWithinServiceKeyGroups: false,
        serviceKeyGroups: [["image"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });
      const result = DockerComposeSorter.sort(input, config);
      assert.ok(result.includes("a_unknown: 2\n    b_unknown: 1"));
      assert.ok(!result.includes("a_unknown: 2\n\n    b_unknown: 1"));
    });

    test("Sparse groups (first and last populated, all middle empty) have single blank line separation", () => {
      const input = `services:
  app:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
    container_name: web-app
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: DEFAULT_SERVICE_KEY_GROUPS,
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });
      const result = DockerComposeSorter.sort(input, config);
      assert.ok(result.includes("container_name: web-app\n\n    healthcheck:"));
      assert.ok(!result.includes("container_name: web-app\n\n\n"));
    });

    test("Grouped sorting combined with transformKeyValueLists=true", () => {
      const input = `services:
  app:
    environment:
      - APP_PORT=8080
      - APP_HOST=0.0.0.0
    image: node:20
    container_name: app
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        transformKeyValueLists: true,
        serviceKeyGroups: DEFAULT_SERVICE_KEY_GROUPS,
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });
      const result = DockerComposeSorter.sort(input, config);
      assert.ok(result.includes("container_name: app\n\n    image: node:20\n\n    environment:"));
      assert.ok(result.includes("APP_PORT: 8080") || result.includes('APP_PORT: "8080"'));
      assert.ok(result.includes("APP_HOST: 0.0.0.0"));
    });

    test("10-iteration idempotency loop on grouped service sorting", () => {
      const input = `services:
  web:
    image: nginx:alpine
    container_name: web
    ports:
      - "80:80"
    environment:
      NGINX_PORT: "80"
    restart: always

  api:
    build: .
    depends_on:
      - web
    labels:
      traefik.enable: "true"
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: DEFAULT_SERVICE_KEY_GROUPS
      });

      let current = input;
      for (let i = 0; i < 10; i++) {
        const next = DockerComposeSorter.sort(current, config);
        if (i > 0) {
          assert.strictEqual(next, current, `Grouped sorting diverged on iteration ${i + 1}`);
        }
        current = next;
      }
    });

    test("Comments attached to keys within groups move with their keys", () => {
      const input = `services:
  web:
    image: node:20
    # Port mappings comment
    ports:
      - "80:80"
    # Restart policy comment
    restart: always
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["image"], ["restart"], ["ports"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });
      const result = DockerComposeSorter.sort(input, config);
      const restartIdx = result.indexOf("restart: always");
      const restartCommentIdx = result.indexOf("# Restart policy comment");
      const portsIdx = result.indexOf("ports:");
      const portsCommentIdx = result.indexOf("# Port mappings comment");

      assert.ok(restartCommentIdx < restartIdx);
      assert.ok(restartIdx < portsCommentIdx);
      assert.ok(portsCommentIdx < portsIdx);
    });

    test("Trailing comments at group boundaries don't cause double blank line stacking", () => {
      const input = `services:
  web:
    image: node:20 # Docker image tag
    # End of image section

    ports:
      - "8080:8080"
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["image"], ["ports"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });
      const once = DockerComposeSorter.sort(input, config);
      const twice = DockerComposeSorter.sort(once, config);
      assert.strictEqual(twice, once);
      assert.ok(!once.includes("\n\n\n"));
    });
  });

  /*
   * ========================================================================
   * 3. Adversarial Jinja2 Template Support (Issue #45)
   * ========================================================================
   */
  suite("Issue #45: Jinja2 Templates Adversarial Probing", () => {
    test("DOCKER_COMPOSE_SELECTOR matches all template extensions and language variants", () => {
      const files = [
        // Standard .j2 extensions
        { path: "/project/docker-compose.yml.j2", lang: "plaintext" },
        { path: "/project/docker-compose.yaml.j2", lang: "plaintext" },
        { path: "/project/compose.yml.j2", lang: "plaintext" },
        { path: "/project/compose.yaml.j2", lang: "plaintext" },
        // Multi-part filenames
        { path: "/project/docker-compose.prod.yml.j2", lang: "plaintext" },
        { path: "/project/docker-compose.staging.yaml.j2", lang: "plaintext" },
        { path: "/project/compose.dev.yml.j2", lang: "plaintext" },
        { path: "/project/compose.override.yaml.j2", lang: "plaintext" },
        // Direct .j2 and .jinja/.jinja2 extensions
        { path: "/project/docker-compose.j2", lang: "plaintext" },
        { path: "/project/compose.j2", lang: "plaintext" },
        { path: "/project/docker-compose.jinja", lang: "plaintext" },
        { path: "/project/compose.jinja2", lang: "plaintext" },
        // Language mode activations
        { path: "/custom/docker-compose.custom", lang: "jinja" },
        { path: "/custom/compose.custom", lang: "jinja-yaml" },
        { path: "/custom/docker-compose.yml", lang: "dockercompose" }
      ];

      for (const f of files) {
        const doc = { uri: vscode.Uri.file(f.path), languageId: f.lang };
        const score = vscode.languages.match(DOCKER_COMPOSE_SELECTOR, doc as any);
        assert.ok(score > 0, `Expected DOCKER_COMPOSE_SELECTOR to match: ${f.path} (${f.lang})`);
      }
    });

    test("Complex Jinja2 template expressions (filters, pipes, math, variables)", () => {
      const input = `services:
  web:
    environment:
      PORT: "{{ env_port | default(3000) }}"
      DEBUG: "{{ debug | default(false) | lower }}"
      SECRET: "{{ vault_secret }}"
    ports:
      - "{{ (host_port | int) + 1 }}:{{ container_port }}"
    image: "{{ registry }}/{{ image_name }}:{{ tag | default('latest') }}"
    container_name: "{{ project_name }}_{{ env }}"
`;
      const result = DockerComposeSorter.sort(input, createConfig());
      const web = result.slice(result.indexOf("  web:"));

      const cNameIdx = web.indexOf("container_name:");
      const imgIdx = web.indexOf("image:");
      const portsIdx = web.indexOf("ports:");
      const envIdx = web.indexOf("environment:");

      assert.ok(cNameIdx < imgIdx);
      assert.ok(imgIdx < portsIdx);
      assert.ok(portsIdx < envIdx);
      assert.ok(result.includes('"{{ env_port | default(3000) }}"'));
      assert.ok(result.includes('"{{ (host_port | int) + 1 }}:{{ container_port }}"'));
    });

    test("Jinja2 template sorting is strictly idempotent over multiple runs", () => {
      const input = `services:
  web:
    image: "{{ image }}"
    container_name: "{{ name }}"
    environment:
      KEY: "{{ val }}"
`;
      let current = input;
      for (let i = 0; i < 5; i++) {
        const next = DockerComposeSorter.sort(current, createConfig());
        if (i > 0) {
          assert.strictEqual(next, current);
        }
        current = next;
      }
    });

    test("Invalid YAML syntax in Jinja2 template throws descriptive error", () => {
      // Unquoted control flow block is illegal YAML syntax
      const input = `services:
  web:
    image: node:20
    {% if enable_ports %}
    ports:
      - "80:80"
    {% endif %}
`;
      assert.throws(() => {
        DockerComposeSorter.sort(input, createConfig());
      }, /Invalid YAML/);
    });
  });

  /*
   * ========================================================================
   * 4. Combined Adversarial Scenarios & Stress Tests
   * ========================================================================
   */
  suite("Combined Stress & Robustness Tests", () => {
    test("CRLF line endings with grouped sorting, null scalars, and Jinja expressions", () => {
      const input =
        "services:\r\n" +
        "  web:\r\n" +
        '    image: "{{ image }}"\r\n' +
        "    networks:\r\n" +
        "      default:\r\n" +
        "\r\n" +
        "  api:\r\n" +
        "    image: api:v1\r\n";

      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["image"], ["networks"]]
      });

      const result = DockerComposeSorter.sort(input, config);
      assert.ok(result.includes("\r\n"));
      assert.ok(!result.replace(/\r\n/g, "").includes("\n"));
      assert.ok(result.includes("default:\r\n\r\n  api:"));
      assert.ok(!result.includes("default:\r\n\r\n\r\n"));
    });

    test("Multi-document YAML file with grouped sorting and document separator", () => {
      const input = `services:
  web:
    image: nginx
    container_name: web
---
services:
  db:
    image: postgres
    container_name: db
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["container_name"], ["image"]],
        addDocumentSeparator: true,
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });

      const result = DockerComposeSorter.sort(input, config);
      assert.ok(result.startsWith("---\n"));
      assert.strictEqual(result.match(/---/g)?.length, 2);
      assert.ok(result.includes("container_name: web\n\n    image: nginx"));
      assert.ok(result.includes("container_name: db\n\n    image: postgres"));
    });

    test("YAML Anchors and merge keys across grouped services", () => {
      const input = `x-base: &base
  restart: always

services:
  app:
    environment:
      ENV: prod
    image: node:20
    container_name: app
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["container_name"], ["image"], ["environment"]]
      });
      const once = DockerComposeSorter.sort(input, config);
      const twice = DockerComposeSorter.sort(once, config);
      assert.strictEqual(twice, once);
      assert.ok(once.includes("&base"));
      assert.ok(once.includes("container_name: app\n\n    image: node:20\n\n    environment:"));
    });

    test("YAML merge key (<<: *base) inside service with useServiceKeyGroups=true", () => {
      const input = `x-base: &base
  restart: always

services:
  app:
    <<: *base
    environment:
      ENV: prod
    image: node:20
    container_name: app
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["container_name"], ["image"], ["environment"]]
      });
      const once = DockerComposeSorter.sort(input, config);
      const twice = DockerComposeSorter.sort(once, config);
      assert.strictEqual(twice, once);
      assert.ok(once.includes("<<: *base"));
      assert.ok(once.includes("container_name: app\n\n    image: node:20\n\n    environment:"));
    });

    test("Empty service declaration (null scalar service) followed by standard service", () => {
      const input = `services:
  empty_service:

  worker:
    image: redis:alpine
`;
      const once = DockerComposeSorter.sort(input, createConfig());
      const twice = DockerComposeSorter.sort(once, createConfig());
      assert.strictEqual(twice, once);
      assert.ok(once.includes("empty_service:\n\n  worker:"));
      assert.ok(!once.includes("empty_service:\n\n\n"));
    });

    test("Top-level section with inline comment and null value followed by next section", () => {
      const input = `services:
  web:
    image: nginx

volumes: # no persistent volumes yet

networks:
  default:
`;
      const once = DockerComposeSorter.sort(
        input,
        createConfig({ topLevelKeyOrder: ["services", "volumes", "networks"] })
      );
      const twice = DockerComposeSorter.sort(
        once,
        createConfig({ topLevelKeyOrder: ["services", "volumes", "networks"] })
      );
      assert.strictEqual(twice, once);
      assert.ok(once.includes("volumes: # no persistent volumes yet\n\nnetworks:"));
      assert.ok(!once.includes("volumes: # no persistent volumes yet\n\n\n"));
    });

    test("Grouped sorting with preserveBlankLinesWithinServiceKeyGroups=false preserves intra-group comments", () => {
      const input = `services:
  app:
    image: node:20
    # build config below
    build: .
`;
      const config = createConfig({
        useServiceKeyGroups: true,
        preserveBlankLinesWithinServiceKeyGroups: false,
        serviceKeyGroups: [["image", "build"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });
      const result = DockerComposeSorter.sort(input, config);
      assert.ok(result.includes("image: node:20\n    # build config below\n    build: ."));
    });

    test("Jinja2 templated keys and complex expressions inside compose templates", () => {
      const input = `services:
  web:
    labels:
      "traefik.http.routers.{{ service_name }}.rule": "Host(\`{{ domain }}\`)"
    image: "{{ image_repo }}:{{ tag }}"
    container_name: "{{ service_name }}-container"
`;
      const once = DockerComposeSorter.sort(input, createConfig());
      const twice = DockerComposeSorter.sort(once, createConfig());
      assert.strictEqual(twice, once);
      assert.ok(once.includes("traefik.http.routers.{{ service_name }}.rule"));
    });

    test("Multi-document YAML with CRLF line endings and grouped service sorting", () => {
      const input =
        "services:\r\n" +
        "  web:\r\n" +
        "    image: nginx\r\n" +
        "    container_name: web\r\n" +
        "---\r\n" +
        "services:\r\n" +
        "  db:\r\n" +
        "    image: postgres\r\n" +
        "    container_name: db\r\n";

      const config = createConfig({
        useServiceKeyGroups: true,
        serviceKeyGroups: [["container_name"], ["image"]],
        addBlankLinesTopLevel: false,
        addBlankLinesServices: false
      });

      const result = DockerComposeSorter.sort(input, config);
      assert.ok(result.includes("\r\n"));
      assert.ok(!result.replace(/\r\n/g, "").includes("\n"));
      assert.ok(result.includes("container_name: web\r\n\r\n    image: nginx"));
      assert.ok(result.includes("container_name: db\r\n\r\n    image: postgres"));
    });

    test("Gracefully handles non-map root documents without error", () => {
      assert.strictEqual(DockerComposeSorter.sort("", createConfig()), "");
      assert.strictEqual(DockerComposeSorter.sort("   \n", createConfig()), "   \n");
      assert.strictEqual(
        DockerComposeSorter.sort("# comment only\n", createConfig()),
        "# comment only\n"
      );
      assert.strictEqual(
        DockerComposeSorter.sort("- item1\n- item2\n", createConfig()),
        "- item1\n- item2\n"
      );
    });
  });
});
