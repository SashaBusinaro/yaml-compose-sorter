import * as vscode from "vscode";
import * as yaml from "yaml";

// ============================================================================
// Constants & Configuration
// ============================================================================

const DOCKER_COMPOSE_SELECTOR: vscode.DocumentSelector = [
  { language: "dockercompose" },
  { language: "yaml", pattern: "**/docker-compose.{yml,yaml}" },
  { language: "yaml", pattern: "**/compose.{yml,yaml}" },
  { language: "yaml", pattern: "**/{docker-compose,compose}.*.{yml,yaml}" }
];

export interface SorterConfig {
  topLevelKeyOrder: string[];
  serviceKeyOrder: string[];
  addDocumentSeparator: boolean;
  addBlankLinesTopLevel: boolean;
  addBlankLinesServices: boolean;
  removeVersionKey: boolean;
  transformKeyValueLists: boolean;
}

// ============================================================================
// Extension Lifecycle
// ============================================================================

export function activate(context: vscode.ExtensionContext): void {
  const formatter = new DockerComposeFormattingProvider();

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(DOCKER_COMPOSE_SELECTOR, formatter)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("yaml-compose-sorter.sort", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const edits = formatter.provideDocumentFormattingEdits(
        editor.document,
        {
          insertSpaces: editor.options.insertSpaces !== false,
          tabSize: typeof editor.options.tabSize === "number" ? editor.options.tabSize : 2
        },
        new vscode.CancellationTokenSource().token
      );

      if (edits && Array.isArray(edits) && edits.length > 0) {
        await editor.edit((editBuilder) => {
          edits.forEach((edit) => editBuilder.replace(edit.range, edit.newText));
        });
      }
    })
  );
}

export function deactivate(): void {}

// ============================================================================
// Formatter Provider
// ============================================================================

class DockerComposeFormattingProvider implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    if (token.isCancellationRequested) {
      return [];
    }

    const text = document.getText();
    const config = this.getConfiguration();
    // YAML forbids tab indentation, so fall back to 2 spaces when tabs are requested
    const indent =
      options.insertSpaces && Number.isInteger(options.tabSize) && options.tabSize > 0
        ? options.tabSize
        : 2;

    try {
      const formatted = DockerComposeSorter.sort(text, config, indent);

      if (text === formatted) {
        return [];
      }

      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));

      return [vscode.TextEdit.replace(fullRange, formatted)];
    } catch (error) {
      console.error("Docker Compose Sorter Error:", error);
      vscode.window.showErrorMessage(`Compose Sorter failed: ${(error as Error).message}`);
      return [];
    }
  }

  private getConfiguration(): SorterConfig {
    const config = vscode.workspace.getConfiguration("yaml-compose-sorter");
    return {
      topLevelKeyOrder: config.get<string[]>("topLevelKeyOrder") ?? [],
      serviceKeyOrder: config.get<string[]>("serviceKeyOrder") ?? [],
      addDocumentSeparator: config.get<boolean>("addDocumentSeparator") ?? false,
      addBlankLinesTopLevel: config.get<boolean>("addBlankLinesBetweenTopLevelKeys") ?? true,
      removeVersionKey: config.get<boolean>("removeVersionKey") ?? false,
      transformKeyValueLists: config.get<boolean>("transformKeyValueLists") ?? false,
      addBlankLinesServices: config.get<boolean>("addBlankLinesBetweenServices") ?? true
    };
  }
}

// ============================================================================
// Core Logic (AST Manipulation)
// ============================================================================

export class DockerComposeSorter {
  public static sort(yamlText: string, config: SorterConfig, indent: number = 2): string {
    const usesCrlf = yamlText.includes("\r\n");
    const source = usesCrlf ? yamlText.replace(/\r\n/g, "\n") : yamlText;

    const docs = yaml.parseAllDocuments(source, {
      keepSourceTokens: false // Regenerate tokens for clean sorting
    });

    if (docs.length === 0) {
      return yamlText;
    }

    for (const doc of docs) {
      if (doc.errors.length > 0) {
        throw new Error(`Invalid YAML: ${doc.errors[0].message}`);
      }
    }

    // Single non-map document (scalar, list, empty): nothing to sort
    if (docs.length === 1 && (!docs[0].contents || !yaml.isMap(docs[0].contents))) {
      return yamlText;
    }

    let output = docs
      .map((doc) => this.processDocument(doc, config, indent))
      .map((text, index) => (index > 0 && !text.startsWith("---") ? `---\n${text}` : text))
      .join("");

    if (config.addDocumentSeparator && !output.startsWith("---")) {
      output = "---\n" + output;
    }

    return usesCrlf ? output.replace(/\n/g, "\r\n") : output;
  }

  private static processDocument(doc: yaml.Document, config: SorterConfig, indent: number): string {
    const stringifyOptions: yaml.ToStringOptions = {
      lineWidth: 0,
      minContentWidth: 0,
      indent
    };

    if (!doc.contents || !yaml.isMap(doc.contents)) {
      return doc.toString(stringifyOptions);
    }

    const contents = doc.contents as yaml.YAMLMap;

    // 1. Remove Version if requested
    if (config.removeVersionKey && contents.has("version")) {
      contents.delete("version");
    }

    // 2. Sort Top Level
    this.sortMap(contents, config.topLevelKeyOrder, true);

    // 3. Process Services
    const services = contents.get("services");
    if (services && yaml.isMap(services)) {
      services.items.forEach((pair) => {
        if (yaml.isMap(pair.value)) {
          this.sortMap(pair.value as yaml.YAMLMap, config.serviceKeyOrder);
        }
      });
    }

    // 4. Transform Lists ["KEY=VAL"] -> { KEY: VAL }
    if (config.transformKeyValueLists) {
      this.transformListsToMaps(doc);
    }

    // 5. Apply Spacing
    this.applySpacing(contents, config);

    // 6. Serialize
    return doc.toString(stringifyOptions);
  }

  private static sortMap(
    map: yaml.YAMLMap,
    order: string[],
    extensionKeysFirst: boolean = false
  ): void {
    map.items.sort((a, b) => {
      const keyA = String(a.key);
      const keyB = String(b.key);

      const idxA = order.indexOf(keyA);
      const idxB = order.indexOf(keyB);

      // Extension fields (x-*) usually hold YAML anchors, so they must stay
      // before the keys that reference them. Keep their original relative
      // order (anchors may reference each other) unless explicitly configured.
      const extA = extensionKeysFirst && idxA === -1 && keyA.startsWith("x-");
      const extB = extensionKeysFirst && idxB === -1 && keyB.startsWith("x-");
      if (extA && extB) {
        return 0;
      }
      if (extA) {
        return -1;
      }
      if (extB) {
        return 1;
      }

      if (idxA > -1 && idxB > -1) {
        return idxA - idxB;
      }
      if (idxA > -1) {
        return -1;
      }
      if (idxB > -1) {
        return 1;
      }

      return keyA.localeCompare(keyB);
    });
  }

  private static transformListsToMaps(doc: yaml.Document): void {
    yaml.visit(doc, {
      Pair(_, pair) {
        // Keys can be non-scalar (e.g. merge keys or complex keys): leave those untouched
        if (!yaml.isScalar(pair.key) || typeof pair.key.value !== "string") {
          return undefined;
        }

        // Skip 'command' or 'entrypoint' as they strictly require array syntax often
        const key = pair.key.value;
        if (["command", "entrypoint"].includes(key)) {
          return yaml.visit.SKIP;
        }

        if (yaml.isSeq(pair.value) && DockerComposeSorter.canTransformSeq(pair.value)) {
          pair.value = DockerComposeSorter.seqToMap(pair.value);
        }
      }
    });
  }

  private static canTransformSeq(seq: yaml.YAMLSeq): boolean {
    if (seq.items.length === 0) {
      return false;
    }
    return seq.items.every((item) => {
      if (!yaml.isScalar(item) || typeof item.value !== "string") {
        return false;
      }
      const str = item.value;
      return str.includes("=") && !str.startsWith("=") && !str.endsWith("=");
    });
  }

  private static seqToMap(seq: yaml.YAMLSeq): yaml.YAMLMap {
    const map = new yaml.YAMLMap();
    if (seq.commentBefore) {
      map.commentBefore = seq.commentBefore;
    }
    if (seq.comment) {
      map.comment = seq.comment;
    }

    seq.items.forEach((item) => {
      if (yaml.isScalar(item) && typeof item.value === "string") {
        const [key, ...rest] = item.value.split("=");
        const val = rest.join("=");

        // Preserve comments
        const pair = new yaml.Pair(new yaml.Scalar(key.trim()), new yaml.Scalar(val));
        if (item.comment) {
          pair.value!.comment = item.comment;
        }
        if (item.commentBefore) {
          pair.key!.commentBefore = item.commentBefore;
        }

        map.add(pair);
      }
    });
    return map;
  }

  private static lastValueHasComment(value: any): boolean {
    if (!value) {
      return false;
    }
    if (value.comment) {
      return true;
    }
    if (yaml.isMap(value) && value.items.length > 0) {
      return DockerComposeSorter.lastValueHasComment(value.items[value.items.length - 1].value);
    }
    if (yaml.isSeq(value) && value.items.length > 0) {
      return DockerComposeSorter.lastValueHasComment(value.items[value.items.length - 1]);
    }
    return false;
  }

  private static applySpacing(contents: yaml.YAMLMap, config: SorterConfig): void {
    const resetSpacing = (node: any) => {
      if (node && node.key) {
        node.key.spaceBefore = false;
      }
    };

    contents.items.forEach(resetSpacing);

    // Top Level Spacing
    if (config.addBlankLinesTopLevel) {
      contents.items.forEach((item, index) => {
        if (index > 0 && yaml.isScalar(item.key)) {
          // Don't add spaceBefore if the previous item ends with a trailing
          // the yaml stringifier already inserts a blank line there
          if (!DockerComposeSorter.lastValueHasComment(contents.items[index - 1].value)) {
            item.key.spaceBefore = true;
          }
        }
      });
    }

    // Service Level Spacing
    if (config.addBlankLinesServices) {
      const services = contents.get("services");
      if (services && yaml.isMap(services)) {
        services.items.forEach((item, index) => {
          if (index > 0 && yaml.isScalar(item.key)) {
            if (!DockerComposeSorter.lastValueHasComment(services.items[index - 1].value)) {
              item.key.spaceBefore = true;
            }
          }
        });
      }
    }
  }
}
