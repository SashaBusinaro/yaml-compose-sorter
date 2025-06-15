# YAML Compose Sorter

A Visual Studio Code extension that automatically sorts and formats Docker Compose YAML files in a consistent way across projects.

## Features

- **Automatic sorting on save**: Sorts Docker Compose files automatically when you save them
- **Manual sorting command**: Sort files on demand using the command palette
- **Configurable key order**: Customize the order of top-level and service-level keys
- **Smart file detection**: Only processes files that are actually Docker Compose files

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
1. Open a Docker Compose file (`docker-compose.yaml`, `docker-compose.yml`, etc.)
2. Open the Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
3. Type "Sort Docker Compose YAML" and press Enter

## Configuration

You can customize the extension behavior in VS Code settings:

- `yaml-compose-sorter.sortOnSave`: Enable/disable automatic sorting on save (default: `true`)
- `yaml-compose-sorter.topLevelKeyOrder`: Array of top-level key names in desired order
- `yaml-compose-sorter.serviceKeyOrder`: Array of service-level key names in desired order

## Requirements

- Visual Studio Code 1.101.0 or higher
- Docker Compose YAML files must be valid YAML format

## Known Issues

- Comments in YAML files may be lost during sorting (this is a limitation of the YAML parser)
- Complex YAML features like anchors and aliases are not preserved

## Release Notes

### 0.0.1

Initial release with basic sorting functionality:
- Sort top-level keys in Docker Compose files
- Sort service-level keys within each service
- Configurable key ordering
- Automatic sorting on save
