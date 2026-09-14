import * as vscode from "vscode";
import { DockerComposeSorter, SorterConfig, DEFAULT_CONFIG } from "./core";

// Re-export core types and classes for backward compatibility
export { DockerComposeSorter, SorterConfig } from "./core";

// ============================================================================
// Constants & Configuration
// ============================================================================

export const DOCKER_COMPOSE_SELECTOR: vscode.DocumentSelector = [
  { language: "dockercompose" },
  { language: "yaml", pattern: "**/docker-compose.{yml,yaml}" },
  { language: "yaml", pattern: "**/compose.{yml,yaml}" },
  { language: "yaml", pattern: "**/{docker-compose,compose}.*.{yml,yaml}" },
  { pattern: "**/docker-compose.{yml,yaml}.j2" },
  { pattern: "**/compose.{yml,yaml}.j2" },
  { pattern: "**/{docker-compose,compose}.*.{yml,yaml}.j2" },
  { pattern: "**/{docker-compose,compose}*.{j2,jinja,jinja2}" },
  { language: "jinja-yaml", pattern: "**/{docker-compose,compose}*" },
  { language: "jinja", pattern: "**/{docker-compose,compose}*" }
];

// ============================================================================
// Extension Lifecycle
// ============================================================================

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("Docker Compose Sorter");
  context.subscriptions.push(outputChannel);

  const formatter = new DockerComposeFormattingProvider(outputChannel);

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(DOCKER_COMPOSE_SELECTOR, formatter)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("yaml-compose-sorter.sort", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const document = editor.document;
      const text = document.getText();
      const config = formatter.getConfiguration(document);
      const parsedTabSize = Number(editor.options.tabSize);
      const indent =
        editor.options.insertSpaces !== false &&
        Number.isInteger(parsedTabSize) &&
        parsedTabSize > 0
          ? parsedTabSize
          : 2;

      try {
        const formatted = DockerComposeSorter.sort(text, config, indent);
        if (text === formatted) {
          return;
        }

        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(text.length)
        );

        await editor.edit((editBuilder) => {
          editBuilder.replace(fullRange, formatted);
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(
          `[${new Date().toISOString()}] Manual sort failed for ${document.fileName}: ${msg}`
        );
        vscode.window.showErrorMessage(`Compose Sorter failed: ${msg}`);
      }
    })
  );
}

export function deactivate(): void {}

// ============================================================================
// Formatter Provider
// ============================================================================

export class DockerComposeFormattingProvider implements vscode.DocumentFormattingEditProvider {
  constructor(private readonly outputChannel?: vscode.OutputChannel) {}

  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    if (token.isCancellationRequested) {
      return [];
    }

    const text = document.getText();
    const config = this.getConfiguration(document);
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
      const msg = error instanceof Error ? error.message : String(error);
      this.outputChannel?.appendLine(
        `[${new Date().toISOString()}] Formatting failed for ${document.fileName}: ${msg}`
      );
      // Silently log to OutputChannel rather than displaying disruptive error popups on save
      return [];
    }
  }

  public getConfiguration(scope?: vscode.ConfigurationScope): SorterConfig {
    const config = vscode.workspace.getConfiguration("yaml-compose-sorter", scope);
    return {
      topLevelKeyOrder: config.get<string[]>("topLevelKeyOrder") ?? DEFAULT_CONFIG.topLevelKeyOrder,
      serviceKeyOrder: config.get<string[]>("serviceKeyOrder") ?? DEFAULT_CONFIG.serviceKeyOrder,
      serviceKeyGroups:
        config.get<string[][]>("serviceKeyGroups") ?? DEFAULT_CONFIG.serviceKeyGroups,
      useServiceKeyGroups:
        config.get<boolean>("useServiceKeyGroups") ?? DEFAULT_CONFIG.useServiceKeyGroups,
      preserveBlankLinesWithinServiceKeyGroups:
        config.get<boolean>("preserveBlankLinesWithinServiceKeyGroups") ??
        DEFAULT_CONFIG.preserveBlankLinesWithinServiceKeyGroups,
      addDocumentSeparator:
        config.get<boolean>("addDocumentSeparator") ?? DEFAULT_CONFIG.addDocumentSeparator,
      addBlankLinesTopLevel:
        config.get<boolean>("addBlankLinesBetweenTopLevelKeys") ??
        DEFAULT_CONFIG.addBlankLinesTopLevel,
      removeVersionKey: config.get<boolean>("removeVersionKey") ?? DEFAULT_CONFIG.removeVersionKey,
      transformKeyValueLists:
        config.get<boolean>("transformKeyValueLists") ?? DEFAULT_CONFIG.transformKeyValueLists,
      addBlankLinesServices:
        config.get<boolean>("addBlankLinesBetweenServices") ?? DEFAULT_CONFIG.addBlankLinesServices
    };
  }
}
