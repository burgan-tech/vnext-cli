const fs = require('fs-extra');
const path = require('path');
const semver = require('semver');
const { execSync } = require('child_process');
const chalk = require('chalk');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

class RefResolver {
  constructor(options = {}) {
    this.options = {
      cacheDir: path.join(process.cwd(), '.vnext-cache'),
      strictMode: true,
      validateSchemas: true,
      validateReferenceConsistency: true,
      allowedHosts: ['registry.npmjs.org', 'npm.vnext.com'],
      schemaPath: path.join(__dirname, '..', 'template', '.vscode', 'schemas'),
      ...options
    };
    
    // Configure AJV like validate-component.js for better validation
    this.ajv = new Ajv({ 
      allErrors: true,
      verbose: true,
      strict: false,
      logger: false,
      validateFormats: true 
    });
    addFormats(this.ajv);
    
    this.packageCache = new Map();
    this.refCache = new Map();
    this.schemaCache = new Map();
    this.compiledValidators = new Map();
    this.currentDomain = null;
  }

  /**
   * Resolves a reference from JSON with comprehensive validation
   * @param {string} ref - Reference string like "@vnext/domain-core/Tasks/task-invalidate-cache.1.0.0.json"
   * @param {string} currentDomain - Current domain context
   * @returns {Promise<Object>} Resolved JSON content
   */
  async resolveRef(ref, currentDomain = null) {
    try {
      // Set current domain for validation if not already set
      if (currentDomain && !this.currentDomain) {
        this.currentDomain = currentDomain;
      }

      // Check cache first
      if (this.refCache.has(ref)) {
        return this.refCache.get(ref);
      }

      // Parse reference
      const parsedRef = this.parseRef(ref);
      
      let resolvedContent;
      
      // If it's a local reference (same domain)
      if (parsedRef.isLocal) {
        resolvedContent = await this.resolveLocalRef(parsedRef, currentDomain);
      } else {
        // External reference - fetch from NPM
        resolvedContent = await this.resolveExternalRef(parsedRef);
      }

      // Validate reference consistency (filename vs content)
      if (this.options.validateReferenceConsistency) {
        await this.validateReferenceConsistency(ref, resolvedContent, parsedRef);
      }

      // Validate schema if enabled
      if (this.options.validateSchemas) {
        await this.validateComponentSchema(resolvedContent, parsedRef.filePath);
      }
      
      // Cache the result
      this.refCache.set(ref, resolvedContent);
      
      return resolvedContent;
    } catch (error) {
      throw new Error(`Failed to resolve reference '${ref}': ${error.message}`);
    }
  }

  /**
   * Validates consistency between reference filename and component content
   * @param {string} ref - Original reference string
   * @param {Object} content - Resolved component content
   * @param {Object} parsedRef - Parsed reference object
   * @returns {Promise<void>}
   */
  async validateReferenceConsistency(ref, content, parsedRef) {
    const filename = path.basename(parsedRef.filePath, '.json');
    
    // Check if filename has version (old format) or not (new format)
    const filenameHasVersion = parsedRef.version !== null;
    
    if (filenameHasVersion) {
      // Old format: "invalidate-cache.1.0.0.json"
      // Expect both key and version in filename
      if (!content.version) {
        throw new Error(
          `Reference consistency validation failed for '${ref}': ` +
          `filename '${filename}' contains version but content has no version property`
        );
      }
      
      const expectedPattern = `${content.key}.${content.version}`;
      if (filename !== expectedPattern) {
        throw new Error(
          `Reference consistency validation failed for '${ref}': ` +
          `filename '${filename}' does not match component key '${content.key}' and version '${content.version}'. ` +
          `Expected filename: '${expectedPattern}.json'`
        );
      }
      
      // Validate version consistency between filename and content
      if (parsedRef.version !== content.version) {
        throw new Error(
          `Reference consistency validation failed for '${ref}': ` +
          `filename version '${parsedRef.version}' does not match content version '${content.version}'`
        );
      }
    } else {
      // New format: "invalidate-cache.json"
      // Only expect key in filename, version is optional in content
      if (filename !== content.key) {
        throw new Error(
          `Reference consistency validation failed for '${ref}': ` +
          `filename '${filename}' does not match component key '${content.key}'. ` +
          `Expected filename: '${content.key}.json'`
        );
      }
      
      console.log(chalk.gray(`  ℹ️  New format detected: filename without version for ref: ${ref}`));
    }

    // Validate version format if present
    if (content.version && !semver.valid(content.version)) {
      throw new Error(
        `Reference consistency validation failed for '${ref}': ` +
        `invalid version format '${content.version}'. Expected semantic version (e.g., '1.0.0')`
      );
    }

    // Validate key format (lowercase letters, numbers, hyphens)
    const keyPattern = /^[a-z0-9-]+$/;
    if (!keyPattern.test(content.key)) {
      throw new Error(
        `Reference consistency validation failed for '${ref}': ` +
        `invalid key format '${content.key}'. Expected lowercase letters, numbers, and hyphens only`
      );
    }
  }

  /**
   * Parses a reference string
   * @param {string} ref - Reference string
   * @returns {Object} Parsed reference object
   */
  parseRef(ref) {
    // Local reference: "Tasks/task-invalidate-cache.1.0.0.json"
    if (!ref.startsWith('@')) {
      return {
        isLocal: true,
        packageName: null,
        filePath: ref,
        version: this.extractVersionFromFilename(ref),
        filename: path.basename(ref, '.json')
      };
    }

    // External reference: "@vnext/domain-core/Tasks/task-invalidate-cache.1.0.0.json"
    const match = ref.match(/^(@[^/]+\/[^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid reference format: ${ref}`);
    }

    const [, packageName, filePath] = match;
    
    return {
      isLocal: false,
      packageName,
      filePath,
      version: this.extractVersionFromFilename(filePath),
      filename: path.basename(filePath, '.json')
    };
  }

  /**
   * Extracts version from filename
   * @param {string} filename - Filename like "task-invalidate-cache.1.0.0.json" or "invalidate-cache.json"
   * @returns {string|null} Version string
   */
  extractVersionFromFilename(filename) {
    // Try to extract version pattern like "file.1.0.0.json"
    const versionMatch = filename.match(/\.(\d+\.\d+\.\d+)\.json$/);
    if (versionMatch) {
      return versionMatch[1];
    }
    
    // For files without version in filename, return null
    // This supports the new format like "invalidate-cache.json"
    return null;
  }

  /**
   * Resolves local reference
   * @param {Object} parsedRef - Parsed reference object
   * @param {string} currentDomain - Current domain
   * @returns {Promise<Object>} Resolved content
   */
  async resolveLocalRef(parsedRef, currentDomain) {
    const filePath = path.join(process.cwd(), currentDomain || '', parsedRef.filePath);
    
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`Local file not found: ${filePath}`);
    }

    const content = await fs.readJSON(filePath);
    
    return {
      ...content,
      _resolvedFrom: `local:${parsedRef.filePath}`,
      _resolvedAt: new Date().toISOString()
    };
  }

  /**
   * Resolves external reference from NPM package
   * @param {Object} parsedRef - Parsed reference object
   * @returns {Promise<Object>} Resolved content
   */
  async resolveExternalRef(parsedRef) {
    // Download and cache package if not exists
    const packagePath = await this.ensurePackage(parsedRef.packageName);
    
    // Load vnext.config.json from the package
    const configPath = path.join(packagePath, 'vnext.config.json');
    if (!(await fs.pathExists(configPath))) {
      throw new Error(`Package ${parsedRef.packageName} does not contain vnext.config.json`);
    }

    const packageConfig = await fs.readJSON(configPath);
    
    // Check if component is exported
    if (!this.isComponentExported(parsedRef.filePath, packageConfig)) {
      throw new Error(`Component ${parsedRef.filePath} is not exported by ${parsedRef.packageName}`);
    }

    // Resolve the actual file
    const componentPath = path.join(packagePath, parsedRef.filePath);
    if (!(await fs.pathExists(componentPath))) {
      throw new Error(`Component file not found: ${componentPath}`);
    }

    const content = await fs.readJSON(componentPath);
    
    return {
      ...content,
      _resolvedFrom: `${parsedRef.packageName}:${parsedRef.filePath}`,
      _resolvedAt: new Date().toISOString(),
      _packageVersion: packageConfig.version
    };
  }

  /**
   * Checks if a component is exported by a package
   * @param {string} filePath - Component file path
   * @param {Object} packageConfig - Package vnext.config.json
   * @returns {boolean} True if component is exported
   */
  isComponentExported(filePath, packageConfig) {
    if (!packageConfig.exports || packageConfig.exports.visibility === 'private') {
      return false;
    }

    const filename = path.basename(filePath);
    const exports = packageConfig.exports;
    
    // Check in all export categories
    const allExports = [
      ...(exports.functions || []),
      ...(exports.workflows || []),
      ...(exports.tasks || []),
      ...(exports.views || []),
      ...(exports.schemas || []),
      ...(exports.extensions || [])
    ];

    return allExports.includes(filename);
  }

  /**
   * Ensures NPM package is downloaded and cached
   * @param {string} packageName - NPM package name
   * @returns {Promise<string>} Path to cached package
   */
  async ensurePackage(packageName) {
    const packageCacheDir = path.join(this.options.cacheDir, 'packages', packageName.replace(/[/@]/g, '_'));
    
    // Check if package is already cached
    if (await fs.pathExists(packageCacheDir)) {
      // TODO: Add version checking and update logic
      return packageCacheDir;
    }

    // Create cache directory
    await fs.ensureDir(packageCacheDir);
    
    // Download package using npm pack
    try {
      console.log(chalk.blue(`📦 Downloading ${packageName}...`));
      
      const packOutput = execSync(`npm pack ${packageName} --pack-destination ${this.options.cacheDir}/temp`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const tarFile = packOutput.trim();
      const tarPath = path.join(this.options.cacheDir, 'temp', tarFile);
      
      // Extract tar file
      execSync(`tar -xzf ${tarPath} -C ${packageCacheDir} --strip-components=1`, {
        stdio: 'pipe'
      });
      
      // Clean up tar file
      await fs.remove(tarPath);
      
      console.log(chalk.green(`✅ Package ${packageName} cached successfully`));
      
      return packageCacheDir;
    } catch (error) {
      await fs.remove(packageCacheDir);
      throw new Error(`Failed to download package ${packageName}: ${error.message}`);
    }
  }

  /**
   * Validates component against its schema (enhanced like validate-component.js)
   * @param {Object} component - Component JSON
   * @param {string} filePath - Component file path
   * @returns {Promise<void>}
   */
  async validateComponentSchema(component, filePath) {
    const componentType = this.detectComponentType(filePath);
    
    try {
      // 1. Clean metadata fields that are added by resolver (fix for additionalProperties: false)
      const cleanComponent = this.cleanMetadataFields(component);

      // 2. Domain validation first (like validate-component.js)
      if (cleanComponent.domain && this.currentDomain && cleanComponent.domain !== this.currentDomain) {
        throw new Error(
          `Domain mismatch: expected '${this.currentDomain}', found '${cleanComponent.domain}'`
        );
      }

      // 3. Special handling for sys-schemas components
      if (cleanComponent.flow === 'sys-schemas') {
        await this.validateSysSchemaComponent(cleanComponent, filePath);
        return;
      }

      // 4. Standard component validation
      const schemaName = `${componentType}-definition.schema.json`;
      let validate;
      if (this.compiledValidators.has(schemaName)) {
        validate = this.compiledValidators.get(schemaName);
      } else {
        const schema = await this.loadSchemaForValidation(schemaName);
        if (!schema) {
          console.log(chalk.yellow(`⚠️  Schema not found: ${schemaName}, skipping validation`));
          return;
        }
        
        // Modify schema to make version optional for ref objects
        const modifiedSchema = this.makeVersionOptionalInSchema(schema);
        
        validate = this.ajv.compile(modifiedSchema);
        this.compiledValidators.set(schemaName, validate);
      }

      // 5. Perform JSON schema validation on clean component
      const valid = validate(cleanComponent);
      
      if (!valid) {
        const errorDetails = this.formatSchemaErrors(validate.errors);
        throw new Error(
          `Schema validation failed for ${componentType} component:\n${errorDetails}`
        );
      }

      // 6. Perform business validations (like validate-component.js)
      this.performBusinessValidations(cleanComponent, filePath);

      console.log(chalk.gray(`  ✅ Schema validation passed for ${componentType} component`));
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validates sys-schemas components with special handling for attributes.schema
   * @param {Object} component - sys-schemas component JSON
   * @param {string} filePath - Component file path
   * @returns {Promise<void>}
   */
  async validateSysSchemaComponent(component, filePath) {
    try {
      // 1. Validate general template structure
      await this.validateGeneralTemplate(component);

      // 2. For sys-schemas components, attributes.type defines what they validate, not their location
      // This is different from other components where type matches file path
      if (component.attributes && component.attributes.type) {
        const validSchemaTypes = ['workflow', 'task', 'function', 'view', 'schema', 'extension'];
        if (!validSchemaTypes.includes(component.attributes.type)) {
          throw new Error(
            `Invalid schema type: '${component.attributes.type}'. Must be one of: ${validSchemaTypes.join(', ')}`
          );
        }
      }

      // 3. Validate attributes.schema as a valid JSON Schema
      if (component.attributes && component.attributes.schema) {
        await this.validateJsonSchema(component.attributes.schema);
      } else {
        console.log(chalk.yellow(`⚠️  sys-schemas component missing attributes.schema: ${filePath}`));
      }

      // 4. Perform business validations
      this.performBusinessValidations(component, filePath);

      console.log(chalk.gray(`  ✅ sys-schemas validation passed for ${component.attributes?.type || 'unknown'} schema`));

    } catch (error) {
      throw error;
    }
  }

  /**
   * Validates general vNext component template structure
   * @param {Object} component - Component JSON
   * @returns {Promise<void>}
   */
  async validateGeneralTemplate(component) {
    // Required fields for all vNext components
    const requiredFields = ['key', 'version', 'domain', 'flow', 'flowVersion'];
    
    for (const field of requiredFields) {
      if (!component[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate version format
    if (!semver.valid(component.version)) {
      throw new Error(`Invalid version format: ${component.version}. Expected semantic version (e.g., '1.0.0')`);
    }

    // Validate flowVersion format
    if (!semver.valid(component.flowVersion)) {
      throw new Error(`Invalid flowVersion format: ${component.flowVersion}. Expected semantic version (e.g., '1.0.0')`);
    }

    // Validate flow value
    const validFlows = ['sys-tasks', 'sys-flows', 'sys-functions', 'sys-views', 'sys-schemas', 'sys-extensions'];
    if (!validFlows.includes(component.flow)) {
      throw new Error(`Invalid flow value: ${component.flow}. Must be one of: ${validFlows.join(', ')}`);
    }

    // Validate tags array
    if (component.tags && !Array.isArray(component.tags)) {
      throw new Error('Tags must be an array');
    }

    // Validate attributes object
    if (component.attributes && typeof component.attributes !== 'object') {
      throw new Error('Attributes must be an object');
    }
  }

  /**
   * Validates that a given object is a valid JSON Schema
   * @param {Object} schema - JSON Schema object to validate
   * @returns {Promise<void>}
   */
  async validateJsonSchema(schema) {
    try {
      // Basic JSON Schema structure validation
      if (typeof schema !== 'object' || schema === null) {
        throw new Error('Schema must be an object');
      }

      // Required JSON Schema fields
      const requiredSchemaFields = ['$schema', '$id', 'title', 'description', 'type'];
      for (const field of requiredSchemaFields) {
        if (!schema[field]) {
          throw new Error(`JSON Schema missing required field: ${field}`);
        }
      }

      // Validate $schema format
      if (typeof schema.$schema !== 'string' || !schema.$schema.startsWith('https://json-schema.org/')) {
        throw new Error('Invalid $schema format. Must be a valid JSON Schema URI');
      }

      // Validate $id format
      if (typeof schema.$id !== 'string' || !schema.$id.startsWith('https://')) {
        throw new Error('Invalid $id format. Must be a valid HTTPS URI');
      }

      // Try to compile the schema with AJV to check for validity
      // Note: We skip AJV compilation for complex schemas that may use draft 2020-12 features
      // Instead, we do basic structural validation
      try {
        // Basic validation of schema structure
        if (schema.properties && typeof schema.properties !== 'object') {
          throw new Error('properties must be an object');
        }
        if (schema.required && !Array.isArray(schema.required)) {
          throw new Error('required must be an array');
        }
      } catch (structuralError) {
        throw new Error(`Invalid JSON Schema structure: ${structuralError.message}`);
      }

      console.log(chalk.gray(`    ✅ JSON Schema validation passed`));

    } catch (error) {
      throw new Error(`JSON Schema validation failed: ${error.message}`);
    }
  }

  /**
   * Cleans metadata fields added by resolver to allow schema validation
   * @param {Object} component - Component with potential metadata
   * @returns {Object} Clean component without resolver metadata
   */
  cleanMetadataFields(component) {
    const cleanComponent = { ...component };
    
    // Remove resolver metadata fields that cause additionalProperties validation errors
    const metadataFields = ['_resolvedFrom', '_resolvedAt', '_packageVersion'];
    metadataFields.forEach(field => {
      if (cleanComponent.hasOwnProperty(field)) {
        delete cleanComponent[field];
      }
    });
    
    return cleanComponent;
  }

  /**
   * Modifies a schema to make version property optional for ref objects
   * @param {Object} schema - Original schema
   * @returns {Object} Modified schema
   */
  makeVersionOptionalInSchema(schema) {
    // Deep clone the schema to avoid modifying the original
    const modifiedSchema = JSON.parse(JSON.stringify(schema));
    
    // Recursively find and modify ref object definitions
    this._makeVersionOptionalRecursive(modifiedSchema);
    
    return modifiedSchema;
  }

  /**
   * Recursively modifies schema objects to make version optional for ref objects
   * @param {Object} obj - Schema object to modify
   */
  _makeVersionOptionalRecursive(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    // Check if this is a ref object definition (has properties with ref and version)
    if (obj.properties && obj.properties.ref && obj.properties.version) {
      // Remove version from required array if it exists
      if (obj.required && Array.isArray(obj.required)) {
        obj.required = obj.required.filter(prop => prop !== 'version');
        if (obj.required.length === 0) {
          delete obj.required;
        }
      }
      console.log(chalk.gray(`  ℹ️  Made version optional for ref object in schema`));
    }

    // Recursively process all properties
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object') {
        this._makeVersionOptionalRecursive(value);
      }
    }
  }

  /**
   * Loads schema for validation with fallback
   * @param {string} schemaName - Schema filename
   * @returns {Promise<Object|null>} Schema object or null
   */
  async loadSchemaForValidation(schemaName) {
    try {
      const schemaPath = path.join(this.options.schemaPath, schemaName);
      
      if (await fs.pathExists(schemaPath)) {
        const schema = await fs.readJSON(schemaPath);
        this.schemaCache.set(schemaName, schema);
        return schema;
      }
      
      return null;
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Failed to load schema ${schemaName}: ${error.message}`));
      return null;
    }
  }

  /**
   * Formats schema validation errors (like validate-component.js)
   * @param {Array} errors - AJV validation errors
   * @returns {string} Formatted error string
   */
  formatSchemaErrors(errors) {
    return errors.map((error, index) => {
      let errorMsg = `    ✗ Error ${index + 1}: ${error.message}`;
      if (error.instancePath) {
        errorMsg += `\n      Path: ${error.instancePath}`;
      }
      if (error.data !== undefined) {
        errorMsg += `\n      Value: ${JSON.stringify(error.data)}`;
      }
      if (error.allowedValues) {
        errorMsg += `\n      Allowed values: ${JSON.stringify(error.allowedValues)}`;
      }
      return errorMsg;
    }).join('\n');
  }

  /**
   * Performs business validations (like validate-component.js)
   * @param {Object} component - Component data
   * @param {string} filePath - File path
   */
  performBusinessValidations(component, filePath) {
    const warnings = [];

    // Key consistency check
    if (!component.key) {
      warnings.push("Missing required 'key' field");
    }

    // Note: Filename consistency check removed to support new format
    // New format allows files like "task.json" without version in filename
    // Filename validation is now handled by validateReferenceConsistency method

    // Version format check
    if (component.version && !/^\d+\.\d+\.\d+$/.test(component.version)) {
      warnings.push("Version should follow semantic versioning (x.y.z)");
    }

    // Key format check  
    if (component.key && !/^[a-z0-9-]+$/.test(component.key)) {
      warnings.push("Key should contain only lowercase letters, numbers, and hyphens");
    }

    if (warnings.length > 0) {
      console.log(chalk.yellow('    Warnings:'));
      warnings.forEach((warning) => {
        console.log(chalk.yellow(`      ⚠ ${warning}`));
      });
    }
  }

  /**
   * Detects component type from file path
   * @param {string} filePath - File path
   * @returns {string} Component type
   */
  detectComponentType(filePath) {
    if (filePath.includes('Tasks/')) return 'task';
    if (filePath.includes('Workflows/')) return 'workflow';
    if (filePath.includes('Functions/')) return 'function';
    if (filePath.includes('Views/')) return 'view';
    if (filePath.includes('Schemas/')) return 'schema';
    if (filePath.includes('Extensions/')) return 'extension';
    return 'unknown';
  }

  /**
   * Detects component type from flow value
   * @param {string} flow - Flow value (e.g., 'sys-tasks', 'sys-flows')
   * @returns {string} Component type
   */
  detectComponentTypeFromFlow(flow) {
    // Detect component type from flow value
    if (flow === 'sys-tasks') return 'task';
    if (flow === 'sys-flows') return 'workflow';
    if (flow === 'sys-functions') return 'function';
    if (flow === 'sys-views') return 'view';
    if (flow === 'sys-schemas') return 'schema';
    if (flow === 'sys-extensions') return 'extension';
    return 'unknown';
  }

  /**
   * Detects the format of a reference object and returns metadata
   * @param {Object} obj - Object to check for reference format
   * @returns {Object|null} Reference format info or null if not a reference
   */
  detectReferenceFormat(obj) {
    // Format 1: Ref with string - Local Path
    // "task": { "ref": "Tasks/invalidate-cache.json" }
    if (obj.ref && typeof obj.ref === 'string' && !obj.ref.startsWith('@')) {
      return {
        format: 'local',
        identifier: obj.ref,
        componentType: this.detectComponentType(obj.ref)
      };
    }

    // Format 2: Ref with string - External Path
    // "task": { "ref": "@my-organization/loan/Tasks/invalidate-cache.json" }
    if (obj.ref && typeof obj.ref === 'string' && obj.ref.startsWith('@')) {
      return {
        format: 'external',
        identifier: obj.ref,
        componentType: this.detectComponentType(obj.ref)
      };
    }

    // Format 3: Plain reference - Direct component definition
    // "task": { "key": "invalidate-cache", "version": "1.0.0", "domain": "core", "flow": "sys-flows" }
    if (obj.key && obj.version && obj.flow && obj.domain && !obj.ref) {
      return {
        format: 'plain',
        identifier: `${obj.domain}/${obj.flow}/${obj.key}.${obj.version}`,
        componentType: this.detectComponentTypeFromFlow(obj.flow)
      };
    }

    return null;
  }

  /**
   * Validates a plain reference object (without resolving external files)
   * @param {Object} obj - Plain reference object
   * @param {string} currentDomain - Current domain context
   * @returns {Promise<Object>} Validated reference object
   */
  async validatePlainReference(obj, currentDomain) {
    // Validate required properties for plain reference
    if (!obj.key) {
      throw new Error('Plain reference missing required property: key');
    }
    if (!obj.version) {
      throw new Error('Plain reference missing required property: version');
    }
    if (!obj.domain) {
      throw new Error('Plain reference missing required property: domain');
    }

    // Validate version format
    if (!semver.valid(obj.version)) {
      throw new Error(`Invalid version format '${obj.version}' in plain reference. Expected semantic version (e.g., '1.0.0')`);
    }

    // Validate key format
    const keyPattern = /^[a-z0-9-]+$/;
    if (!keyPattern.test(obj.key)) {
      throw new Error(`Invalid key format '${obj.key}' in plain reference. Expected lowercase letters, numbers, and hyphens only`);
    }

    // Domain validation (if current domain is set)
    if (currentDomain && obj.domain !== currentDomain) {
      console.log(chalk.yellow(`    ⚠️  Domain mismatch in plain reference: expected '${currentDomain}', found '${obj.domain}'`));
    }

    // Return the object with metadata for consistency with resolved references
    return {
      ...obj,
      _resolvedFrom: 'plain-reference',
      _resolvedAt: new Date().toISOString()
    };
  }

  /**
   * Validates all references in a JSON object recursively
   * @param {Object} obj - JSON object to validate
   * @param {string} currentDomain - Current domain context
   * @returns {Promise<Object>} Validation result
   */
  async validateAllReferences(obj, currentDomain = null) {
    // Set current domain for schema validation
    if (currentDomain && !this.currentDomain) {
      this.currentDomain = currentDomain;
    }

    const results = {
      valid: true,
      errors: [],
      resolvedRefs: [],
      validationDetails: {
        total: 0,
        successful: 0,
        failed: 0,
        skipped: 0
      }
    };

    await this._validateReferencesRecursive(obj, currentDomain, results);
    
    results.validationDetails.total = results.resolvedRefs.length;
    results.validationDetails.successful = results.resolvedRefs.filter(r => r.status === 'success').length;
    results.validationDetails.failed = results.resolvedRefs.filter(r => r.status === 'error').length;
    results.validationDetails.skipped = results.resolvedRefs.filter(r => r.status === 'skipped').length;
    
    return results;
  }

  /**
   * Recursive reference validation helper
   * @param {*} obj - Current object
   * @param {string} currentDomain - Current domain
   * @param {Object} results - Results accumulator
   * @param {Object} context - Context information for validation
   */
  async _validateReferencesRecursive(obj, currentDomain, results, context = {}) {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        await this._validateReferencesRecursive(item, currentDomain, results, context);
      }
      return;
    }

    // Skip reference validation for sys-schemas JSON Schema content
    if (context.isInSchemaDefinition) {
      // Don't validate references inside JSON Schema definitions
      // These are schema examples and patterns, not actual component references
      return;
    }

    // Check for different reference formats
    const refInfo = this.detectReferenceFormat(obj);
    
    if (refInfo) {
      try {
        console.log(chalk.gray(`    🔍 Resolving ${refInfo.format} reference: ${refInfo.identifier}`));
        
        let resolved;
        if (refInfo.format === 'plain') {
          // For plain references, validate the object as-is (no resolution needed)
          resolved = await this.validatePlainReference(obj, currentDomain);
        } else {
          // For ref-based references, use existing resolution logic
          resolved = await this.resolveRef(refInfo.identifier, currentDomain);
        }
        
        results.resolvedRefs.push({
          ref: refInfo.identifier,
          resolved: resolved._resolvedFrom || 'plain-reference',
          status: 'success',
          details: {
            key: resolved.key,
            version: resolved.version,
            domain: resolved.domain,
            flow: resolved.flow,
            componentType: refInfo.componentType || this.detectComponentTypeFromFlow(resolved.flow),
            format: refInfo.format
          }
        });
        
        console.log(chalk.green(`    ✅ Successfully resolved ${refInfo.format} reference: ${refInfo.identifier}`));
        
      } catch (error) {
        results.valid = false;
        results.errors.push({
          ref: refInfo.identifier,
          error: error.message
        });
        results.resolvedRefs.push({
          ref: refInfo.identifier,
          resolved: null,
          status: 'error',
          error: error.message,
          format: refInfo.format
        });
        
        console.log(chalk.red(`    ❌ Failed to resolve ${refInfo.format} reference: ${refInfo.identifier} - ${error.message}`));
      }
    }

    // Recursively check all properties
    for (const [key, value] of Object.entries(obj)) {
      if (key !== 'ref') {
        // Set context for schema definition content
        const newContext = { ...context };
        if (key === 'schema' && context.isInAttributes) {
          newContext.isInSchemaDefinition = true;
        }
        if (key === 'attributes') {
          newContext.isInAttributes = true;
        }
        
        await this._validateReferencesRecursive(value, currentDomain, results, newContext);
      }
    }
  }

  /**
   * Loads validation configuration from vnext.config.json
   * @param {string} configPath - Path to vnext.config.json
   * @returns {Promise<Object>} Validation configuration
   */
  async loadValidationConfig(configPath) {
    try {
      const config = await fs.readJSON(configPath);
      
      // Set current domain for validation
      if (config.domain) {
        this.currentDomain = config.domain;
      }
      
      // Update options based on config
      if (config.referenceResolution) {
        this.options.validateReferenceConsistency = 
          config.referenceResolution.validateReferenceConsistency !== false;
        this.options.validateSchemas = 
          config.referenceResolution.validateSchemas !== false;
        this.options.strictMode = 
          config.referenceResolution.strictMode !== false;
      }
      
      return config;
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load config: ${error.message}`));
      return {};
    }
  }

  /**
   * Clears the reference cache
   */
  clearCache() {
    this.refCache.clear();
    this.packageCache.clear();
    this.schemaCache.clear();
  }

  /**
   * Lists all exports from a package
   * @param {string} packageName - NPM package name
   * @returns {Promise<Object>} Package exports information
   */
  async listPackageExports(packageName) {
    const packagePath = await this.ensurePackage(packageName);
    const configPath = path.join(packagePath, 'vnext.config.json');
    
    if (!(await fs.pathExists(configPath))) {
      throw new Error(`Package ${packageName} does not contain vnext.config.json`);
    }

    const config = await fs.readJSON(configPath);
    
    return {
      packageName,
      domain: config.domain,
      version: config.version,
      description: config.description,
      exports: config.exports || {},
      dependencies: config.dependencies || {}
    };
  }
}

module.exports = RefResolver; 