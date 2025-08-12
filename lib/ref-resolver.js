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
    const expectedPattern = `${content.key}.${content.version}`;
    
    if (filename !== expectedPattern) {
      throw new Error(
        `Reference consistency validation failed for '${ref}': ` +
        `filename '${filename}' does not match component key '${content.key}' and version '${content.version}'. ` +
        `Expected filename: '${expectedPattern}.json'`
      );
    }

    // Validate version format
    if (!semver.valid(content.version)) {
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

    // Additional version consistency check
    if (parsedRef.version && parsedRef.version !== content.version) {
      throw new Error(
        `Reference consistency validation failed for '${ref}': ` +
        `filename version '${parsedRef.version}' does not match content version '${content.version}'`
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
   * @param {string} filename - Filename like "task-invalidate-cache.1.0.0.json"
   * @returns {string|null} Version string
   */
  extractVersionFromFilename(filename) {
    const match = filename.match(/\.(\d+\.\d+\.\d+)\.json$/);
    return match ? match[1] : null;
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
    const schemaName = `${componentType}-definition.schema.json`;
    
    try {
      // 1. Clean metadata fields that are added by resolver (fix for additionalProperties: false)
      const cleanComponent = this.cleanMetadataFields(component);

      // 2. Domain validation first (like validate-component.js)
      if (cleanComponent.domain && this.currentDomain && cleanComponent.domain !== this.currentDomain) {
        throw new Error(
          `Domain mismatch: expected '${this.currentDomain}', found '${cleanComponent.domain}'`
        );
      }

      // 3. Load and compile schema with caching
      let validate;
      if (this.compiledValidators.has(schemaName)) {
        validate = this.compiledValidators.get(schemaName);
      } else {
        const schema = await this.loadSchemaForValidation(schemaName);
        if (!schema) {
          console.log(chalk.yellow(`⚠️  Schema not found: ${schemaName}, skipping validation`));
          return;
        }
        
        validate = this.ajv.compile(schema);
        this.compiledValidators.set(schemaName, validate);
      }

      // 4. Perform JSON schema validation on clean component
      const valid = validate(cleanComponent);
      
      if (!valid) {
        const errorDetails = this.formatSchemaErrors(validate.errors);
        throw new Error(
          `Schema validation failed for ${componentType} component:\n${errorDetails}`
        );
      }

      // 5. Perform business validations (like validate-component.js)
      this.performBusinessValidations(cleanComponent, filePath);

      console.log(chalk.gray(`  ✅ Schema validation passed for ${componentType} component`));
      
    } catch (error) {
      throw error;
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

    // Filename consistency check
    const fileName = path.basename(filePath, '.json');
    if (component.key && component.version) {
      const expectedFileName = `${component.key}.${component.version}`;
      if (fileName !== expectedFileName) {
        warnings.push(
          `Filename inconsistency: expected '${expectedFileName}.json', found '${fileName}.json'`
        );
      }
    }

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
   */
  async _validateReferencesRecursive(obj, currentDomain, results) {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        await this._validateReferencesRecursive(item, currentDomain, results);
      }
      return;
    }

    // Check for ref property
    if (obj.ref && typeof obj.ref === 'string') {
      try {
        console.log(chalk.gray(`    🔍 Resolving reference: ${obj.ref}`));
        
        const resolved = await this.resolveRef(obj.ref, currentDomain);
        results.resolvedRefs.push({
          ref: obj.ref,
          resolved: resolved._resolvedFrom,
          status: 'success',
          details: {
            key: resolved.key,
            version: resolved.version,
            domain: resolved.domain,
            componentType: this.detectComponentType(obj.ref)
          }
        });
        
        console.log(chalk.green(`    ✅ Successfully resolved: ${obj.ref}`));
        
      } catch (error) {
        results.valid = false;
        results.errors.push({
          ref: obj.ref,
          error: error.message
        });
        results.resolvedRefs.push({
          ref: obj.ref,
          resolved: null,
          status: 'error',
          error: error.message
        });
        
        console.log(chalk.red(`    ❌ Failed to resolve: ${obj.ref} - ${error.message}`));
      }
    }

    // Recursively check all properties
    for (const [key, value] of Object.entries(obj)) {
      if (key !== 'ref') {
        await this._validateReferencesRecursive(value, currentDomain, results);
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