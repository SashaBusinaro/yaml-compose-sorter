# Change Log

All notable changes to the "yaml-compose-sorter" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Initial release of YAML Compose Sorter
- Automatic sorting of Docker Compose YAML files on save
- Manual sorting command accessible via Command Palette
- Configurable key ordering for top-level and service-level keys
- Smart detection of Docker Compose files
- Support for common Docker Compose file naming patterns:
  - `docker-compose.yaml`
  - `docker-compose.yml`
  - `docker-compose.*.yaml`
  - `docker-compose.*.yml`

### Features
- **Top-level key sorting**: Orders keys like `version`, `services`, `volumes`, `networks` etc.
- **Service-level key sorting**: Orders service keys like `container_name`, `image`, `ports`, `volumes` etc.
- **Configurable ordering**: Users can customize key order via VS Code settings
- **Preservation of data**: All data is preserved, only key order is changed
- **Error handling**: Graceful handling of invalid YAML files

### Configuration Options
- `yaml-compose-sorter.sortOnSave`: Enable/disable automatic sorting on save (default: true)
- `yaml-compose-sorter.topLevelKeyOrder`: Customize top-level key order
- `yaml-compose-sorter.serviceKeyOrder`: Customize service-level key order

### Known Limitations
- Comments in YAML files are not preserved (limitation of js-yaml library)
- Complex YAML features like anchors and aliases are not preserved
