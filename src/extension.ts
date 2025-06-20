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
	addDocumentSeparator: boolean;
	addBlankLinesBetweenTopLevelKeys: boolean;
	removeVersionKey: boolean;
	transformKeyValueLists: boolean;
}

class YamlSortError extends Error {
	constructor(message: string, public readonly cause?: Error) {
		super(message);
		this.name = 'YamlSortError';
	}
}

const DEFAULT_CONFIG: ExtensionConfig = {
	sortOnSave: true,
	topLevelKeyOrder: ['version', 'name', 'services', 'volumes', 'networks', 'configs', 'secrets'],
	serviceKeyOrder: ['container_name', 'image', 'build', 'restart', 'depends_on', 'ports', 'expose', 'volumes', 'environment', 'env_file', 'networks', 'labels', 'healthcheck'],
	addDocumentSeparator: false,
	addBlankLinesBetweenTopLevelKeys: true,
	removeVersionKey: false,
	transformKeyValueLists: false
};

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
	
	// Validate configuration values
	const topLevelKeyOrder = config.get('topLevelKeyOrder', ['version', 'name', 'services', 'volumes', 'networks', 'configs', 'secrets']);
	const serviceKeyOrder = config.get('serviceKeyOrder', ['container_name', 'image', 'build', 'restart', 'depends_on', 'ports', 'expose', 'volumes', 'environment', 'env_file', 'networks', 'labels', 'healthcheck']);
	
	// Ensure arrays are valid
	if (!Array.isArray(topLevelKeyOrder) || !Array.isArray(serviceKeyOrder)) {
		console.warn('Invalid configuration detected, using defaults');
		return DEFAULT_CONFIG;
	}
	
	return {
		sortOnSave: config.get('sortOnSave', true),
		topLevelKeyOrder,
		serviceKeyOrder,
		addDocumentSeparator: config.get('addDocumentSeparator', false),
		addBlankLinesBetweenTopLevelKeys: config.get('addBlankLinesBetweenTopLevelKeys', true),
		removeVersionKey: config.get('removeVersionKey', false),
		transformKeyValueLists: config.get('transformKeyValueLists', false)
	};
}

function isDockerComposeFile(document: vscode.TextDocument): boolean {
	const fileName = path.basename(document.fileName).toLowerCase();
	return fileName === 'docker-compose.yml' || 
		   fileName === 'docker-compose.yaml' ||
		   fileName === 'compose.yml' ||
		   fileName === 'compose.yaml' ||
		   fileName.startsWith('docker-compose.') && (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) ||
		   fileName.startsWith('compose.') && (fileName.endsWith('.yml') || fileName.endsWith('.yaml'));
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
		const doc = yaml.load(yamlText) as DockerComposeConfig;
		
		if (!doc || typeof doc !== 'object') {
			return yamlText;
		}

		// Apply all transformations
		const processedDoc = processDockerComposeDocument(doc, config);
		
		// Convert to YAML and apply formatting
		return formatYamlOutput(processedDoc, config);
		
	} catch (error) {
		if (error instanceof YamlSortError) {
			throw error;
		}
		console.error('Error parsing YAML:', error);
		throw new YamlSortError(`Invalid YAML format: ${error instanceof Error ? error.message : 'Unknown error'}`, error as Error);
	}
}

function processDockerComposeDocument(doc: DockerComposeConfig, config: ExtensionConfig): DockerComposeConfig {
	if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
		throw new YamlSortError('Invalid Docker Compose document structure');
	}

	// Remove version key if configured
	let workingDoc = { ...doc };
	if (config.removeVersionKey && 'version' in workingDoc) {
		delete workingDoc.version;
	}

	// Sort top-level keys
	const sortedDoc = sortObjectKeys(workingDoc, config.topLevelKeyOrder);
	
	// Sort service-level keys if services exist
	if (sortedDoc.services && typeof sortedDoc.services === 'object' && !Array.isArray(sortedDoc.services)) {
		for (const serviceName in sortedDoc.services) {
			if (sortedDoc.services.hasOwnProperty(serviceName) && 
				typeof sortedDoc.services[serviceName] === 'object' && 
				sortedDoc.services[serviceName] !== null && 
				!Array.isArray(sortedDoc.services[serviceName])) {
				sortedDoc.services[serviceName] = sortObjectKeys(
					sortedDoc.services[serviceName],
					config.serviceKeyOrder
				);
			}
		}
	}

	// Transform key=value lists if configured
	if (config.transformKeyValueLists) {
		transformKeyValueLists(sortedDoc);
	}

	return sortedDoc;
}

function formatYamlOutput(doc: DockerComposeConfig, config: ExtensionConfig): string {
	// Convert back to YAML with proper formatting
	let yamlOutput = yaml.dump(doc, {
		indent: 2,
		lineWidth: -1,
		noRefs: true,
		sortKeys: false // We handle sorting manually
	});

	// Add blank lines between top-level keys if configured
	if (config.addBlankLinesBetweenTopLevelKeys) {
		yamlOutput = addBlankLinesBetweenTopLevelKeys(yamlOutput);
	}

	// Add document separator if configured and not already present
	if (config.addDocumentSeparator && !yamlOutput.startsWith('---')) {
		yamlOutput = '---\n' + yamlOutput;
	}

	return yamlOutput;
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

function addBlankLinesBetweenTopLevelKeys(yamlContent: string): string {
	const lines = yamlContent.split('\n');
	const result: string[] = [];
	let hasSeenTopLevelKey = false;
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmedLine = line.trim();
		
		// Check if this is a top-level key (starts at column 0, ends with colon, not empty)
		const isTopLevelKey = line.length > 0 && 
							  line[0] !== ' ' && 
							  line[0] !== '\t' && 
							  trimmedLine.endsWith(':') && 
							  !trimmedLine.startsWith('#') &&
							  !trimmedLine.startsWith('---');
		
		// Add blank line before top-level keys (except the first one)
		if (isTopLevelKey && hasSeenTopLevelKey) {
			// Only add blank line if the previous line is not already blank
			if (result.length > 0 && result[result.length - 1].trim() !== '') {
				result.push('');
			}
		}
		
		result.push(line);
		
		if (isTopLevelKey) {
			hasSeenTopLevelKey = true;
		}
	}
	
	return result.join('\n');
}

function transformKeyValueLists(obj: any): void {
	if (!obj || typeof obj !== 'object') {
		return;
	}

	// Recursively process all properties
	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			const value = obj[key];
			
			// If value is an array of strings that contain '=', transform it
			if (Array.isArray(value) && value.length > 0) {
				const keyValueMap: { [key: string]: string } = {};
				let allAreKeyValuePairs = true;
				
				// Check if all array items are key=value strings
				for (const item of value) {
					if (typeof item === 'string' && item.includes('=')) {
						const equalIndex = item.indexOf('=');
						if (equalIndex > 0 && equalIndex < item.length - 1) {
							const itemKey = item.substring(0, equalIndex).trim();
							const itemValue = item.substring(equalIndex + 1);
							
							// Validate key name (basic validation for Docker Compose labels/env vars)
							if (itemKey && !itemKey.includes(' ') && !itemKey.includes('\t')) {
								keyValueMap[itemKey] = itemValue;
							} else {
								allAreKeyValuePairs = false;
								break;
							}
						} else {
							allAreKeyValuePairs = false;
							break;
						}
					} else {
						allAreKeyValuePairs = false;
						break;
					}
				}
				
				// Transform the array to an object if all items are key=value pairs
				if (allAreKeyValuePairs && Object.keys(keyValueMap).length > 0) {
					obj[key] = keyValueMap;
				}
			} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				// Recursively process nested objects
				transformKeyValueLists(value);
			}
		}
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}

// Export functions for testing
export { 
	isDockerComposeFile, 
	sortObjectKeys, 
	sortYamlContent, 
	addBlankLinesBetweenTopLevelKeys, 
	transformKeyValueLists,
	processDockerComposeDocument,
	formatYamlOutput 
};
