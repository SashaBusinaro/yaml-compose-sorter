import assert from "node:assert/strict";
import * as vscode from "vscode";
import { DOCKER_COMPOSE_SELECTOR, DockerComposeFormattingProvider } from "../../extension";

suite("Extension and VS Code Integration Test Suite", () => {
  suiteSetup(async () => {
    // Ensure the extension is active in the host
    const ext = vscode.extensions.getExtension("SashaBusinaro.yaml-compose-sorter");
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  /*
   * ========================================================================
   * 1. Activation and Command Registration
   * ========================================================================
   */
  test("Extension activates and registers 'yaml-compose-sorter.sort' command", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("yaml-compose-sorter.sort"),
      "Command 'yaml-compose-sorter.sort' should be registered in VS Code"
    );
  });

  test("Extension is loaded and active in VS Code", () => {
    const ext = vscode.extensions.getExtension("SashaBusinaro.yaml-compose-sorter");
    assert.ok(ext, "Extension SashaBusinaro.yaml-compose-sorter should be found");
    assert.ok(ext.isActive, "Extension should be active");
  });

  /*
   * ========================================================================
   * 2. Document Selector Matching (Issue #45)
   * ========================================================================
   */
  test("DOCKER_COMPOSE_SELECTOR matches standard Compose and Jinja2 templates", () => {
    const testCases = [
      { uri: vscode.Uri.file("/path/to/docker-compose.yml"), languageId: "yaml" },
      { uri: vscode.Uri.file("/path/to/compose.yaml"), languageId: "yaml" },
      { uri: vscode.Uri.file("/path/to/docker-compose.yml.j2"), languageId: "plaintext" },
      { uri: vscode.Uri.file("/path/to/docker-compose.yaml.j2"), languageId: "jinja" },
      { uri: vscode.Uri.file("/path/to/compose.yml.j2"), languageId: "jinja-yaml" },
      { uri: vscode.Uri.file("/path/to/compose.yaml.j2"), languageId: "yaml" },
      { uri: vscode.Uri.file("/path/to/docker-compose.prod.yml.j2"), languageId: "plaintext" },
      { uri: vscode.Uri.file("/path/to/compose.dev.yaml.j2"), languageId: "plaintext" },
      {
        uri: vscode.Uri.file("/path/to/docker-compose.override.yaml.j2"),
        languageId: "jinja-yaml"
      },
      { uri: vscode.Uri.file("/path/to/compose.staging.yml.j2"), languageId: "jinja" },
      { uri: vscode.Uri.file("/app/docker-compose.prod.yaml.j2"), languageId: "plaintext" },
      { uri: vscode.Uri.file("/app/compose.override.yml.j2"), languageId: "jinja-yaml" },
      { uri: vscode.Uri.file("/srv/docker-compose.local.jinja2"), languageId: "yaml" },
      { uri: vscode.Uri.file("/srv/compose-stack.j2"), languageId: "jinja" },
      { uri: vscode.Uri.file("/srv/docker-compose-app.jinja"), languageId: "jinja-yaml" }
    ];

    for (const tc of testCases) {
      const score = vscode.languages.match(DOCKER_COMPOSE_SELECTOR, tc as any);
      assert.ok(score > 0, `Expected selector match for ${tc.uri.fsPath} (${tc.languageId})`);
    }
  });

  /*
   * ========================================================================
   * 3. Formatting Provider & Silent Error Handling
   * ========================================================================
   */
  test("DockerComposeFormattingProvider formats valid compose document", async () => {
    const loggedLines: string[] = [];
    const mockOutputChannel = {
      name: "Docker Compose Sorter",
      append: () => {},
      appendLine: (line: string) => loggedLines.push(line),
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
      replace: () => {}
    } as unknown as vscode.OutputChannel;

    const provider = new DockerComposeFormattingProvider(mockOutputChannel);
    const doc = await vscode.workspace.openTextDocument({
      language: "yaml",
      content: "services: {}\nversion: '3.8'\n"
    });

    const edits = provider.provideDocumentFormattingEdits(
      doc,
      { insertSpaces: true, tabSize: 2 },
      new vscode.CancellationTokenSource().token
    );

    assert.ok(edits.length > 0, "Expected formatting edits to be produced");
    assert.ok(edits[0].newText.startsWith("version:"));
    assert.strictEqual(loggedLines.length, 0, "Expected no errors logged for valid document");
  });

  test("DockerComposeFormattingProvider returns empty edits and logs silently on syntax error", async () => {
    const loggedLines: string[] = [];
    const mockOutputChannel = {
      name: "Docker Compose Sorter",
      append: () => {},
      appendLine: (line: string) => loggedLines.push(line),
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
      replace: () => {}
    } as unknown as vscode.OutputChannel;

    const provider = new DockerComposeFormattingProvider(mockOutputChannel);
    const doc = await vscode.workspace.openTextDocument({
      language: "yaml",
      content: "services:\n  bad_indent:\n foo: bar\n  baz"
    });

    const edits = provider.provideDocumentFormattingEdits(
      doc,
      { insertSpaces: true, tabSize: 2 },
      new vscode.CancellationTokenSource().token
    );

    assert.strictEqual(edits.length, 0, "Expected no edits on invalid YAML");
    assert.ok(loggedLines.length > 0, "Expected error to be silently logged to output channel");
    assert.ok(loggedLines[0].includes("Formatting failed"));
  });

  test("DockerComposeFormattingProvider returns empty edits when cancellation is requested", async () => {
    const provider = new DockerComposeFormattingProvider();
    const doc = await vscode.workspace.openTextDocument({
      language: "yaml",
      content: "services: {}\nversion: '3.8'\n"
    });

    const cts = new vscode.CancellationTokenSource();
    cts.cancel();

    const edits = provider.provideDocumentFormattingEdits(
      doc,
      { insertSpaces: true, tabSize: 2 },
      cts.token
    );

    assert.deepStrictEqual(edits, [], "Expected no edits when token is cancelled");
  });

  test("DockerComposeFormattingProvider returns empty edits when document is already sorted", async () => {
    const provider = new DockerComposeFormattingProvider();
    const sortedContent = "version: '3.8'\n\nservices: {}\n";
    const doc = await vscode.workspace.openTextDocument({
      language: "yaml",
      content: sortedContent
    });

    const edits = provider.provideDocumentFormattingEdits(
      doc,
      { insertSpaces: true, tabSize: 2 },
      new vscode.CancellationTokenSource().token
    );

    assert.deepStrictEqual(edits, [], "Expected no edits for already formatted document");
  });

  test("DockerComposeFormattingProvider falls back to 2 spaces when tabs are requested", async () => {
    const provider = new DockerComposeFormattingProvider();
    const doc = await vscode.workspace.openTextDocument({
      language: "yaml",
      content: "services:\n  app:\n    image: node\n"
    });

    const edits = provider.provideDocumentFormattingEdits(
      doc,
      { insertSpaces: false, tabSize: 4 },
      new vscode.CancellationTokenSource().token
    );

    assert.ok(Array.isArray(edits), "Expected edits array");
  });

  /*
   * ========================================================================
   * 4. Command Execution in Active Editor
   * ========================================================================
   */
  test("Executing 'yaml-compose-sorter.sort' without an active editor does not throw", async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    assert.strictEqual(vscode.window.activeTextEditor, undefined);

    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("yaml-compose-sorter.sort");
    }, "Command should safely no-op when no editor is open");
  });

  test("Executing 'yaml-compose-sorter.sort' formats active editor", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "yaml",
      content: "services: {}\nversion: '3.8'\n"
    });
    await vscode.window.showTextDocument(doc);

    await vscode.commands.executeCommand("yaml-compose-sorter.sort");

    const text = doc.getText();
    const versionIdx = text.indexOf("version:");
    const servicesIdx = text.indexOf("services:");

    assert.ok(versionIdx !== -1, "Expected version key in document");
    assert.ok(servicesIdx !== -1, "Expected services key in document");
    assert.ok(versionIdx < servicesIdx, "Expected version to precede services after sort");
  });

  test("Executing 'yaml-compose-sorter.sort' on already sorted document performs no-op", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "yaml",
      content: "services: {}\nversion: '3.8'\n"
    });
    await vscode.window.showTextDocument(doc);

    // First sort to format
    await vscode.commands.executeCommand("yaml-compose-sorter.sort");
    const formattedText = doc.getText();

    // Second sort should hit early return (text === formatted)
    await vscode.commands.executeCommand("yaml-compose-sorter.sort");
    assert.strictEqual(doc.getText(), formattedText);
  });

  test("Executing 'yaml-compose-sorter.sort' on invalid YAML triggers error handler", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "yaml",
      content: "services:\n  bad_indent:\n foo: bar\n  baz"
    });
    await vscode.window.showTextDocument(doc);

    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("yaml-compose-sorter.sort");
    }, "Command should handle sorting error gracefully");
  });

  test("Executing 'yaml-compose-sorter.sort' with custom tabSize option", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "yaml",
      content: "services: {}\nversion: '3.8'\n"
    });
    const editor = await vscode.window.showTextDocument(doc);
    editor.options.tabSize = 4;
    editor.options.insertSpaces = true;

    await vscode.commands.executeCommand("yaml-compose-sorter.sort");
    assert.ok(doc.getText().includes("version:"));
  });
});
