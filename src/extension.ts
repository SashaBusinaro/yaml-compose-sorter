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
    vscode.languages.registerDocumentFormattingEditProvider(
      DOCKER_COMPOSE_SELECTOR,
      formatter
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("yaml-compose-sorter.sort", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      
      const edits = formatter.provideDocumentFormattingEdits(
        editor.document, 
        { insertSpaces: true, tabSize: 2 } as vscode.FormattingOptions, 
        new vscode.CancellationTokenSource().token
      );

      if (edits && Array.isArray(edits) && edits.length > 0) {
        await editor.edit((editBuilder) => {
          edits.forEach(edit => editBuilder.replace(edit.range, edit.newText));
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
    const text = document.getText();
    const config = this.getConfiguration();

    try {
      const formatted = DockerComposeSorter.sort(text, config);
      
      if (text === formatted) {
        return [];
      }

      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(text.length)
      );

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
      addBlankLinesServices: config.get<boolean>("addBlankLinesBetweenServices") ?? true,
    };
  }
}

// ============================================================================
// Core Logic (AST Manipulation)
// ============================================================================

export class DockerComposeSorter {
  public static sort(yamlText: string, config: SorterConfig): string {
    const doc = yaml.parseDocument(yamlText, { 
      keepSourceTokens: false // Regenerate tokens for clean sorting
    });

    if (doc.errors.length > 0) {
      throw new Error("Syntax error in YAML file.");
    }

    if (!doc.contents || !yaml.isMap(doc.contents)) {
      return yamlText;
    }

    const contents = doc.contents as yaml.YAMLMap;

    // 1. Remove Version if requested
    if (config.removeVersionKey && contents.has("version")) {
      contents.delete("version");
    }

    // 2. Sort Top Level
    this.sortMap(contents, config.topLevelKeyOrder);

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
    let output = doc.toString({
      lineWidth: 0,
      minContentWidth: 0,
      indent: 2
    });

    if (config.addDocumentSeparator && !output.startsWith("---")) {
      output = "---\n" + output;
    }

    return output;
  }

  private static sortMap(map: yaml.YAMLMap, order: string[]): void {
    map.items.sort((a, b) => {
      const keyA = String(a.key);
      const keyB = String(b.key);
      
      const idxA = order.indexOf(keyA);
      const idxB = order.indexOf(keyB);

      if (idxA > -1 && idxB > -1) { return idxA - idxB; }
      if (idxA > -1) { return -1; }
      if (idxB > -1) { return 1; }
      
      return keyA.localeCompare(keyB);
    });
  }

  private static transformListsToMaps(doc: yaml.Document): void {
    yaml.visit(doc, {
      Pair(_, pair) {
        // Skip 'command' or 'entrypoint' as they strictly require array syntax often
        const key = (pair.key as yaml.Scalar).value as string;
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
    if (seq.items.length === 0) { return false; }
    return seq.items.every(item => {
      if (!yaml.isScalar(item) || typeof item.value !== 'string') { return false; }
      const str = item.value;
      return str.includes('=') && !str.startsWith('=') && !str.endsWith('=');
    });
  }

  private static seqToMap(seq: yaml.YAMLSeq): yaml.YAMLMap {
    const map = new yaml.YAMLMap();
    if (seq.commentBefore) { map.commentBefore = seq.commentBefore; }
    if (seq.comment) { map.comment = seq.comment; }

    seq.items.forEach(item => {
      if (yaml.isScalar(item) && typeof item.value === 'string') {
        const [key, ...rest] = item.value.split('=');
        const val = rest.join('=');
        
        // Preserve comments
        const pair = new yaml.Pair(new yaml.Scalar(key.trim()), new yaml.Scalar(val));
        if (item.comment) { pair.value!.comment = item.comment; }
        if (item.commentBefore) { pair.key!.commentBefore = item.commentBefore; }
        
        map.add(pair);
      }
    });
    return map;
  }

  private static applySpacing(contents: yaml.YAMLMap, config: SorterConfig): void {
    const resetSpacing = (node: any) => {
        if(node && node.key) { node.key.spaceBefore = false; }
    };

    contents.items.forEach(resetSpacing);
    
    // Top Level Spacing
    if (config.addBlankLinesTopLevel) {
      contents.items.forEach((item, index) => {
        if (index > 0 && yaml.isScalar(item.key)) {
          item.key.spaceBefore = true;
        }
      });
    }

    // Service Level Spacing
    if (config.addBlankLinesServices) {
      const services = contents.get("services");
      if (services && yaml.isMap(services)) {
        services.items.forEach((item, index) => {
          if (index > 0 && yaml.isScalar(item.key)) {
             item.key.spaceBefore = true;
          }
        });
      }
    }
  }
}