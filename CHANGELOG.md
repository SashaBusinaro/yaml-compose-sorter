# Change Log

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-15

### ⚠️ Breaking Changes

- **Removed `sortOnSave` Setting**: The custom `yaml-compose-sorter.sortOnSave` setting has been removed.
  - **Action Required**: You must now enable the native VS Code "Format On Save" setting.
  - Add `"[dockercompose]": { "editor.formatOnSave": true }` to your `settings.json`.

### Added

- **AST-based Comment Preservation**: Fully redesigned the formatting engine to use an Abstract Syntax Tree (AST). All comments (header, inline, block) are now perfectly preserved and moved with their corresponding keys.
- **Native VS Code Formatting**: The extension now integrates directly with the VS Code formatting API.
  - Supports "Format Document" command.
  - Supports standard "Format On Save" (`editor.formatOnSave`).
- **Smarter File Detection**: Automatically activates for files with the `dockercompose` language ID, in addition to standard file patterns.

### Changed

- **Renamed Extension**: Display name updated to **Docker Compose Sorter**.
- **Formatted Output**: Improved spacing logic to add visual separation sections and services more reliably.

## [0.3.0] - 2025-08-15

### Added

- **Blank lines between services**: New optional feature to add blank lines between individual services in the services section
  - Does not add blank line before the first service

### Configuration Options

- `yaml-compose-sorter.addBlankLinesBetweenServices`: Add blank lines between services (default: true)

## [0.2.1] - 2025-07-28

### Fixed

- **Key=Value List Transformation**: Fixes a formatting issue in the command section
when the yaml-compose-sorter.transformKeyValueLists flag is set to true.

## [0.2.0] - 2025-06-21

### Added

- **Key=Value List Transformation**: New optional feature to transform arrays of key=value strings into standard YAML key-value maps
  - Applies to any part of the document (labels, environment variables, etc.)
  - Configurable via `yaml-compose-sorter.transformKeyValueLists` setting (disabled by default)
  - Recursively processes nested objects
  - Only transforms arrays where ALL items are valid key=value pairs
  - Preserves arrays that contain non-key=value items (ports, volumes, commands, etc.)

### Enhanced

- **Comprehensive test coverage**: Added extensive tests for the new transformation feature
- **Type safety**: Improved TypeScript type handling in test suite

### Configuration Options

- `yaml-compose-sorter.transformKeyValueLists`: Transform key=value arrays into objects (default: false)

### Examples

```yaml
# Before transformation
labels:
  - traefik.enable=true
  - traefik.http.routers.web.rule=Host(`example.org`)

# After transformation  
labels:
  traefik.enable: "true"
  traefik.http.routers.web.rule: "Host(`example.org`)"
```

## [0.1.4] - 2025-06-17

### Docs

- **Preview GIF**: Added a GIF showcasing the extension's functionality

## [0.1.3] - 2025-06-16

### Fixed

- **Runtime dependencies**: Ensure js-yaml dependency is properly included in VSIX package for extension functionality
- **Package structure**: Optimized dependency separation between runtime and development dependencies

## [0.1.2] - 2025-06-16

### Changed

- **Package preparation**: Final cleanup and optimization for VS Code Marketplace publication
- **Icon optimization**: Added proper extension icon for marketplace visibility
- **Metadata enhancement**: Improved package.json with gallery banner and keywords

## [0.1.1] - 2025-06-15

### Fixed

- **Test infrastructure**: Added comprehensive test suite with proper VS Code extension testing framework
- **Extension compliance**: Improved code structure and exported functions for better testability
- **Build configuration**: Enhanced debug and test configurations for development
- **Documentation**: Updated README with improved installation and configuration instructions
- **Packaging**: Ensured proper license compliance and VSIX package structure

### Technical Improvements

- Added `.vscode/launch.json` for extension debugging
- Implemented proper test runner with `.vscode-test.mjs`
- Enhanced test coverage with `extension.test.ts`
- Updated `.gitignore` to exclude platform-specific files
- Improved code exports for testing compatibility

## [0.1.0] - 2025-06-15

### Added

- **Extended file support**: Added support for `compose.yml` and `compose.yaml` files
- **Document separator**: Optionally adds `---` at the beginning of YAML files (configurable, disabled by default)
- **Blank lines between top-level keys**: Improves readability by adding blank lines between sections (configurable, enabled by default)
- **Version key removal**: Optional setting to automatically remove the deprecated `version` key from Docker Compose files (disabled by default)

### Enhanced

- **Improved file detection**: Now supports additional Docker Compose file naming patterns:
  - `compose.yaml` and `compose.yml`
  - `docker-compose.*.yaml` and `docker-compose.*.yml`
  - `compose.*.yaml` and `compose.*.yml`
- **Better YAML formatting**: Enhanced output formatting with proper spacing and structure

### Configuration Options

- `yaml-compose-sorter.addDocumentSeparator`: Add `---` document separator (default: false)
- `yaml-compose-sorter.addBlankLinesBetweenTopLevelKeys`: Add blank lines between top-level keys (default: true)
- `yaml-compose-sorter.removeVersionKey`: Remove the `version` key (default: false)

## [0.0.1] - 2025-06-15

### Added

- **Initial release of YAML Compose Sorter**
