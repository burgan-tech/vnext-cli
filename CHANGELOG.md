# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2024-XX-XX

### 🚀 Major Features

#### Git-Based Template Management
- **Template Repository Integration**: Templates now hosted in separate Git repository
- **Semantic Versioning**: Full support for semantic versioning with Git tags
- **Built-in Credential Management**: Secure token handling for private repositories
- **Version Control**: Automatic latest version detection and specific version selection
- **Template Cache System**: Efficient local caching with version-specific storage

#### New Commands
- `amorphie template-info [--version]` - Show template information and available versions
- `amorphie template-versions` - List all available template versions
- `amorphie template-update` - Update template cache (clear all cached versions)
- `amorphie template-clear` - Clear template cache completely
- `amorphie create --list-versions` - List available template versions before creation

#### Enhanced Create Command
- `--version <version>` - Specify template version (latest, v1.0.0, etc.)
- `--list-versions` - List available versions and exit
- `--refresh-template` - Force refresh template cache
- Removed user credential requirements (now built-in)

### 🔧 Technical Improvements
- **Template Manager Module**: New `lib/template-manager.js` for Git operations
- **Version Resolution**: Smart version resolution from Git tags
- **Automatic Latest Detection**: Finds latest semantic version automatically
- **Placeholder System**: Enhanced {domainName} and {packageName} replacement
- **Cache Management**: Version-specific caching in `.amorphie-template-cache/`

### 📚 Documentation
- Complete Git-based template usage guide (`docs/git-template-usage.md`)
- Step-by-step migration guide (`docs/template-migration.md`)
- Updated README with new features and examples

### 🔄 Breaking Changes
- Template location changed from local `template/` to Git repository
- Environment variables: `AMORPHIE_TEMPLATE_REPO` and `AMORPHIE_TEMPLATE_TOKEN`
- Cache directory: `.amorphie-template-cache/` instead of `.amorphie-cache/`

### 🛡️ Security
- Built-in secure token management
- No user credential exposure
- Private repository support with environment variable override

### ⚡ Performance
- Efficient template caching by version
- Smart version resolution to avoid unnecessary downloads
- Parallel version checking and download operations

---

## [1.0.2] - Previous Release

### Added
- Initial CLI functionality
- Domain project creation
- Component validation
- Reference resolution
- Build and publish commands

### Features
- Local template system
- NPM package management
- Cross-domain component sharing
- Schema validation
- Boundary visualization

---

## Migration Guide

### From 1.x to 2.0

1. **Update CLI**:
   ```bash
   npm update -g @amorphie/cli
   ```

2. **Set Environment Variables** (optional):
   ```bash
   export AMORPHIE_TEMPLATE_REPO="https://github.com/your-org/template.git"
   export AMORPHIE_TEMPLATE_TOKEN="your-token"
   ```

3. **Test New Features**:
   ```bash
   amorphie template-info
   amorphie create test-project --version latest
   ```

4. **Migrate Existing Templates**:
   - Move `template/` folder to separate Git repository
   - Tag repository with semantic versions (v1.0.0, v1.1.0, etc.)
   - Update team configurations

### Compatibility
- ✅ Existing projects continue to work without changes
- ✅ All validation and build commands remain the same
- ✅ Reference resolution system unchanged
- ⚠️  New projects will use Git-based templates
- ⚠️  Template customizations need to be moved to Git repository 