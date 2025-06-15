// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as path from 'path';

interface DockerComposeConfig {
	[key: string]: any;
}

interface ExtensionConfig {
	sortOnSave: boolean;
	topLevelKeyOrder: string[];
	serviceKeyOrder: string[];
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	console.log('YAML Compose Sorter extension is now active!');

	// Register the sort command
	const sortCommand = vscode.commands.registerCommand('yaml-compose-sorter.sortDockerCompose', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor found');
			return;
		}

		await sortDockerComposeFile(editor);
	});

	// Register the document save event listener
	const onSaveListener = vscode.workspace.onWillSaveTextDocument(async (event) => {
		const config = getExtensionConfig();
		if (!config.sortOnSave) {
			return;
		}

		const document = event.document;
		if (isDockerComposeFile(document)) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document === document) {
				// We need to apply edits during the save event
				event.waitUntil(sortDockerComposeDocument(document));
			}
		}
	});

	context.subscriptions.push(sortCommand, onSaveListener);
}

function getExtensionConfig(): ExtensionConfig {
	const config = vscode.workspace.getConfiguration('yaml-compose-sorter');
	return {
		sortOnSave: config.get('sortOnSave', true),
		topLevelKeyOrder: config.get('topLevelKeyOrder', ['version', 'name', 'services', 'volumes', 'networks', 'configs', 'secrets']),
		serviceKeyOrder: config.get('serviceKeyOrder', ['container_name', 'image', 'build', 'restart', 'depends_on', 'ports', 'expose', 'volumes', 'environment', 'env_file', 'networks', 'labels', 'healthcheck'])
	};
}

function isDockerComposeFile(document: vscode.TextDocument): boolean {
	const fileName = path.basename(document.fileName).toLowerCase();
	return fileName === 'docker-compose.yml' || 
		   fileName === 'docker-compose.yaml' ||
		   fileName.startsWith('docker-compose.') && (fileName.endsWith('.yml') || fileName.endsWith('.yaml'));
}

async function sortDockerComposeFile(editor: vscode.TextEditor): Promise<void> {
	try {
		const document = editor.document;
		const text = document.getText();
		
		if (!isDockerComposeFile(document)) {
			vscode.window.showWarningMessage('This is not a Docker Compose file');
			return;
		}

		const sortedText = sortYamlContent(text);
		
		if (sortedText !== text) {
			const fullRange = new vscode.Range(
				document.positionAt(0),
				document.positionAt(text.length)
			);
			
			await editor.edit(editBuilder => {
				editBuilder.replace(fullRange, sortedText);
			});
			
			vscode.window.showInformationMessage('Docker Compose file sorted successfully!');
		} else {
			vscode.window.showInformationMessage('Docker Compose file is already sorted');
		}
	} catch (error) {
		vscode.window.showErrorMessage(`Error sorting Docker Compose file: ${error}`);
	}
}

async function sortDockerComposeDocument(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
	try {
		const text = document.getText();
		const sortedText = sortYamlContent(text);
		
		if (sortedText !== text) {
			const fullRange = new vscode.Range(
				document.positionAt(0),
				document.positionAt(text.length)
			);
			
			return [vscode.TextEdit.replace(fullRange, sortedText)];
		}
	} catch (error) {
		console.error('Error sorting Docker Compose file on save:', error);
	}
	
	return [];
}

function sortYamlContent(yamlText: string): string {
	try {
		const config = getExtensionConfig();
		
		// Parse YAML while preserving comments
		const doc = yaml.load(yamlText) as DockerComposeConfig;
		
		if (!doc || typeof doc !== 'object') {
			return yamlText;
		}

		// Sort top-level keys
		const sortedDoc = sortObjectKeys(doc, config.topLevelKeyOrder);
		
		// Sort service-level keys if services exist
		if (sortedDoc.services && typeof sortedDoc.services === 'object') {
			for (const serviceName in sortedDoc.services) {
				if (typeof sortedDoc.services[serviceName] === 'object') {
					sortedDoc.services[serviceName] = sortObjectKeys(
						sortedDoc.services[serviceName],
						config.serviceKeyOrder
					);
				}
			}
		}

		// Convert back to YAML with proper formatting
		return yaml.dump(sortedDoc, {
			indent: 2,
			lineWidth: -1,
			noRefs: true,
			sortKeys: false // We handle sorting manually
		});
		
	} catch (error) {
		console.error('Error parsing YAML:', error);
		throw new Error(`Invalid YAML format: ${error}`);
	}
}

function sortObjectKeys(obj: any, keyOrder: string[]): any {
	if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
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
	const remainingKeys = objKeys
		.filter(key => !keyOrder.includes(key))
		.sort();
	
	for (const key of remainingKeys) {
		sortedObj[key] = obj[key];
	}
	
	return sortedObj;
}

// This method is called when your extension is deactivated
export function deactivate() {}
