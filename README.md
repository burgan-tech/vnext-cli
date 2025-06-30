# Amorphie CLI

Modern CLI tool for creating and managing modular, domain-driven Amorphie projects with NPM-based component sharing and reference resolution.

## 🚀 Quick Start

### Installation

```bash
npm install -g amorphie-cli
```

### Create a New Domain Project

```bash
# Interactive mode - prompts for project and domain names
amorphie create
# or use the short form
amp create

# With project name - will prompt for domain name  
amorphie create my-domain-project
amp create my-domain-project

# Using npx (no global installation needed)
npx amorphie-cli create my-domain-project
```

> 💡 **Tip:** You can use `amp` as a shorthand for `amorphie` in all commands for faster development.

## 🏗️ Modular Domain Architecture

The Amorphie CLI implements a **modular, schema-based, configuration-controlled domain sharing** system where:

✅ **Dual Package Strategy**: Each domain publishes two NPM packages:
   - **Reference Package**: `@amorphie/domain-identity-reference` (for cross-domain usage)
   - **Runtime Package**: `@amorphie/domain-identity-runtime` (for engine deployment)
✅ **Export control** through `amorphie.config.json` - domains expose only what they want to share  
✅ **Reference resolution** using `$ref` patterns for cross-domain component usage  
✅ **Schema validation** ensures interface compatibility between domains  
✅ **Build-time reference replacement** - converts `$ref` to deployment-ready payloads  
✅ **NPM-based distribution** with semantic versioning and caching  

## 📋 Project Structure

After running `amorphie create`, you'll get:

```
my-domain-project/
├── your-domain/                    # Domain components directory
│   ├── Workflows/                  # Business process workflows  
│   │   └── sys-flows.1.0.0.json   # Example with $ref usage
│   ├── Functions/                  # Serverless functions
│   ├── Views/                      # UI components and views
│   ├── Extensions/                 # Custom framework extensions
│   ├── Schemas/                    # Data models and schemas
│   └── Tasks/                      # Background tasks and jobs
│       └── task-invalidate-cache.1.0.0.json
├── amorphie.config.json            # Domain configuration with exports
├── package.json                    # NPM package configuration
└── README.md                       # Project documentation
```

## ⚙️ Core Features

### 🎯 Export-Controlled Domain Sharing

Control what your domain exposes through `amorphie.config.json`:

```json
{
  "domain": "identity",
  "version": "1.0.0",
  "exports": {
    "functions": [
      "calculate-credit-score.1.0.0.json",
      "generate-user-id.1.1.0.json"
    ],
    "workflows": [
      "user-registration.1.0.0.json"
    ],
    "tasks": [
      "task-invalidate-cache.1.0.0.json"
    ],
    "visibility": "public",
    "metadata": {
      "description": "Identity management components",
      "maintainer": "Identity Team"
    }
  },
  "dependencies": {
    "domains": ["@amorphie/domain-core-reference"],
    "npm": []
  }
}
```

### 🔗 Reference Resolution System

Use `$ref` to reference components across domains:

```json
{
  "key": "start-onboarding",
  "domain": "onboarding", 
  "tasks": [
    {
      "$ref": "@amorphie/domain-core-reference/Tasks/task-invalidate-cache.1.0.0.json"
    },
    {
      "$ref": "Tasks/local-task.1.0.0.json"
    }
  ]
}
```

**Local references:** `Tasks/task-name.1.0.0.json`  
**External references:** `@amorphie/domain-core-reference/Tasks/task-name.1.0.0.json`

> **Package Naming**: Reference packages use `-reference` suffix for cross-domain usage

## 🛠️ CLI Commands

### Domain Management

```bash
# Create new domain project
amorphie create [project-name]
amp create [project-name]                # Short form

# Validate domain components and resolve references
amorphie validate --resolve-refs --strict
amp validate --resolve-refs --strict     # Short form

# Build packages for different purposes
amorphie build                           # Default: reference build
amorphie build --type reference          # For cross-domain usage
amorphie build --type runtime            # For engine deployment
amp build --type runtime                 # Short form
amorphie build --skip-validation         # Skip validation if needed

# Publish packages to NPM
amorphie publish --dry-run               # Test reference publish
amorphie publish --type reference       # For cross-domain usage
amorphie publish --type runtime         # For engine deployment
amp publish --type runtime              # Short form
amorphie publish --registry https://npm.amorphie.com
```

### Component Discovery

```bash
# List exports from current project
amorphie list-exports
amp list-exports                         # Short form

# List exports from external domain package
amorphie list-exports @amorphie/domain-core-reference
amp list-exports @amorphie/domain-core-reference   # Short form

# Generate domain boundary visualization
amorphie visualize-boundaries -f mermaid -o boundaries.md
amp visualize-boundaries -f mermaid -o boundaries.md    # Short form
amorphie visualize-boundaries -f json -o dependencies.json
```

## 🔍 Reference Resolution & Validation

### Validate with Reference Resolution

```bash
# Validate all JSON files and resolve $ref references
amorphie validate --resolve-refs
amp validate --resolve-refs              # Short form

# Enable strict mode validation
amorphie validate --resolve-refs --strict
amp validate --resolve-refs --strict     # Short form
```

**What happens during validation:**
1. ✅ Scans all JSON files in your domain
2. ✅ Finds `$ref` properties pointing to external components  
3. ✅ Downloads referenced NPM packages to `.amorphie-cache`
4. ✅ Checks if referenced components are exported by target domain
5. ✅ Validates schema compatibility between versions
6. ✅ Reports broken references and version conflicts

### Example Validation Output

```bash
🔍 Validating domain components...
📄 Validating: Workflows/sys-flows.1.0.0.json
  ✅ Valid (3 refs resolved)
📄 Validating: Tasks/task-invalidate-cache.1.0.0.json  
  ✅ Valid (0 refs resolved)

📊 Validation Summary:
Files: 2/2 valid
References: 3/3 resolved
🎉 All validations passed!
```

## 📦 Building & Distribution 

### Build Domain Package

```bash
# Reference build (default) - for cross-domain usage
amorphie build                      # Default: reference build
amorphie build --type reference     # Explicit reference build
amp build --type reference         # Short form

# Runtime build - for engine deployment
amorphie build --type runtime       # Complete domain structure
amp build --type runtime           # Short form

# Custom options
amorphie build -o custom-dist       # Custom output directory
amorphie build --skip-validation    # Skip validation (not recommended)
```

#### Build Types

**📦 Reference Build** (`--type reference`, default):
- ✅ Only exported components (defined in `amorphie.config.json`)
- ✅ Reference resolution: `$ref` → payload objects
- ✅ Minimal package for cross-domain usage
- ✅ Package name: `{original-name}-reference`
- ✅ Other domains can npm install and reference

**🚀 Runtime Build** (`--type runtime`):
- ✅ Complete domain structure (all files and folders)
- ✅ No reference resolution (preserves original `$ref`)
- ✅ Package name: `{original-name}-runtime`
- ✅ Ready for CI/CD deployment to engine
- ✅ Includes internal components and supporting files

#### Build Process
1. **Validation**: All components validated with schema validation
2. **Type Processing**: Reference vs Runtime handling
3. **Output Generation**: Deployment-ready package created

**Reference Resolution Example** (Reference Build Only):
```json
// Before build (development):
{
  "task": {
    "$ref": "Tasks/task-invalidate-cache.1.0.0.json"
  }
}

// After reference build (deployment-ready):
{
  "task": {
    "key": "task-invalidate-cache",
    "version": "1.0.0",
    "domain": "core",
    "flow": "sys-tasks"
  }
}

// Runtime build preserves original $ref for engine processing
```

### Publish to NPM

```bash
# Publish reference package (default)
amorphie publish --dry-run               # Test reference publish
amorphie publish --type reference       # Explicit reference publish
amp publish --type reference           # Short form

# Publish runtime package
amorphie publish --type runtime         # Complete runtime publish
amp publish --type runtime             # Short form

# Registry options
amorphie publish --registry https://npm.amorphie.com
amp publish --registry https://npm.amorphie.com    # Short form
```

**Publishing automatically builds the package with the specified type before publishing.**

#### Package Naming Convention

- **Reference Package**: `{your-package-name}-reference`
- **Runtime Package**: `{your-package-name}-runtime`

**Example**: If your `package.json` has `"name": "@amorphie/domain-identity"`, the published packages will be:
- `@amorphie/domain-identity-reference` (for cross-domain usage)
- `@amorphie/domain-identity-runtime` (for engine deployment)

## 🗺️ Domain Boundary Visualization

Generate visual representations of your domain dependencies:

```bash
# JSON format (default)
amorphie visualize-boundaries
amp visualize-boundaries                 # Short form

# Mermaid diagram
amorphie visualize-boundaries -f mermaid -o boundaries.md
amp visualize-boundaries -f mermaid -o boundaries.md    # Short form

# DOT format for Graphviz
amorphie visualize-boundaries -f dot -o graph.dot
amp visualize-boundaries -f dot -o graph.dot           # Short form
```

### Example Mermaid Output

```mermaid
graph TD
  domain_core[@amorphie/domain-core]
  domain_notifications[@amorphie/domain-notifications]
  identity[identity]
  
  domain_core --> identity
  domain_notifications --> identity
```

## 🔧 Advanced Configuration

### Complete amorphie.config.json

```json
{
  "version": "1.0.0",
  "description": "Identity Domain Components",
  "domain": "identity",
  "paths": {
    "componentsRoot": "identity",
    "tasks": "Tasks",
    "workflows": "Workflows",
    "functions": "Functions"
  },
  "exports": {
    "functions": ["calculate-risk.1.0.0.json"],
    "workflows": ["user-flow.1.0.0.json"],
    "tasks": ["cleanup-task.1.0.0.json"],
    "visibility": "public",
    "metadata": {
      "description": "Identity management components",
      "maintainer": "Identity Team",
      "license": "MIT"
    }
  },
  "dependencies": {
    "domains": ["@amorphie/domain-core-reference"],
    "npm": ["lodash@4.17.21"]
  },
  "referenceResolution": {
    "enabled": true,
    "validateOnBuild": true,
    "strictMode": true,
    "validateReferenceConsistency": true,
    "validateSchemas": true,
    "allowedHosts": [
      "registry.npmjs.org",
      "npm.amorphie.com"
    ],
    "schemaValidationRules": {
      "enforceKeyFormat": true,
      "enforceVersionFormat": true,
      "enforceFilenameConsistency": true,
      "allowUnknownProperties": false
    }
  }
}
```

## 💡 Best Practices

### 1. Export Strategy
```bash
✅ Export stable, versioned components
✅ Use semantic versioning (1.0.0, 1.1.0, 2.0.0)
✅ Document breaking changes
❌ Don't export internal/private components
❌ Don't export components under active development
```

### 2. Reference Usage
```bash
✅ Pin to specific versions: task-name.1.0.0.json
✅ Use local refs for same-domain components
✅ Test reference resolution regularly
❌ Don't use latest or floating versions
❌ Don't create circular dependencies
```

### 3. Domain Boundaries
```bash
✅ Keep domains focused and cohesive
✅ Minimize cross-domain dependencies
✅ Use events/messages for loose coupling
❌ Don't create tightly coupled domains
❌ Don't share database schemas directly
```

## 🚀 Development Workflow

1. **Create Domain Project**
   ```bash
   amorphie create identity-service
   # or amp create identity-service
   cd identity-service
   npm install
   ```

2. **Develop Components**
   ```bash
   # Edit domain components in your-domain/ folder
   # Use $ref for cross-domain references
   ```

3. **Validate & Test**
   ```bash
   amorphie validate --resolve-refs
   # or amp validate --resolve-refs
   amorphie visualize-boundaries -f json
   # or amp visualize-boundaries -f json
   ```

4. **Prepare for Publishing**
   ```bash
   # For cross-domain reference
   amorphie build --type reference
   # or amp build --type reference
   amorphie publish --dry-run --type reference
   
   # For engine deployment
   amorphie build --type runtime
   # or amp build --type runtime
   amorphie publish --dry-run --type runtime
   ```

5. **Publish to NPM**
   ```bash
   # Reference package for other domains
   amorphie publish --type reference
   
   # Runtime package for deployment
   amorphie publish --type runtime
   ```

## 🎯 Use Cases

### Enterprise Domain Architecture
- **Identity Domain**: User management, authentication
- **Billing Domain**: Invoicing, payments, subscriptions  
- **Onboarding Domain**: User registration, KYC processes
- **Core Domain**: Shared utilities, common tasks

### Component Reuse Scenarios
- ✅ Billing domain installs `@amorphie/identity-reference` for user validation
- ✅ Onboarding domain uses `@amorphie/core-reference` for cache invalidation
- ✅ All domains use `@amorphie/core-reference` for audit logging tasks
- ✅ Notification domain publishes `@amorphie/notifications-reference` for messaging

### Package Distribution Strategy
- **Reference Packages** (`-reference` suffix): For cross-domain dependencies
- **Runtime Packages** (`-runtime` suffix): For engine deployment via CI/CD

## 🛠️ Contributing

```bash
git clone https://github.com/amorphie/cli
cd cli
npm install
npm link  # Makes amorphie available globally

# Test the CLI
amorphie create test-domain
```

## 📚 Resources

- [JSON Schema Validation](https://json-schema.org/)

## 📄 License

MIT License

---

**🚀 Built for modern domain-driven architecture with ❤️ by the Amorphie Team** 