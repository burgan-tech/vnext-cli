#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

/**
 * Amorphie Domain Component Validator
 * Validates domain component JSON files and reports errors
 */

// Colors for console output
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  reset: "\x1b[0m",
  bright: "\x1b[1m",
};

class ComponentValidator {
  constructor(domainName, configOverrides = {}) {
    this.domainName = domainName;
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      logger: false,
    });
    addFormats(this.ajv);

    this.config = this.loadConfig();
    this.compiledValidators = new Map();
    this.totalFiles = 0;
    this.validFiles = 0;
    this.invalidFiles = 0;
  }

  loadConfig() {
    try {
      const configPath = path.join(process.cwd(), "amorphie.config.json");
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf8"));
      }
    } catch (error) {
      console.warn(`${colors.yellow}⚠ Could not load amorphie.config.json: ${error.message}${colors.reset}`);
    }
    
    // Default config
    return {
      domain: this.domainName,
      validation: {
        enabled: true,
        strict: true
      },
      paths: {
        workflows: "Workflows",
        functions: "Functions", 
        views: "Views",
        extensions: "Extensions",
        schemas: "Schemas",
        tasks: "Tasks"
      }
    };
  }

  async loadSchema(schemaFile) {
    try {
      const schemaPath = path.join(__dirname, "../schemas", schemaFile);
      if (fs.existsSync(schemaPath)) {
        const schemaContent = fs.readFileSync(schemaPath, "utf8");
        return JSON.parse(schemaContent);
      }
      
      // Fallback to basic schema
      return this.getBasicSchema();
    } catch (error) {
      console.error(`${colors.red}✗ Failed to load schema ${schemaFile}: ${error.message}${colors.reset}`);
      return this.getBasicSchema();
    }
  }

  getBasicSchema() {
    return {
      type: "object",
      properties: {
        name: { type: "string" },
        domain: { type: "string", enum: [this.domainName] },
        version: { type: "string" },
        type: { type: "string" },
        description: { type: "string" }
      },
      required: ["name", "domain"]
    };
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

  async validateFile(filePath) {
    this.totalFiles++;

    try {
      const content = fs.readFileSync(filePath, "utf8");

      let componentData;
      try {
        componentData = JSON.parse(content);
      } catch (parseError) {
        this.invalidFiles++;
        console.log(`${colors.red}✗ ${filePath}${colors.reset}`);
        this.printParseError(parseError, content, filePath);
        return;
      }

      // Domain validation
      if (componentData.domain && componentData.domain !== this.domainName) {
        this.invalidFiles++;
        console.log(`${colors.red}✗ ${filePath}${colors.reset}`);
        console.log(`    ${colors.red}Domain mismatch: expected '${this.domainName}', found '${componentData.domain}'${colors.reset}`);
        return;
      }

      const schemaFile = this.determineSchema(filePath, componentData);
      const schema = await this.loadSchema(schemaFile);

      let validate;
      if (this.compiledValidators.has(schemaFile)) {
        validate = this.compiledValidators.get(schemaFile);
      } else {
        validate = this.ajv.compile(schema);
        this.compiledValidators.set(schemaFile, validate);
      }

      const valid = validate(componentData);

      if (valid) {
        this.validFiles++;
        console.log(`${colors.green}✓ ${filePath}${colors.reset}`);
        this.performBusinessValidations(componentData, filePath);
      } else {
        this.invalidFiles++;
        console.log(`${colors.red}✗ ${filePath}${colors.reset}`);
        this.printSchemaErrors(validate.errors, filePath, content);
      }
    } catch (error) {
      this.invalidFiles++;
      console.log(`${colors.red}✗ ${filePath} - File Error: ${error.message}${colors.reset}`);
    }
  }

  performBusinessValidations(component, filePath) {
    const warnings = [];

    // Key consistency check (key field should exist)
    if (!component.key) {
      warnings.push("Missing required 'key' field");
    }

    // Filename consistency check
    const fileName = path.basename(filePath, '.json');
    if (component.key && !fileName.toLowerCase().includes(component.key.toLowerCase())) {
      warnings.push(`Filename should include component key '${component.key}'`);
    }

    // Version format check
    if (component.version && !/^\d+\.\d+\.\d+/.test(component.version)) {
      warnings.push("Version should follow semantic versioning (x.y.z)");
    }

    // Required fields check
    if (!component.description) {
      warnings.push("Component should have a description");
    }

    if (warnings.length > 0) {
      console.log(`${colors.yellow}  Warnings:${colors.reset}`);
      warnings.forEach((warning) => {
        console.log(`    ${colors.yellow}⚠ ${warning}${colors.reset}`);
      });
    }
  }

  printParseError(parseError, content, filePath) {
    console.log(`    ${colors.red}JSON Parse Error: ${parseError.message}${colors.reset}`);
    
    const match = parseError.message.match(/position (\\d+)/);
    if (match) {
      const position = parseInt(match[1]);
      const lines = content.split('\\n');
      let currentPos = 0;
      let lineNum = 1;
      
      for (const line of lines) {
        if (currentPos + line.length >= position) {
          const columnNum = position - currentPos + 1;
          console.log(`    ${colors.red}Line ${lineNum}, Column ${columnNum}${colors.reset}`);
          console.log(`    ${colors.white}${line}${colors.reset}`);
          console.log(`    ${colors.red}${' '.repeat(columnNum - 1)}^${colors.reset}`);
          break;
        }
        currentPos += line.length + 1;
        lineNum++;
      }
    }
  }

  printSchemaErrors(errors, filePath, content) {
    errors.forEach((error, index) => {
      console.log(`    ${colors.red}✗ Error ${index + 1}: ${error.message}${colors.reset}`);
      console.log(`    ${colors.white}  Path: ${error.instancePath}${colors.reset}`);
      if (error.data !== undefined) {
        console.log(`    ${colors.white}  Value: ${JSON.stringify(error.data)}${colors.reset}`);
      }
    });
  }

  findComponentFiles(directory) {
    const files = [];
    
    const scanDirectory = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        console.log(`${colors.blue}📁 Scanning directory: ${dir}${colors.reset}`);
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Scan component directories
            const componentTypes = ['Workflows', 'Functions', 'Views', 'Extensions', 'Schemas', 'Tasks'];
            if (componentTypes.includes(entry.name)) {
              console.log(`${colors.blue}📂 Found component directory: ${entry.name}${colors.reset}`);
              scanDirectory(fullPath);
            }
          } else if (entry.isFile() && this.isComponentFile(entry.name)) {
            console.log(`${colors.green}📄 Found component file: ${entry.name}${colors.reset}`);
            files.push(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.json')) {
            console.log(`${colors.yellow}📄 Skipped JSON file: ${entry.name} (doesn't match component criteria)${colors.reset}`);
          }
        }
      } catch (error) {
        console.error(`${colors.red}Error reading directory ${dir}: ${error.message}${colors.reset}`);
      }
    };

    scanDirectory(directory);
    console.log(`${colors.cyan}📋 Total component files found: ${files.length}${colors.reset}`);
    return files;
  }

  isComponentFile(filename) {
    // Accept all JSON files except config files
    if (!filename.endsWith('.json')) {
      return false;
    }
    
    // Exclude common config files
    const excludeFiles = ['package.json', 'tsconfig.json', 'amorphie.config.json'];
    if (excludeFiles.includes(filename)) {
      return false;
    }
    
    return true;
  }

  printSummary() {
    console.log(`\\n${colors.cyan}${'='.repeat(50)}${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}${this.domainName} Domain Validation Summary${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}`);
    console.log(`Total files: ${this.totalFiles}`);
    console.log(`${colors.green}Valid files: ${this.validFiles}${colors.reset}`);
    console.log(`${colors.red}Invalid files: ${this.invalidFiles}${colors.reset}`);
    
    if (this.invalidFiles === 0) {
      console.log(`\\n${colors.green}${colors.bright}✅ All ${this.domainName} domain components are valid!${colors.reset}`);
    } else {
      console.log(`\\n${colors.red}${colors.bright}❌ ${this.invalidFiles} ${this.domainName} domain component(s) failed validation${colors.reset}`);
    }
  }

  async run(targetPath) {
    console.log(`${colors.cyan}${colors.bright}🔍 Validating ${this.domainName} Domain Components${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}`);

    if (targetPath && fs.existsSync(targetPath)) {
      if (fs.statSync(targetPath).isFile()) {
        await this.validateFile(targetPath);
      } else {
        const files = this.findComponentFiles(targetPath);
        for (const file of files) {
          await this.validateFile(file);
        }
      }
    } else {
      // Default to domain directory
      const domainPath = path.join(process.cwd(), this.domainName);
      if (fs.existsSync(domainPath)) {
        const files = this.findComponentFiles(domainPath);
        for (const file of files) {
          await this.validateFile(file);
        }
      } else {
        console.error(`${colors.red}Domain directory not found: ${domainPath}${colors.reset}`);
        process.exit(1);
      }
    }

    this.printSummary();
    process.exit(this.invalidFiles > 0 ? 1 : 0);
  }
}

// Main execution
async function main() {
  const [, , targetPath, domainName] = process.argv;
  
  if (!domainName) {
    console.error("Usage: node validate-component.js <targetPath> <domainName>");
    process.exit(1);
  }

  const validator = new ComponentValidator(domainName);
  await validator.run(targetPath);
}

main().catch(console.error); 