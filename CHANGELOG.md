# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.0.0-beta.1] - 2024-12-19

### Added
- Initial release of Amorphie CLI tool
- Interactive project creation with domain-driven architecture support
- Template generator for Amorphie projects with comprehensive structure
- Domain-based project organization with structured component directories
- VSCode workspace integration with development scripts and validation tools
- JSON Schema validation for all component types (Workflows, Functions, Views, Extensions, Schemas, Tasks)
- Automated linting and validation workflows
- Code snippets and development automation for VSCode
- AI assistant rules for Cursor/VSCode integration
- Component validation and domain linting capabilities
- Auto-generation tools for proper component naming and structure
- File watching system for automatic validation and CSX rule updates
- Custom VSCode tasks and keyboard shortcuts
- Support for semantic versioning with `name.version.json` pattern
- Cross-domain reference validation
- Comprehensive documentation and usage examples

### Features
- **CLI Commands:**
  - `create-amorphie-app` - Interactive project creation
  - Support for project and domain name specification
  - NPX support for installation-free usage

- **Project Structure:**
  - Domain-driven architecture with component directories
  - VSCode workspace configuration
  - JSON schemas for component validation
  - Development automation scripts
  - Configuration files for domain and linting settings

- **Development Tools:**
  - Component validation with JSON schemas
  - Domain linting with custom rules
  - Auto-generation capabilities
  - File watching and automatic updates
  - VSCode integration with tasks and snippets

### Dependencies
- chalk ^4.1.2 - Terminal styling
- commander ^11.0.0 - CLI framework
- fs-extra ^11.1.1 - Enhanced file system operations
- inquirer ^9.2.7 - Interactive command line prompts

### Requirements
- Node.js >= 14.0.0

[Unreleased]: https://github.com/amorphie/Amorphie.Cli/compare/v1.0.0-beta.1...HEAD
[1.0.0-beta.1]: https://github.com/amorphie/Amorphie.Cli/releases/tag/v1.0.0-beta.1 