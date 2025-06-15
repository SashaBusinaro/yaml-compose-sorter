import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("YAML Compose Sorter sorts top-level keys correctly", () => {
    const input = {
      networks: { frontend: { driver: "bridge" } },
      version: "3.8",
      services: { web: { image: "nginx" } },
      volumes: { data: null },
    };

    const expectedOrder = ["version", "services", "volumes", "networks"];
    const sortedKeys = Object.keys(sortObjectKeys(input, expectedOrder));

    assert.deepStrictEqual(sortedKeys, expectedOrder);
  });

  test("YAML Compose Sorter sorts service keys correctly", () => {
    const serviceInput = {
      ports: ["80:80"],
      image: "nginx",
      container_name: "my-nginx",
      volumes: ["./html:/usr/share/nginx/html"],
      restart: "always",
    };

    const expectedOrder = [
      "container_name",
      "image",
      "restart",
      "ports",
      "volumes",
    ];
    const sortedKeys = Object.keys(sortObjectKeys(serviceInput, expectedOrder));

    assert.deepStrictEqual(sortedKeys, expectedOrder);
  });

  test("YAML Compose Sorter handles missing keys gracefully", () => {
    const input = {
      image: "nginx",
      ports: ["80:80"],
    };

    const keyOrder = ["container_name", "image", "ports", "volumes"];
    const sortedKeys = Object.keys(sortObjectKeys(input, keyOrder));

    // Should only contain the keys that exist, in the specified order
    assert.deepStrictEqual(sortedKeys, ["image", "ports"]);
  });

  test("YAML Compose Sorter puts unknown keys at the end", () => {
    const input = {
      unknown_key: "value",
      image: "nginx",
      another_unknown: "value",
    };

    const keyOrder = ["image"];
    const sortedKeys = Object.keys(sortObjectKeys(input, keyOrder));

    // Known keys first, then unknown keys alphabetically
    assert.deepStrictEqual(sortedKeys, [
      "image",
      "another_unknown",
      "unknown_key",
    ]);
  });
});

// Helper function for testing (duplicate from extension.ts for testing)
function sortObjectKeys(obj: any, keyOrder: string[]): any {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return obj;
  }

  const sortedObj: any = {};
  const objKeys = Object.keys(obj);

  // First, add keys in the specified order
  for (const key of keyOrder) {
    if (objKeys.includes(key)) {
      sortedObj[key] = obj[key];
    }
  }

  // Then add any remaining keys in alphabetical order
  const remainingKeys = objKeys.filter((key) => !keyOrder.includes(key)).sort();

  for (const key of remainingKeys) {
    sortedObj[key] = obj[key];
  }

  return sortedObj;
}
