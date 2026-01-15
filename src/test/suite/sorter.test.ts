import * as assert from "assert";
import { expect } from "chai";
import { DockerComposeSorter, SorterConfig } from "../../extension";

suite("DockerComposeSorter Test Suite", () => {
    
  const DEFAULT_CONFIG: SorterConfig = {
    topLevelKeyOrder: [
      "version",
      "name",
      "services",
      "volumes",
      "networks",
      "configs",
      "secrets"
    ],
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
    addDocumentSeparator: false,
    addBlankLinesTopLevel: true,
    removeVersionKey: false,
    transformKeyValueLists: false,
    addBlankLinesServices: true,
  };

  /** Helper to merge defaults with overrides */
  const cleanConfig = (overrides: Partial<SorterConfig> = {}): SorterConfig => ({
    ...DEFAULT_CONFIG,
    ...overrides
  });

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
    expect(result.trim()).to.equal(expected.trim());
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
    const result = DockerComposeSorter.sort(input, cleanConfig({ addBlankLinesServices: false, addBlankLinesTopLevel: false }));
    
    const lines = result.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    
    // Check order by finding lines that START with the key
    const containerIdx = lines.findIndex(l => l.trim().startsWith("container_name:"));
    const imageIdx = lines.findIndex(l => l.trim().startsWith("image:"));
    const portsIdx = lines.findIndex(l => l.trim().startsWith("ports:"));
    
    expect(containerIdx, "container_name not found").to.be.greaterThan(-1);
    expect(imageIdx, "image not found").to.be.greaterThan(-1);
    expect(portsIdx, "ports not found").to.be.greaterThan(-1);

    expect(containerIdx).to.be.lessThan(imageIdx); // container_name < image
    expect(imageIdx).to.be.lessThan(portsIdx); // image < ports
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
    
    const result = DockerComposeSorter.sort(input, cleanConfig({ addBlankLinesServices: false, addBlankLinesTopLevel: false }));
    
    const lines = result.split("\n").map(l => l.trim());
    const imgIdx = lines.findIndex(l => l.startsWith("image:"));
    const appleIdx = lines.findIndex(l => l.startsWith("apple:"));
    const zebraIdx = lines.findIndex(l => l.startsWith("zebra:"));

    expect(imgIdx).to.be.lessThan(appleIdx);
    expect(appleIdx).to.be.lessThan(zebraIdx);
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
    expect(result).to.contain("a: 1");
    expect(result.indexOf("a: 1")).to.be.lessThan(result.indexOf("b: 1"));
    
    expect(result).to.contain("c: 1");
    expect(result.indexOf("c: 1")).to.be.lessThan(result.indexOf("d: 1"));
  });

  /* 
   * ==========================================
   * 3. Feature Flags
   * ==========================================
   */
  test("Feature: removeVersionKey = true", () => {
    const input = `version: '3.8'\nservices: {}`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ removeVersionKey: true }));
    expect(result).to.not.contain("version:");
    expect(result).to.contain("services:");
  });

  test("Feature: removeVersionKey = false", () => {
    const input = `version: '3.8'\nservices: {}`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ removeVersionKey: false }));
    expect(result).to.contain("version:");
  });

  test("Feature: addDocumentSeparator = true", () => {
    const input = `services: {}`;
    const result = DockerComposeSorter.sort(input, cleanConfig({ addDocumentSeparator: true }));
    expect(result.startsWith("---\n")).to.be.true;
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
    const result2 = DockerComposeSorter.sort("services: {}", cleanConfig({ addDocumentSeparator: false }));
    expect(result2.startsWith("---")).to.be.false;
  });

  test("Feature: addBlankLinesTopLevel", () => {
      const input = `version: '3'\nservices: {}`;
      const result = DockerComposeSorter.sort(input, cleanConfig({ addBlankLinesTopLevel: true }));
      expect(result).to.contain("\n\nservices:");
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
      expect(result).to.contain("NODE_ENV: production");
      // "true" might be quoted or not depending on YAML version/parser
      expect(result).to.satisfy((s: string) => s.includes("DEBUG: true") || s.includes('DEBUG: "true"') || s.includes("DEBUG: 'true'"));
      expect(result).to.not.contain("- NODE_ENV=production");
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
      expect(result).to.equal("");
  });

  test("Edge Case: Invalid YAML throws error", () => {
      const input = "services: {"; // Missing closing brace
      expect(() => DockerComposeSorter.sort(input, cleanConfig())).to.throw("Syntax error in YAML file");
  });

  test("Edge Case: File already sorted should remain (mostly) unchanged", () => {
      const input = `version: '3.8'

services:
  web:
    image: nginx
`;
      // If we use same settings, it might change spacing slightly if original spacing was weird, 
      // but structural content/order should match.
      const result = DockerComposeSorter.sort(input, cleanConfig({ 
          addBlankLinesTopLevel: true, 
          addBlankLinesServices: false // input doesn't have blank lines in service
      }));
      // Standardize quotes or spacing might change
      expect(result).to.contain("image: nginx");
      expect(result).to.contain("services:");
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
      expect(result).to.contain("# Header Comment");
      expect(result).to.contain("# Service Comment");
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
      
      expect(imgIdx).to.be.lessThan(portsIdx); // Sorted
      
      // Comments must stay with their keys
      expect(imgCommentIdx).to.be.lessThan(imgIdx);
      expect(imgIdx - imgCommentIdx).to.be.lessThan(50); // Close proximity
      
      expect(result.indexOf("# Ports config")).to.be.lessThan(portsIdx);
  });

  test("Comments: Inline comments preserved", () => {
     const input = `
services:
  web:
    image: nginx # The image
`; 
     const result = DockerComposeSorter.sort(input, cleanConfig());
     expect(result).to.contain("image: nginx # The image");
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
      expect(result).to.contain("DB_URI:");
      expect(result).to.contain("postgres://user:pass@localhost:5432/db");
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
      expect(result).to.contain("- \"JUST_A_STRING\"");
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
      
      expect(result).to.contain("ENV: prod");
      expect(result).to.contain("# Prod env");
      expect(result).to.contain("# Inline too");
      
      // Ensure comment is attached to the new map pair
      const lines = result.split("\n");
      const commentIdx = lines.findIndex(l => l.includes("# Prod env"));
      const keyIdx = lines.findIndex(l => l.includes("ENV: prod"));
      
      // Usually comment is line before
      expect(commentIdx).to.not.equal(-1);
      expect(keyIdx).to.not.equal(-1);
      expect(commentIdx).to.be.lessThan(keyIdx);
  });
});
