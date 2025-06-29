# @amorphie/cli

Modern CLI tool for creating domain-driven Amorphie projects with comprehensive development tooling and VSCode integration.

## 🚀 Quick Start

### Installation

```bash
npm install -g @amorphie/cli
```

### Create a New Project

```bash
# Interactive mode - prompts for project and domain names
create-amorphie-app

# With project name - will prompt for domain name
create-amorphie-app my-project

# Using npx (no global installation needed)
npx @amorphie/cli my-project
```

## 📋 What It Does

The CLI creates a **domain-driven** Amorphie project with:

✅ **Domain-based architecture** with structured component directories  
✅ **VSCode workspace** with development scripts and validation tools  
✅ **JSON Schema validation** for all component types  
✅ **Automated linting** and validation workflows  
✅ **Code snippets** and development automation  
✅ **AI assistant rules** for Cursor/VSCode  

## 🏗️ Project Structure

After running the CLI, you'll get:

```
my-project/
├── your-domain/                    # Domain directory (e.g., user-management)
│   ├── Workflows/                  # Business process workflows  
│   ├── Functions/                  # Serverless functions
│   ├── Views/                      # UI components and views
│   ├── Extensions/                 # Custom framework extensions
│   ├── Schemas/                    # Data models and schemas
│   └── Tasks/                      # Background tasks and jobs
├── .vscode/                        # VSCode workspace configuration
│   ├── scripts/                    # Development automation scripts
│   │   ├── validate-component.js   # Component validation
│   │   ├── lint-domain.js          # Domain linting
│   │   ├── create-code-file.js     # Component creation
│   │   ├── update-workflow-csx.js  # CSX rule management
│   │   └── watch-workflows-csx.js  # File watching
│   ├── schemas/                    # JSON schemas for validation
│   ├── amorphie.code-snippets      # VSCode code snippets
│   ├── settings.json               # Workspace settings
│   ├── tasks.json                  # Custom VSCode tasks
│   ├── keybindings.json           # Keyboard shortcuts
│   └── lint.config.json           # Linting configuration
├── amorphie.config.json            # Domain configuration
├── .cursorrules                    # AI assistant rules
├── package.json                    # Project dependencies
└── README.md                       # Project documentation
```

## ⚙️ Features

### 🎯 Domain-Driven Development
- **Domain Organization**: Structure your project around business domains
- **Domain Validation**: Ensure consistency across domain components
- **Semantic Versioning**: All components follow `name.version.json` pattern
- **Cross-Domain References**: Validate references between domains

### 🛠️ Development Tools
- **Component Validation**: JSON schema validation for all component types
- **Domain Linting**: Custom rules for filename consistency and business logic
- **Auto-generation**: Create components with proper naming and structure
- **File Watching**: Automatic validation and CSX rule updates

### 📝 VSCode Integration
- **Custom Tasks**: Validate, lint, and create components via command palette
- **Code Snippets**: Pre-built templates for all component types
- **Keyboard Shortcuts**: Quick access to common operations
- **Problem Matching**: Integrated error reporting and navigation

### 🤖 AI Assistant Support
- **Cursor Rules**: Domain-specific AI assistance rules
- **Schema Patterns**: Guidance for proper JSON schema usage
- **Best Practices**: Built-in development guidelines

## 🔧 Available Scripts

Once your project is created, use these npm scripts:

```bash
# Validation
npm run validate          # Validate current component
npm run validate:all      # Validate all domain components
npm run validate:verbose  # Detailed validation output

# Linting
npm run lint             # Lint domain files
npm run lint:domain      # Domain-specific linting
npm run lint:verbose     # Detailed linting output

# Development
npm test                 # Run domain linting tests
npm run build            # Build with pre-validation
```

## 🎨 VSCode Tasks & Shortcuts

### Quick Access Tasks
- **Ctrl/Cmd + Shift + P** → "Tasks: Run Task" to access:
  - `Validate Component` - Validate current file
  - `Validate All Components` - Validate entire domain
  - `Lint All Components` - Run domain linting
  - `Create Mapping CSX` - Create workflow mapping
  - `Update Current CSX` - Update workflow rules
  - `Watch CSX Files` - Auto-update workflow files

### Code Snippets
Type these prefixes in VSCode and press Tab:
- `amorphie-workflow` - Create workflow component
- `amorphie-function` - Create function component  
- `amorphie-view` - Create view component
- `amorphie-schema` - Create schema component
- `amorphie-task` - Create task component
- `amorphie-extension` - Create extension component

## 📖 Usage Examples

### Domain Name Guidelines
```bash
✅ Valid domain names:
- core
- user-management  
- billing-system
- analytics-engine

❌ Invalid domain names:
- UserManagement (no uppercase)
- user_management (no underscores)
- -user-mgmt (no leading hyphens)
- user-mgmt- (no trailing hyphens)
```

### Component Naming
```bash
# Pattern: {type}-{description}.{version}.json
workflow-user-registration.1.0.0.json
function-calculate-tax.1.0.0.json
view-dashboard-summary.1.0.0.json
schema-customer-profile.1.0.0.json
task-daily-cleanup.1.0.0.json
extension-audit-logger.1.0.0.json
```

## 🔍 Configuration

### amorphie.config.json
```json
{
  "domain": "your-domain",
  "version": "1.0.0",
  "paths": {
    "componentsRoot": "your-domain",
    "workflows": "Workflows",
    "functions": "Functions",
    "views": "Views",
    "extensions": "Extensions",
    "schemas": "Schemas",
    "tasks": "Tasks"
  },
  "validation": {
    "enabled": true,
    "autoScan": true
  },
  "linting": {
    "enabled": true,
    "rules": {
      "filename-consistency": true,
      "reference-integrity": true,
      "schema-validation": true
    }
  }
}
```

## 🚀 Next Steps

After creating your project:

1. **Open in VSCode**
   ```bash
   cd my-project
   code .
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start Development**
   - Use `Ctrl/Cmd + Shift + P` → "Tasks: Run Task" for development tasks
   - Create components using code snippets
   - Validate your work with built-in tools

4. **Follow Best Practices**
   - Read the generated `.cursorrules` for domain guidelines
   - Use semantic versioning for all components
   - Validate components regularly during development

## 🛠️ Development

To contribute to this CLI tool:

```bash
git clone <repository>
cd amorphie-cli
npm install
npm link  # Makes create-amorphie-app available globally

# Test the CLI
create-amorphie-app test-project
```

## 📚 Learn More

- [Amorphie Documentation](https://docs.amorphie.com)

## 📄 License

MIT License - see LICENSE file for details.

---

**Created with ❤️ by the Amorphie Team** 