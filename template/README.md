# {packageName}

A domain-driven Amorphie project created using [@amorphie/cli](https://www.npmjs.com/package/@amorphie/cli).

## 📋 Table of Contents

- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Domain Configuration](#-domain-configuration)
- [Component Types](#-component-types)
- [File Naming Conventions](#-file-naming-conventions)
- [VSCode Integration](#-vscode-integration)
- [Available Scripts](#-available-scripts)
- [Development Workflow](#-development-workflow)
- [Validation & Linting](#-validation--linting)
- [Best Practices](#-best-practices)

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ 
- npm or yarn
- VSCode (recommended for full IDE experience)

### Installation

```bash
# Install dependencies
npm install

# Initialize development environment
npm run dev
```

## 📁 Project Structure

```
{packageName}/
├── {domainName}/                    # Domain-specific components
│   ├── Workflows/                   # Business process workflows
│   │   ├── workflow-1.json
│   │   └── workflow-2.json
│   ├── Functions/                   # Serverless functions
│   │   ├── function-1.json  
│   │   └── function-2.json
│   ├── Views/                       # UI views and components
│   │   ├── view-1.json
│   │   └── view-2.json
│   ├── Extensions/                  # Custom extensions
│   │   ├── extension-1.json
│   │   └── extension-2.json
│   ├── Schemas/                     # Data models and schemas
│   │   ├── schema-1.json
│   │   └── schema-2.json
│   └── Tasks/                       # Background tasks
│       ├── task-1.json
│       └── task-2.json
├── .vscode/                         # VSCode workspace configuration
│   ├── scripts/                     # Development automation scripts
│   │   ├── validate-component.js    # Component validation
│   │   ├── lint-workflow.js         # Workflow linting
│   │   ├── create-code-file.js      # Code file creation
│   │   ├── update-workflow-csx.js   # CSX rule updates
│   │   ├── update-all-workflows-csx.js  # Batch csx files updates
│   │   └── watch-workflows-csx.js       # Csx Files watching
│   ├── schemas/                     # JSON schemas for validation
│   │   ├── workflow-definition.schema.json
│   │   ├── function-definition.schema.json
│   │   ├── view-definition.schema.json
│   │   ├── extension-definition.schema.json
│   │   ├── schema-definition.schema.json
│   │   ├── task-definition.schema.json
│   │   └── core-schema.schema.json
│   ├── amorphie.code-snippets       # Code snippets for components
│   ├── settings.json                # Workspace settings
│   ├── tasks.json                   # Custom VSCode tasks
│   └── lint.config.json            # Linting configuration
├── amorphie.config.json             # Project configuration
├── .cursorrules                     # Cursor AI assistant rules
├── package.json                     # Dependencies and scripts
└── README.md                        # This documentation
```

## ⚙️ Domain Configuration

### amorphie.config.json

The `amorphie.config.json` file contains domain-specific configuration:

```json
{
  "domain": "{domainName}",
  "version": "1.0.0",
  "validation": {
    "enabled": true,
    "strict": true,
    "rules": {
      "filename-consistency": true,
      "version-consistency": true,
      "business-rules": true,
      "domain-validation": true,
      "schema-validation": true
    }
  },
  "paths": {
    "workflows": "{domainName}/Workflows",
    "functions": "{domainName}/Functions", 
    "views": "{domainName}/Views",
    "extensions": "{domainName}/Extensions",
    "schemas": "{domainName}/Schemas",
    "tasks": "{domainName}/Tasks"
  },
  "linting": {
    "include": ["{domainName}/**/*.json"],
    "exclude": ["node_modules/**", ".vscode/**"],
    "rules": {
      "required-fields": ["key", "domain"],
      "version-format": "semantic"
    }
  }
}
```

#### Configuration Properties

- **domain**: The business domain name for this project
- **validation.enabled**: Enable/disable component validation
- **validation.strict**: Use strict validation rules
- **validation.rules**: Individual validation rule toggles
- **paths**: Directory paths for each component type
- **linting**: File inclusion/exclusion patterns and rules

## 🧩 Component Types

### 1. Workflows
Business process definitions with states, transitions, and tasks.

**Purpose**: Define complex business workflows with multiple states and transitions.

**Schema**: `workflow-definition.schema.json`

### 2. Functions  
Serverless function definitions for business logic.

**Purpose**: Define stateless functions for data processing and business rules.

**Schema**: `function-definition.schema.json`

### 3. Views
UI component and view definitions.

**Purpose**: Define user interface components and their data bindings.

**Schema**: `view-definition.schema.json`

### 4. Extensions
Custom extensions for extending framework capabilities.

**Purpose**: Add custom functionality to the Amorphie framework.

**Schema**: `extension-definition.schema.json`

### 5. Schemas
Data model and schema definitions.

**Purpose**: Define data structures, validation rules, and API contracts.

**Schema**: `schema-definition.schema.json`

### 6. Tasks
Background task and job definitions.

**Purpose**: Define scheduled jobs, queued tasks, and background processes.

**Schema**: `task-definition.schema.json`

## 📝 File Naming Conventions

### General Rules
1. **Domain Prefix**: All files should start with the domain name
2. **Lowercase**: Use lowercase letters only
3. **Hyphen Separation**: Use hyphens to separate words
4. **Component Type**: Include component type in filename
5. **Descriptive Names**: Use meaningful, descriptive names

### Naming Patterns

```bash
# Pattern: {type}-{key}.{version}.json

# Examples:
flow-user-registration.1.0.0.json
function-calculate-interest.1.0.0.json
view-customer-dashboard.1.0.0.json
extension-audit-logger.1.0.0.json
schema-customer-profile.1.0.0.json
task-daily-report-generator.1.0.0.json
```

## 🎨 VSCode Integration

### Code Snippets (`amorphie.code-snippets`)

The project includes comprehensive code snippets for rapid development:

#### Available Snippets:
- **`workflow-basic`**: Basic workflow structure
- **`instance-basic`**: Instance definition
- **`view-def`**: View component
- **`extension-def`**: Extension definition
- **`schema-def`**: Schema definition
- **`state-*`**: All state types
- **`transition-*`**: All transition types
- **`task-*`**: All task types

#### Usage:
1. Open a `.json` file in the domain directory
2. Press `Tab` to expand
3. Fill in the template variables

### VSCode Tasks (`tasks.json`)

The project includes custom tasks for development automation:

#### Validation Tasks:
- **Validate Component**: Validate the currently open component
- **Validate All Components**: Validate all components in the domain
- **Lint All Components**: Lint all domain components

#### CSX Workflow Tasks:
- **Update Current CSX**: Update CSX rules for current workflow
- **Update All CSX**: Batch update all workflow CSX rules
- **Watch CSX Changes**: Watch for CSX file changes and auto-update
- **Create Mapping CSX**: Create new CSX mapping file
- **Create Rule CSX**: Create new CSX rule file

### Workspace Settings

The `.vscode/settings.json` includes:
- JSON schema associations for component validation
- File associations for syntax highlighting
- IntelliSense configuration for domain-specific completions
- Auto-formatting rules
- File watcher configurations

## 📜 Available Scripts

### Development Scripts
```bash
# Run all tests
npm test
```

### Validation & Linting
```bash
# Validate all components
npm run validate

# Lint all components
npm run lint
```

## ✅ Validation & Linting

### Validation Rules

The project enforces these validation rules:

#### 1. Filename Consistency
- Filename must include the component's `key` field
- Files must follow naming conventions

#### 2. Version Consistency
- Version must follow semantic versioning (x.y.z)
- Version must be consistent across related components

#### 3. Business Rules
- Required fields: `key`, `domain`
- Domain must match project domain
- Component type must be valid

#### 4. Domain Validation
- All components must belong to the correct domain
- Domain-specific business rules are enforced

#### 5. Schema Validation
- JSON structure must match component schema
- All required properties must be present
- Data types must be correct

### Linting Rules

The linter checks for:
- JSON syntax errors
- Schema compliance
- Naming convention adherence
- Required field presence
- Cross-component consistency

### Running Validation

```bash
# Validate single file
node .vscode/scripts/validate-component.js path/to/file.json {domainName}

# Validate all components
npm run validate

# Lint components
npm run lint
```

## 📏 Best Practices

### Component Design
1. **Single Responsibility**: Each component should have one clear purpose
2. **Consistent Naming**: Follow domain naming conventions strictly
3. **Version Management**: Use semantic versioning for all components
4. **Documentation**: Include clear descriptions and examples
5. **Validation**: Always validate components before committing

### File Organization
1. **Domain Grouping**: Keep all domain components together
2. **Type Separation**: Separate components by type in dedicated folders
3. **Descriptive Names**: Use meaningful, searchable filenames
4. **Consistent Structure**: Follow the established JSON structure

### Development Process
1. **Use Snippets**: Leverage VSCode snippets for consistency
2. **Validate Early**: Run validation during development
3. **Lint Regularly**: Use linting to catch issues early
4. **Test Thoroughly**: Validate components in different scenarios
5. **Document Changes**: Update documentation when adding features

### Performance
1. **Optimize JSON**: Keep JSON files lean and focused
2. **Batch Operations**: Use batch scripts for multiple component updates
3. **Watch Mode**: Use file watching for automatic updates
4. **Caching**: Leverage validation caching for faster development

## 🛠️ Troubleshooting

### Common Issues

#### Validation Failures
```bash
# Check schema errors
npm run validate

# Validate specific file
node .vscode/scripts/validate-component.js path/to/file.json {domainName}
```

#### Linting Errors
```bash
# Check specific issues
npm run lint
```

### Getting Help
- Check component schemas in `.vscode/schemas/`
- Review validation output for specific errors
- Use VSCode IntelliSense for auto-completion
- Refer to snippet examples in `.vscode/amorphie.code-snippets`

## 📚 Learn More

- [Amorphie Documentation](https://docs.amorphie.com)
- [Amorphie CLI](https://www.npmjs.com/package/@amorphie/cli)

---

**Domain**: {domainName} | **Generated by**: [@amorphie/cli](https://www.npmjs.com/package/@amorphie/cli)