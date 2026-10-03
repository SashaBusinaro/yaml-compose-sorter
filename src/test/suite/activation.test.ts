import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

// This suite runs in its own host: explicitly activating the extension here
// would hide regressions in package.json activationEvents.
suite("Template activation in a fresh VS Code host", () => {
  let directory: string;

  suiteSetup(async () => {
    directory = await mkdtemp(join(tmpdir(), "compose-sorter-activation-"));
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await rm(directory, { recursive: true, force: true });
  });

  test("Opening a plaintext Compose template activates its formatter", async () => {
    const extension = vscode.extensions.getExtension("SashaBusinaro.yaml-compose-sorter");
    assert.ok(extension);
    assert.strictEqual(extension.isActive, false, "The host must start without activation");

    const file = join(directory, "compose.yaml.j2");
    await writeFile(file, 'services: {}\nversion: "3.8"\n');
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    assert.strictEqual(document.languageId, "plaintext");
    await vscode.window.showTextDocument(document);

    // Activation and provider registration cross the host boundary asynchronously.
    const deadline = Date.now() + 2000;
    let edits: vscode.TextEdit[] | undefined;
    do {
      edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
        "vscode.executeFormatDocumentProvider",
        document.uri,
        { insertSpaces: true, tabSize: 2 }
      );
      if (edits?.length) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    assert.strictEqual(extension.isActive, true);
    assert.ok(edits?.length, "The formatter should be available without the manual sort command");
    const edit = new vscode.WorkspaceEdit();
    edit.set(document.uri, edits);
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);
    assert.strictEqual(document.getText(), 'version: "3.8"\n\nservices: {}\n');
    await document.save();
  });

  test("Does not offer Compose formatting for an unrelated plaintext file", async () => {
    const file = join(directory, "notes.txt");
    await writeFile(file, 'services: {}\nversion: "3.8"\n');
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      { insertSpaces: true, tabSize: 2 }
    );
    assert.ok(!edits || edits.length === 0);
  });
});
