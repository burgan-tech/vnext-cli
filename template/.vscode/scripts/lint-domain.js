#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

/**
 * Advanced Domain Component Linter
 * Validates JSON files against schemas and domain-specific business rules
 */

class DomainLinter {
  constructor(domainName, configOverrides = {}) {
    this.domainName = domainName;
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
    });

    addFormats(this.ajv);

    this.errors = [];
    this.warnings = [];
    this.schemasDir = path.join(__dirname, "../schemas");
    this.loadedSchemas = new Map();

    this.config = this.loadConfig();
    this.verbose = configOverrides.verbose || false;

    // Domain-specific patterns
    this.includePatterns = [
      `{domainName}/Workflows/*.json`,
      `{domainName}/Functions/*.json`, 
      `{domainName}/Views/*.json`,
      `{domainName}/Extensions/*.json`,
      `{domainName}/Schemas/*.json`,
      `{domainName}/Tasks/*.json`,
      `**/{domainName}/Workflows/*.json`,
      `**/{domainName}/Functions/*.json`,
      `**/{domainName}/Views/*.json`, 
      `**/{domainName}/Extensions/*.json`,
      `**/{domainName}/Schemas/*.json`,
      `**/{domainName}/Tasks/*.json`,
    ];

    this.ignorePatterns = [
      "**/node_modules/**",
      "**/.git/**",
      "**/.vscode/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/package.json",
      "**/package-lock.json",
      "**/.tmp/**",
      "**/tmp/**",
    ];

    this.rules = {
      "filename-consistency": true,
      "domain-validation": true,
      "version-consistency": true,
      "schema-validation": true,
      "business-rules": true,
    };

    if (this.verbose) {
      console.log(`📁 Linting domain: {domainName}`);
      console.log(`📋 Include patterns: ${this.includePatterns.slice(0, 3).join(", ")}...`);
    }
  }

  loadConfig() {
    try {
      const configPath = path.join(process.cwd(), "amorphie.config.json");
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf8"));
      }
    } catch (error) {
      console.warn(`⚠ Could not load amorphie.config.json: ${error.message}`);
    }
    
    return {
      domain: this.domainName,
      linting: {
        enabled: true,
        rules: this.rules
      }
    };
  }

  shouldIgnoreFile(filePath) {
    const normalizedPath = filePath.replace(/\\\\/g, "/");
    
    for (const pattern of this.ignorePatterns) {
      if (this.matchesPattern(normalizedPath, pattern)) {
        return true;
      }
    }
    return false;
  }

  isRelevantFile(filePath) {
    const normalizedPath = filePath.replace(/\\\\/g, "/");
    // Convert absolute path to relative path from cwd
    const relativePath = path.relative(process.cwd(), normalizedPath).replace(/\\\\/g, "/");
    const fileName = path.basename(filePath);

    if (this.verbose) {
      console.log(`🔍 Checking file: ${normalizedPath}`);
      console.log(`  📁 Relative path: ${relativePath}`);
    }

    if (!fileName.endsWith(".json")) {
      if (this.verbose) console.log(`  ❌ Not a JSON file`);
      return false;
    }

    if (this.shouldIgnoreFile(normalizedPath)) {
      if (this.verbose) console.log(`  ❌ File ignored`);
      return false;
    }

    for (const pattern of this.includePatterns) {
      const matches = this.matchesPattern(relativePath, pattern);
      if (this.verbose) {
        console.log(`  📋 Pattern: ${pattern} → ${matches ? '✅' : '❌'}`);
      }
      if (matches) {
        if (this.verbose) console.log(`  ✅ File is relevant!`);
        return true;
      }
    }

    if (this.verbose) console.log(`  ❌ No patterns matched`);
    return false;
  }

  matchesPattern(filePath, pattern) {
    const normalizedPath = filePath.replace(/\\\\/g, "/");
    const normalizedPattern = pattern.replace(/\\\\/g, "/");

    if (this.verbose) {
      console.log(`    🔍 Matching: "${normalizedPath}" vs "${normalizedPattern}"`);
    }

    let regexPattern = normalizedPattern
      .replace(/\*\*/g, "__DOUBLE_STAR__")
      .replace(/\*/g, "__SINGLE_STAR__") 
      .replace(/\?/g, "__QUESTION__")
      .replace(/[+^${}()|[\]\\]/g, "\\$&")
      .replace(/\./g, "\\.")
      .replace(/__DOUBLE_STAR__/g, ".*")
      .replace(/__SINGLE_STAR__/g, "[^/]*")
      .replace(/__QUESTION__/g, "[^/]");

    if (normalizedPattern.startsWith("**/")) {
      const rootPattern = regexPattern.replace(/^\.\*\//, "");
      regexPattern = `(${regexPattern}|${rootPattern})`;
    }

    if (this.verbose) {
      console.log(`    🔧 Regex pattern: "${regexPattern}"`);
    }

    const regex = new RegExp(`^${regexPattern}$`);
    const result = regex.test(normalizedPath);
    
    if (this.verbose) {
      console.log(`    ✅ Match result: ${result}`);
    }
    
    return result;
  }

  async loadSchema(uri) {
    try {
      if (this.loadedSchemas.has(uri)) {
        return this.loadedSchemas.get(uri);
      }

      const schemaPath = path.join(this.schemasDir, path.basename(uri));
      if (fs.existsSync(schemaPath)) {
        const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
        this.loadedSchemas.set(uri, schema);
        return schema;
      }
      
      return this.getBasicSchema();
    } catch (error) {
      console.warn(`⚠ Schema load failed: ${error.message}`);
      return this.getBasicSchema();
    }
  }

  getBasicSchema() {
    return {
      type: "object",
      properties: {
        key: { type: "string" },
        domain: { type: "string", enum: [this.domainName] },
        version: { type: "string" },
        type: { type: "string" }
      },
      required: ["key", "domain"]
    };
  }

  async lintFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      let json;

      try {
        json = JSON.parse(content);
      } catch (parseError) {
        this.addError(filePath, `JSON Parse Error: ${parseError.message}`, 1, 1);
        return;
      }

      // Schema validation
      const schemaFile = this.determineSchema(filePath, json);
      const schema = await this.loadSchema(schemaFile);
      const validate = this.ajv.compile(schema);
      const valid = validate(json);

      if (!valid && validate.errors) {
        validate.errors.forEach(error => {
          this.addError(filePath, this.formatSchemaError(error), 0, 0);
        });
      }

      // Business rules validation
      await this.validateBusinessRules(filePath, json, content);

    } catch (error) {
      this.addError(filePath, `File Error: ${error.message}`, 1, 1);
    }
  }

  determineSchema(filePath, json) {
    const componentPath = path.dirname(filePath);
    const componentType = path.basename(componentPath);
    
    switch (componentType) {
      case "Workflows":
        return "workflow-definition.schema.json";
      case "Functions":
        return "function-definition.schema.json";
      case "Views":
        return "view-definition.schema.json";
      case "Extensions":
        return "extension-definition.schema.json";
      case "Schemas":
        return "schema-definition.schema.json";
      case "Tasks":
        return "task-definition.schema.json";
      default:
        return "component-definition.schema.json";
    }
  }

  async validateBusinessRules(filePath, json, content) {
    // Domain validation
    if (this.rules["domain-validation"]) {
      if (!json.domain) {
        this.addError(filePath, "Missing required 'domain' field", 0, 0);
      } else if (json.domain !== this.domainName) {
        this.addError(filePath, `Domain mismatch: expected '${this.domainName}', found '${json.domain}'`, 0, 0);
      }
    }

    // Filename consistency
    if (this.rules["filename-consistency"]) {
      const fileName = path.basename(filePath, '.json');
      if (json.key && !fileName.toLowerCase().includes(json.key.toLowerCase())) {
        this.addWarning(filePath, `Filename should include component key '${json.key}'`, 0, 0);
      }
    }

    // Version consistency
    if (this.rules["version-consistency"]) {
      if (json.version && !/^\d+\.\d+\.\d+/.test(json.version)) {
        this.addWarning(filePath, "Version should follow semantic versioning (x.y.z)", 0, 0);
      }
    }

    // Component-specific validation
    if (this.rules["business-rules"]) {
      await this.validateComponentSpecificRules(filePath, json);
    }
  }

  async validateComponentSpecificRules(filePath, json) {
    const componentPath = path.dirname(filePath);
    const componentType = path.basename(componentPath);

    // Required fields check
    if (!json.key) {
      this.addError(filePath, "Missing required 'key' field", 0, 0);
    }

    if (!json.description) {
      this.addWarning(filePath, "Component should have a description", 0, 0);
    }

    // Component type-specific validation
    switch (componentType) {
      case "Workflows":
        this.validateWorkflowComponent(filePath, json);
        break;
      case "Functions":
        this.validateFunctionComponent(filePath, json);
        break;
      case "Tasks":
        this.validateTaskComponent(filePath, json);
        break;
      case "Views":
        this.validateViewComponent(filePath, json);
        break;
      case "Extensions":
        this.validateExtensionComponent(filePath, json);
        break;
      case "Schemas":
        this.validateSchemaComponent(filePath, json);
        break;
    }
  }

  validateWorkflowComponent(filePath, json) {
    if (json.steps && Array.isArray(json.steps)) {
      if (json.steps.length === 0) {
        this.addWarning(filePath, "Workflow should have at least one step", 0, 0);
      }
    }
  }

  validateFunctionComponent(filePath, json) {
    if (!json.handler && !json.execute) {
      this.addWarning(filePath, "Function should have a handler or execute property", 0, 0);
    }
  }

  validateTaskComponent(filePath, json) {
    if (json.schedule && typeof json.schedule === 'string') {
      // Basic cron validation
      const cronParts = json.schedule.split(' ');
      if (cronParts.length < 5) {
        this.addWarning(filePath, "Invalid cron schedule format", 0, 0);
      }
    }
  }

  validateViewComponent(filePath, json) {
    if (!json.template && !json.component) {
      this.addWarning(filePath, "View should have a template or component property", 0, 0);
    }
  }

  validateExtensionComponent(filePath, json) {
    if (!json.init && !json.setup) {
      this.addWarning(filePath, "Extension should have an init or setup method", 0, 0);
    }
  }

  validateSchemaComponent(filePath, json) {
    if (json.type === 'object' && !json.properties) {
      this.addWarning(filePath, "Object schema should have properties", 0, 0);
    }
  }

  formatSchemaError(error) {
    return `Schema validation failed: ${error.message} (${error.instancePath})`;
  }

  addError(file, message, line, column) {
    this.errors.push({ file, message, line, column, type: 'error' });
  }

  addWarning(file, message, line, column) {
    this.warnings.push({ file, message, line, column, type: 'warning' });
  }

  async lintDirectory(directory) {
    const allFiles = [];
    await this.getAllFiles(directory, allFiles);
    
    const relevantFiles = allFiles.filter(file => this.isRelevantFile(file));
    
    if (this.verbose) {
      console.log(`📁 Found ${relevantFiles.length} files to lint in ${directory}`);
    }

    for (const file of relevantFiles) {
      await this.lintFile(file);
    }
  }

  async getAllFiles(directory, allFiles) {
    try {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory() && !this.shouldIgnoreFile(fullPath)) {
          await this.getAllFiles(fullPath, allFiles);
        } else if (entry.isFile()) {
          allFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${directory}: ${error.message}`);
    }
  }

  printResults() {
    console.log(`\\n${'='.repeat(50)}`);
    console.log(`${this.domainName} Domain Linting Results`);
    console.log(`${'='.repeat(50)}`);
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log(`✅ All ${this.domainName} domain files passed linting!`);
      return;
    }

    if (this.errors.length > 0) {
      console.log(`\\n🔴 Errors (${this.errors.length}):`);
      this.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${path.basename(error.file)}: ${error.message}`);
      });
    }

    if (this.warnings.length > 0) {
      console.log(`\\n🟡 Warnings (${this.warnings.length}):`);
      this.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${path.basename(warning.file)}: ${warning.message}`);
      });
    }

    console.log(`\\nSummary: ${this.errors.length} errors, ${this.warnings.length} warnings`);
  }
}

async function main() {
  const [, , domainName, ...flags] = process.argv;
  
  if (!domainName) {
    console.error("Usage: node lint-domain.js <domainName> [--verbose]");
    process.exit(1);
  }

  const verbose = flags.includes('--verbose');
  const linter = new DomainLinter(domainName, { verbose });
  
  const domainPath = path.join(process.cwd(), domainName);
  if (fs.existsSync(domainPath)) {
    await linter.lintDirectory(domainPath);
  } else {
    console.error(`Domain directory not found: ${domainPath}`);
    process.exit(1);
  }

  linter.printResults();
  process.exit(linter.errors.length > 0 ? 1 : 0);
}

main().catch(console.error); 