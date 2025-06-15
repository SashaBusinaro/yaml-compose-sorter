# YAML Compose Sorter

A Visual Studio Code extension that automatically sorts and formats Docker Compose YAML files in a consistent way across projects.

## Features

- **Automatic sorting on save**: Sorts Docker Compose files automatically when you save them
- **Manual sorting command**: Sort files on demand using the command palette
- **Configurable key order**: Customize the order of top-level and service-level keys
- **Smart file detection**: Processes Docker Compose files with various naming patterns
- **Document separator**: Optionally adds `---` at the beginning of YAML files
- **Improved readability**: Adds blank lines between top-level keys for better visual separation
- **Version key removal**: Optionally removes the deprecated `version` key from Docker Compose files

## Supported File Patterns

The extension automatically detects and processes the following Docker Compose file patterns:
- `docker-compose.yaml`
- `docker-compose.yml`
- `compose.yaml`
- `compose.yml` 
- `docker-compose.*.yaml`
- `docker-compose.*.yml`
- `compose.*.yaml`
- `compose.*.yml`

## Key Ordering

### Top-level keys (default order):
1. `version`
2. `name` 
3. `services`
4. `volumes`
5. `networks`
6. `configs`
7. `secrets`

### Service-level keys (default order):
1. `container_name`
2. `image`
3. `build`
4. `restart`
5. `depends_on`
6. `ports`
7. `expose`
8. `volumes`
9. `environment`
10. `env_file`
11. `networks`
12. `labels`
13. `healthcheck`

Any keys not in the configured order will be placed at the end in alphabetical order.

## Usage

### Automatic Sorting
The extension automatically sorts Docker Compose files when you save them (if `sortOnSave` is enabled in settings).

### Manual Sorting
1. Open a Docker Compose file (`docker-compose.yaml`, `docker-compose.yml`, `compose.yaml`, `compose.yml`, etc.)
2. Open the Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
3. Type "Sort Docker Compose YAML" and press Enter

## Configuration

You can customize the extension behavior in VS Code settings:

- `yaml-compose-sorter.sortOnSave`: Enable/disable automatic sorting on save (default: `true`)
- `yaml-compose-sorter.topLevelKeyOrder`: Array of top-level key names in desired order
- `yaml-compose-sorter.serviceKeyOrder`: Array of service-level key names in desired order
- `yaml-compose-sorter.addDocumentSeparator`: Add `---` document separator at the beginning (default: `false`)
- `yaml-compose-sorter.addBlankLinesBetweenTopLevelKeys`: Add blank lines between top-level keys for readability (default: `true`)
- `yaml-compose-sorter.removeVersionKey`: Automatically remove the `version` key from files (default: `false`)

## Requirements

- Visual Studio Code 1.101.0 or higher
- Docker Compose YAML files must be valid YAML format

## Known Issues

- Comments in YAML files may be lost during sorting (this is a limitation of the YAML parser)
- Complex YAML features like anchors and aliases are not preserved

## Release Notes

### 0.1.0

Enhanced release with new formatting features:
- **Extended file support**: Support for `compose.yml` and `compose.yaml` files
- **Document separator**: Optionally add `---` at the beginning of YAML files
- **Improved readability**: Add blank lines between top-level keys for better visual separation
- **Version key removal**: Optionally remove the `version` key from Docker Compose files
- **Enhanced file detection**: Support for additional Docker Compose file naming patterns
- Sort top-level keys in Docker Compose files
- Sort service-level keys within each service
- Configurable key ordering
- Automatic sorting on save
