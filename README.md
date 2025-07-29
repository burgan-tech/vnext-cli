# Amorphie CLI

CLI for creating and managing Amorphie domain projects with modular component sharing and Git-based template management.

## 🚀 Features

- **Git-based Template Management**: Templates hosted in separate Git repository
- **NPM-based Schema Management**: Schema definitions from NPM packages with runtime versioning
- **Version Control**: Semantic versioning support with automatic latest version detection
- **Built-in Credentials**: No need to provide Git tokens manually
- **Domain Project Creation**: Create new Amorphie domain projects with standardized structure
- **Advanced Component Validation**: Always-on schema validation + optional reference resolution
- **Runtime Version Support**: Schema validation tied to specific runtime versions
- **Build & Publish**: Build and publish domain packages for cross-domain usage
- **Reference Resolution**: Resolve cross-domain component references
- **Template & Schema Cache Management**: Efficient caching system for template and schema versions
- **GitHub Package Registry Support**: Authentication and private package support

## 📦 Installation

```bash
npm install -g @amorphie/cli
```

## 🔧 Quick Start

### Create New Project

```bash
# Create with latest template version
amorphie create my-project

# Create with specific template version
amorphie create my-project --version v2.1.0

# List available versions first
amorphie create my-project --list-versions
```

### Setup Runtime Version

```bash
# Enter project directory
cd my-project

# Configure runtime version in amorphie.config.json
# Set "runtimeVersion": "1.2.0" to match your target runtime

# Validate components (schema validation always enabled)
amorphie validate

# Schema package automatically downloaded and cached
# ✅ Schema package 1.2.0 downloaded successfully (6 schema files)
```

### Template & Schema Management

```bash
# Template Management
amorphie template-info          # Show template information
amorphie template-versions      # List available template versions
amorphie template-update        # Update template cache
amorphie template-clear         # Clear template cache

# Schema Management  
amorphie schema-info            # Show schema package information
amorphie schema-versions        # List available schema versions
amorphie schema-update          # Update schema cache
amorphie schema-clear           # Clear schema cache
```

## 📋 Commands

### Project Management

#### `create [project-name]`
Create a new Amorphie domain project

**Options:**
- `-v, --version <version>` - Template version (latest, v1.0.0, etc.) [default: latest]
- `--list-versions` - List available template versions and exit
- `--refresh-template` - Force refresh template cache

**Examples:**
```bash
amorphie create my-banking-project
amorphie create my-project --version v1.5.0
amorphie create --list-versions
```

#### `validate [file]`
Validate domain components with schema validation (always enabled) and optional reference resolution

**Behavior:**
- **Schema Validation**: Always performed using runtime-specific schemas from NPM
- **Reference Resolution**: Optional with `--resolve-refs` flag

**Options:**
- `--resolve-refs` - Resolve and validate all ref references
- `--strict` - Enable strict validation mode

**Examples:**
```bash
# Schema validation only (new default behavior)
amorphie validate

# Schema + reference validation
amorphie validate --resolve-refs

# Single file validation
amorphie validate Workflows/my-workflow.1.0.0.json
```

#### `build`
Build domain package with validation and reference resolution

**Options:**
- `-o, --output <dir>` - Output directory [default: dist]
- `-t, --type <type>` - Build type: reference|runtime [default: reference]
- `--skip-validation` - Skip schema validation

#### `publish`
Publish domain package to NPM registry

**Options:**
- `-t, --type <type>` - Publish type: reference|runtime [default: reference]
- `--dry-run` - Show what would be published
- `--registry <url>` - NPM registry URL

### Template Management

#### `template-info`
Show template information and status

**Options:**
- `-v, --version <version>` - Template version to check [default: latest]

#### `template-versions`
List all available template versions

#### `template-update`
Update template cache (clear all cached versions)

#### `template-clear`
Clear template cache completely

### Schema Management

#### `schema-info`
Show schema package information and status

**Options:**
- `-v, --version <version>` - Schema version to check [default: latest]

#### `schema-versions`
List all available schema package versions

#### `schema-update`
Update schema cache (clear all cached versions)

#### `schema-clear`
Clear schema cache completely

### Analysis & Visualization

#### `list-exports [package-name]`
List exported components from a domain package

#### `visualize-boundaries [file]`
Generate domain boundary visualization

**Options:**
- `-f, --format <format>` - Output format: json|mermaid|dot [default: json]
- `-o, --output <file>` - Output file path

## 🔬 Schema & Runtime Version Management

### Runtime Version Configuration

Projects use `runtimeVersion` in `amorphie.config.json` to determine which schema package version to use for validation:

```json
{
  "domain": "my-domain",
  "version": "1.0.0",
  "runtimeVersion": "1.2.0",
  "description": "My Amorphie Domain",
  "exports": {
    "workflows": ["workflow-sample.1.0.0.json"],
    "functions": ["function-sample.1.0.0.json"]
  }
}
```

### Schema Package Management

- **Package Source**: NPM registry (`@amorphie/schema-definitions` by default)
- **Version Binding**: Each `runtimeVersion` maps to specific schema definitions
- **Cache System**: Downloaded schemas cached locally per version
- **No Fallback**: NPM access required - no local schema fallback

### Schema Validation Workflow

```bash
# 1. Set runtime version in amorphie.config.json
echo '{"runtimeVersion": "1.2.0"}' > amorphie.config.json

# 2. Run validation - schemas automatically downloaded for runtime version
amorphie validate

# 3. Schemas cached for future use
# Cache location: ~/.cache/amorphie-cli/schemas/1.2.0/
```

### Schema Management Commands

```bash
# Check current schema package status
amorphie schema-info
# Output:
# Package: @amorphie/schema-definitions
# Current Version: 1.2.0
# Cached: Yes
# Schema Files: 6 files

# List available schema versions
amorphie schema-versions

# Update schema cache
amorphie schema-update

# Clear schema cache
amorphie schema-clear
```

## 🏗️ Template System

### Template Repository

Templates are hosted in a separate Git repository with semantic versioning:
- Repository: `https://github.com/amorphie/Amorphie.Template`
- Versioning: Git tags (v1.0.0, v1.1.0, etc.)
- Built-in authentication with secure token management

### Template Structure

```
amorphie-template/
├── {domainName}/           # Domain folder (replaced with actual domain name)
│   ├── Tasks/             # Task definitions
│   ├── Workflows/         # Workflow definitions  
│   ├── Functions/         # Function definitions
│   ├── Views/             # View definitions
│   ├── Schemas/           # Schema definitions
│   └── Extensions/        # Extension definitions
├── .vscode/               # VSCode configurations
│   ├── schemas/          # JSON schemas
│   ├── scripts/          # Validation scripts
│   └── settings.json     # Editor settings
├── amorphie.config.json   # Amorphie configuration
├── package.json          # Package configuration
├── .gitignore            # Git ignore rules
├── .cursorrules          # Cursor AI rules
└── README.md             # Project documentation
```

### Placeholder Replacement

The CLI automatically replaces these placeholders:
- `{packageName}` → Project name
- `{domainName}` → Domain name (lowercase, hyphen-separated)

### Version Management

```bash
# Always uses latest version
amorphie create my-project

# Use specific version
amorphie create my-project --version v2.0.0

# List available versions
amorphie template-versions
# Output:
#   v2.1.0 (latest)
#   v2.0.0
#   v1.5.0
#   v1.0.0
```

## 🔧 Configuration

### Environment Variables

```bash
# Template Configuration
export AMORPHIE_TEMPLATE_REPO="https://github.com/amorphie/Amorphie.Template.git"
export AMORPHIE_TEMPLATE_TOKEN="your-custom-token"

# Schema Package Configuration  
export AMORPHIE_SCHEMA_PACKAGE="@amorphie/schema-definitions"
export AMORPHIE_NPM_REGISTRY="https://npm.pkg.github.com"

# Cache Configuration
export AMORPHIE_CACHE_DIR="/custom/cache/path"
```

### NPM Registry Authentication

For GitHub Package Registry or private NPM registries:

```bash
# Method 1: NPM Config
npm config set @amorphie:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_TOKEN

# Method 2: .npmrc file
echo "@amorphie:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

### Cache Structure

Both templates and schemas are cached locally:

```
# Template Cache
.amorphie-template-cache/
├── template-v2.1.0/       # Latest template version
├── template-v2.0.0/       # Older template version
└── temp-for-tags/         # Temporary tag fetching

# Schema Cache (System Cache Directory)
~/.cache/amorphie-cli/schemas/
├── 1.2.0/
│   ├── package.json
│   └── schemas/
│       ├── workflow-definition.schema.json
│       ├── function-definition.schema.json
│       ├── task-definition.schema.json
│       ├── view-definition.schema.json
│       ├── schema-definition.schema.json
│       └── extension-definition.schema.json
├── 1.1.0/
├── npm-cache/             # NPM download cache
└── temp/                  # Temporary download files
```

## 📝 Example Usage

### Complete Workflow

```bash
# 1. Create new project with latest template
amorphie create banking-core

# 2. Enter project directory
cd banking-core

# 3. Configure runtime version in amorphie.config.json
# Edit: "runtimeVersion": "1.2.0"

# 4. Install dependencies
npm install

# 5. Validate components (schema validation always included)
amorphie validate
# Or with reference resolution:
amorphie validate --resolve-refs

# 6. Build reference package
amorphie build --type reference

# 7. Publish to registry
amorphie publish --type reference
```

### Template Management Workflow

```bash
# Check current template status
amorphie template-info
# Repository: https://github.com/amorphie/Amorphie.Template.git
# Current Version: v2.1.0
# Available Versions: v2.1.0 (latest), v2.0.0, v1.5.0...

# Update template cache
amorphie template-update

# Create project with specific version
amorphie create legacy-project --version v1.5.0
```

## 🔍 Validation & References

The CLI provides comprehensive validation with a two-layer approach:

### Schema Validation (Always Active)
- **Runtime-Specific Schemas**: Uses schemas from NPM package matching `runtimeVersion`
- **Automatic Download**: Schemas downloaded and cached automatically
- **Comprehensive Coverage**: All component types validated (workflows, functions, tasks, views, schemas, extensions)
- **Strict Validation**: Properties, types, required fields, and format validation
- **No Fallback**: NPM access required - ensures consistent validation across environments

### Reference Resolution (Optional with `--resolve-refs`)
- **Cross-Domain References**: External package references resolved and validated
- **Local References**: Internal domain references validated
- **Integrity Checking**: Referenced components must exist and be accessible
- **Version Consistency**: Reference versions validated against target components

### Additional Validations
- **Filename Consistency**: Component keys match filenames
- **Version Consistency**: Semantic versioning compliance
- **Domain Boundaries**: Domain-specific validation rules

### Reference Format

```json
{
  "ref": "@amorphie/core-domain/Tasks/task-validate-user.1.0.0.json"
}
```

## 📊 Build Types

### Reference Package
- Contains only exported components
- Optimized for cross-domain usage
- References resolved to payloads

### Runtime Package  
- Contains complete domain structure
- Optimized for engine deployment
- All supporting files included

## 🚀 Advanced Features

### Multiple Template Versions
```bash
# Development with cutting-edge features
amorphie create dev-project --version v3.0.0-beta

# Production with stable version
amorphie create prod-project --version v2.1.0

# Legacy support
amorphie create legacy-project --version v1.0.0
```

### Visualization
```bash
# Generate domain boundary diagram
amorphie visualize-boundaries --format mermaid --output domain-map.md

# Analyze component dependencies
amorphie visualize-boundaries MyComponent.json --format json
```

## 🐛 Troubleshooting

### Template Issues

```bash
# Clear cache and re-download
amorphie template-clear
amorphie create my-project --refresh-template

# Check available versions
amorphie template-versions

# Get detailed template info
amorphie template-info --version latest
```

### Schema Package Issues

```bash
# Check schema package status
amorphie schema-info

# Clear schema cache and re-download
amorphie schema-clear
amorphie validate

# List available schema versions
amorphie schema-versions

# NPM cache issues
npm cache clean --force
amorphie validate
```

### Authentication Issues (GitHub Package Registry)

```bash
# Set up authentication
npm config set @amorphie:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_TOKEN

# Verify authentication
npm whoami --registry https://npm.pkg.github.com

# Test package access
npm view @amorphie/schema-definitions --registry https://npm.pkg.github.com
```

### Common Error Messages

#### "NPM command failed: permission denied"
```bash
# Solution: Set up GitHub authentication
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_TOKEN
```

#### "NPM cache conflict"
```bash
# Solution: Clear NPM cache
npm cache clean --force
amorphie validate
```

#### "Schema package not found"
```bash
# Solution: Check package name and registry
amorphie schema-info
# Verify: AMORPHIE_SCHEMA_PACKAGE and AMORPHIE_NPM_REGISTRY
```

### Validation Errors

```bash
# Schema validation with detailed error reporting
amorphie validate

# Schema + reference validation
amorphie validate --resolve-refs --strict

# Single component validation
amorphie validate MyComponent.json

# Verbose validation output
amorphie validate --resolve-refs
```

### Performance Issues

```bash
# Check cache sizes
du -sh ~/.cache/amorphie-cli/
du -sh .amorphie-template-cache/

# Clean up old cache entries
amorphie schema-clear
amorphie template-clear
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.